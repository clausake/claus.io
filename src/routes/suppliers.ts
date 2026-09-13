// Routes : Fournisseurs + prévisions/ordres d'achat
import { Router } from "express";
import type { Database } from "sqlite";
import { requireString, optionalString, requireArray } from "../middleware/validate.js";
import { jugerLignesDeDocument } from "../shared/document-items.js";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/suppliers", async (req, res) => {
try {
  const suppliers = await db.all(
    "SELECT * FROM suppliers ORDER BY name ASC",
  );
  res.json(suppliers);
} catch (error) {
  console.error("Error fetching suppliers:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch suppliers" });
}
});
router.get("/api/purchasing/forecast", async (req, res) => {
try {
  const inventory: InvRow[] = await db.all("SELECT * FROM inventory");
  const prices: PriceRow[] = await db.all(
    "SELECT * FROM inventory_prices ORDER BY updated_at DESC",
  );

  // Les ajouts « manuels » de la vue Inventaire arrivent en ?ids=. Le serveur
  // les ignorait : la vue les affichait neanmoins avec l'etiquette « Saisie
  // Manuelle », ce qui faisait croire au cuisinier qu'ils etaient commandes
  // alors qu'ils n'etaient dans aucun bon. Le filtre est maintenant d'honneteur.
  const manualIds = parseIdList(req.query.ids);
  let wanted: Set<string> | null = null;
  if (manualIds.length > 0) {
    const marks = manualIds.map(() => "?").join(",");
    const found: Array<{ id: string }> = await db.all(
      `SELECT id FROM inventory WHERE id IN (${marks})`,
      manualIds,
    );
    wanted = new Set(found.map((f) => f.id));
  }

  const today = localIsoDay();
  const horizon = (() => {
    const n = Number(req.query.horizon);
    return Number.isFinite(n) && n >= 0 && n <= 90 ? Math.floor(n) : 14;
  })();

  // Besoin REEL : couverts planifies x gramature par personne, rendementpres.
  // Une seule requete agregee sert toutes les lignes (pas de boucle N+1).
  const needs = await computeRecipeNeed(db, today, horizon);

  const priceByItem = new Map<string, PriceRow[]>();
  for (const p of prices) {
    const list = priceByItem.get(p.inventory_id);
    if (list) list.push(p);
    else priceByItem.set(p.inventory_id, [p]);
  }

  const forecast = inventory
    .filter((item) => (wanted ? wanted.has(item.id) : true))
    .map((item) => {
      const history = (priceByItem.get(item.id) || []).map((p) => ({
        price: p.price,
        date: p.updated_at,
      }));
      return {
        inventory_id: item.id,
        name: item.name,
        quantity: item.quantity,
        minStock: item.minStock,
        unit: item.unit,
        unit_price: item.unit_price || 0,
        yield_percent: item.yield_percent === undefined ? 100 : item.yield_percent,
        price_history: history,
        besoin_recettes: needs[item.id] === undefined ? 0 : needs[item.id],
        manual: wanted ? wanted.has(item.id) : false,
      };
    });

  // `items` + `window` au lieu du tableau nu : la vue lisait un tableau, elle
  // lit desormais un objet. Le `window` est la piece qui rend le chiffre
  // verifiable : « besoin sur 14 jours des le 2026-09-10 » et non un nombre sans
  // origine. Les deux champs restent sous le contrat verifie par le test e2e.
  res.json({ items: forecast, window: { from: today, horizon } });
} catch (error) {
  console.error("Error fetching purchasing forecast:", error);
  res.status(500).json({
    status: "error",
    message: "Failed to fetch purchasing forecast",
  });
}
});
router.post("/api/purchasing/order", async (req, res) => {
try {
  if (!requireArray(req, res, "items")) return;
  const { items, supplier } = req.body;
  const supplierVal = optionalString(req, "supplier", 200) || "";
  const documentId = Date.now().toString();

  // -- Le contrat de la cle ecrite ------------------------------------------
  // L'UI envoyait `inventory_id: <nom de l'article>` : le document se cree, son
  // detail se cree, tout est VERT, et la jointure d'inventaire est creuse. Le
  // jour ou quelqu'un valide ce document, l'UPDATE ... WHERE id = <nom> ne
  // touce AUCUNE ligne sans la moindre erreur : un bon de commande qui ne peut
  // pas rentrer en stock n'est pas un bon de commande, c'est un PDF.
  // Chaque ligne est donc resolue contre inventory ICI, et une ligne qui ne
  // resolve pas fait rougir la requete au lieu de passer en silence.
  //
  // DES LIGNES, LA MEME PREDICAT QUE LA FACTURE (Sprint 9). Cette route est la
  // SECONDE porte d'ecriture de `document_items` : elle ecrit les MEMES
  // colonnes (quantity, unit_price, original_name) et debouche sur le MEME
  // lecteur — `POST /api/purchasing/orders/:id/receive`, qui fait
  // `UPDATE inventory SET quantity = quantity + ? WHERE id = ?` et le solde de
  // cloture. Or elle avait TROIS trous que la porte de la facture neavait pas :
  //   1. `Number.isFinite(qty) && qty > 0 ? qty : 0`  -> un TEXTE, un NEGATIF
  //      ou un `null` non serialisee DEVENAIT UN 0. Un bon partiellement a 0 €
  //      s'IMPRIME et part chez le fournisseur (handleCreateOrder appelle
  //      `doc.save()` sur le resultat). C'est le defaut I3 de l'import de
  //      mercuriale (`Number(raw) || 0`), sous une autre ecriture : le nombre
  //      fabrique, jamais l'absence nommee.
  //   2. `Number(item?.quantity)` ne lisait PAS la virgule decimale (0,5 ->
  //      NaN -> 0) alors que la facture, elle, la recoit.
  //   3. `unknown.push(String(item?.name ?? "(vide)"))` ne disait NI l'index NI
  //      la raison: « votre cellule n'est pas un montant » et « cet article
  //      n'existe plus » ne se corrigent pas de la meme main.
  // La difference de SEMANTIQUE est assumée et non supprimee : ici une clef
  // absente est une FAUTE (un bon sans clef est receptionnable par personne et
  // bloque la cloture pour toujours), alors que pour la facture c'est une
  // PROPOSITION libre. D'ou les options explicites, lues a l'ecran du module.
  const { ecrites: cleaned, rejetees } = await jugerLignesDeDocument(db, items, {
    exigerClef: true,
    quantiteMin: 1e-9,
    prixIndefendable: "rejeter",
  });
  // Le compte-rendu que l'UI de Purchasking ne lit PAS (handleCreateOrder fait
  // un `await fetch(...)` sans meme regarder la reponse): les raisons restent
  // donc dans le corps de reponse POUR le log serveur et pour tout client qui
  // les demande. `unknown_items` est CONSERVE (c'est le contrat juge par le
  // test G de purchasing-chain.spec.ts) et nourri par les motifs du nouveau
  // jugeur: le garde existant ne devient pas un PASS creux sous le nouveau.
  const unknown: string[] = rejetees.map(
    (r) => `${r.index}:${r.raison}:${r.nom ?? "(sans nom)"}`,
  );
  if (cleaned.length === 0) {
    return res.status(400).json({
      status: "error",
      message:
        "Aucun article du bon ne correspond a un article de l'inventaire",
      unknown_items: unknown,
      rejetees,
    });
  }

  // Le total est la SOMME qui s'IMPRIME sur le bon: il se lit donc sur le
  // nombre VERIFIE, et une ligne sans tarif y entre a 0 explicitement (le
  // comportement historique) avec un temoin NOMME — pas par un `|| 0` qui
  // confond un texte, un negatif et une absence.
  const sansTarif = cleaned.filter((l) => l.unit_price === null).length;
  const totalAmount = cleaned.reduce(
    (sum, it) => sum + it.quantity * (it.unit_price ?? 0),
    0,
  );
  await db.run(
    "INSERT INTO documents (id, type, supplier, date, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)",
    [
      documentId,
      "COMMANDE",
      supplierVal,
      new Date().toISOString(),
      totalAmount,
      "PENDING",
    ],
  );
  for (const it of cleaned) {
    // Le nom ECIT est le nom REEL de l'article (`nom_resolu`), pas le nom
    // SAISI: l'UI de Purchasking envoie un nom TRADUIT dans la langue du chef
    // (translateIngredient), et le bon s'IMPRIME puis se receptionne a la main
    // contre l'inventaire. Le comportement historique etait celui-la
    // (`original_name: inv.name`) et il est conserve — le module partage rend
    // les DEUX sans trancher a la place de la route.
    await db.run(
      "INSERT INTO document_items (id, document_id, inventory_id, original_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)",
      [
        Date.now().toString() + Math.random().toString(36).substring(2, 7),
        documentId,
        it.inventory_id,
        it.nom_resolu ?? it.original_name,
        it.quantity,
        it.unit_price,
      ],
    );
  }
  res.json({
    status: "success",
    documentId,
    total_amount: totalAmount,
    lines: cleaned.length,
    unknown_items: unknown,
    // Une ligne SANS TARIF entre a 0 dans le total imprime: c'est le
    // comportement historique, mais il devient NOMME (le defaut I3 etait
    // precisement un 0 non nomme).
    lignes_sans_tarif: sansTarif,
    rejetees,
  });
} catch (error) {
  console.error("Error creating order:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to create order" });
}
});

// -- Bons en attente + reception ----------------------------------------------
// La chaine s'arretait au PDF : un bon cree ne pouvait JAMAIS devenir du stock.
// Le cuisinier imprimait, rangeait, et doit ressaisir la factrure dans l'autre
// vue pour que le stock bouge. Ces deux routes ferment la boucle.
router.get("/api/purchasing/orders", async (req, res) => {
try {
  // Le filtre vient de l'URL : il ne passe PAS par optionalString (qui lit
  // req.body, donc toujours undefined sur une GET). Sans Whitelist, un statut
  // invente ferait partir d'un WHERE inoffensif mais faux.
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "";
  const status = /^[A-Z_]{1,20}$/i.test(rawStatus) ? rawStatus.toUpperCase() : "";
  const params: string[] = ["COMMANDE"];
  let where = "WHERE d.type = ?";
  if (status) {
    where += " AND d.status = ?";
    params.push(status);
  }
  const docs: DocRow[] = await db.all(
    `SELECT d.* FROM documents d ${where} ORDER BY d.date DESC LIMIT 200`,
    params,
  );
  for (const doc of docs) {
    doc.items = await db.all(
      // ⚠ `in_stock` est la colonne qui dit la verite metier, et non
      // `inventory_id IS NULL`. Une cle PEUT etre posee (le bon a ete cree quand
      // l'article existait) et ne plus rien resoudre depuis : l'article a ete
      // retire de l'inventaire depuis la commande. Dans ce cas `inventory_id` est
      // plein, `COALESCE(i.name, ...)` rend meme un nom, et tout a l'air normal —
      // alors que l'UPDATE de la reception ne touchera 0 ligne. C'est exactement
      // le « le bon ne peut pas rentrer en stock » que l'operateur doit voir AVANT
      // la livraison. On le juge sur l'EXISTENCE de la ligne jointe (i.id), pas
      // sur la presence de la cle.
      `SELECT di.*,
              COALESCE(i.name, di.original_name) AS inventory_name,
              i.unit,
              (i.id IS NOT NULL) AS in_stock
         FROM document_items di
         LEFT JOIN inventory i ON di.inventory_id = i.id
        WHERE di.document_id = ?`,
      [doc.id],
    );
  }
  res.json(docs);
} catch (error) {
  console.error("Error fetching purchase orders:", error);
  res.status(500).json({ status: "error", message: "Failed to fetch orders" });
}
});

// Reception (totale ou ligne par ligne). Les quantites recues s'AJOUTENT au
// stock, a l'image de la validation de factrure.
//
// ⚠ Ce que la reception NE fait PAS : elle n'ecrit ni unit_price ni
// supplier_prices. Le prix est la verite de la FACTURE, pas celle du bon — les
// deux voies se battaient le meme champ, la derniere gagnerait la guerre, et
// un bon au prix mal saisi fausserait le cout matiere pour des mois. La
// réception ne porte donc que sur la quantite et l'etat.
router.post("/api/purchasing/orders/:id/receive", async (req, res) => {
try {
  const doc: { id: string; type: string; status: string } | undefined =
    await db.get("SELECT id, type, status FROM documents WHERE id = ?", [
      req.params.id,
    ]);
  if (!doc)
    return res
      .status(404)
      .json({ status: "error", message: "Order not found" });
  if (doc.type !== "COMMANDE")
    return res.status(409).json({
      status: "error",
      message: "Seul un bon de commande se receptionne",
    });

  const items: ItemRow[] = await db.all(
    "SELECT * FROM document_items WHERE document_id = ?",
    [req.params.id],
  );
  if (items.length === 0)
    return res.status(409).json({
      status: "error",
      message: "Bon vide : rien a receptionner",
    });

  // Les quantites demandees viennent de l'UI (colonne editable). Elles sont
  // bornées par la quantite commandee : on ne recoit pas deux fois la meme
  // marchandise en un seul coup de clic.
  const requested = Array.isArray(req.body?.received) ? req.body.received : [];
  const byItemId = new Map<string, number>();
  for (const r of requested) {
    const id = typeof r?.document_item_id === "string" ? r.document_item_id : "";
    const q = Number(r?.quantity);
    if (id && Number.isFinite(q) && q >= 0) byItemId.set(id, q);
  }

  let receivedLines = 0;
  for (const it of items) {
    const ordered = Math.abs(Number(it.quantity) || 0);
    const already = Math.abs(Number(it.received_quantity) || 0);
    // Idempotence : une ligne deja receptionnee en totalite ne doit PAS etre
    // recomptee. Sans ce garde, un double-clic sur « Receptionner » (ou un retry
    // du reseau) fausse le stock de deux fois la quantite commandee — et le
    // statut RESTE 'RECEIVED', donc rien ne rougit a l'ecran ni dans les logs.
    // C'est exactement la classe de defaut que les sondeurs de ce projet chassent.
    if (ordered > 0 && already >= ordered) continue;
    const asked = byItemId.has(it.id) ? byItemId.get(it.id)! : ordered;
    const qty = Math.min(Math.max(asked, 0), ordered - already);
    if (!it.inventory_id || qty <= 0) continue;

    const inv: { id: string; quantity: number; minStock: number } | undefined =
      await db.get(
        "SELECT id, quantity, minStock FROM inventory WHERE id = ?",
        [it.inventory_id],
      );
    if (!inv) continue; // ligne d'un article retire de l'inventaire depuis la commande

    await db.run("UPDATE inventory SET quantity = quantity + ? WHERE id = ?", [
      qty,
      it.inventory_id,
    ]);
    await db.run(
      "UPDATE document_items SET received_quantity = COALESCE(received_quantity, 0) + ? WHERE id = ?",
      [qty, it.id],
    );

    const after: { quantity: number; minStock: number } | undefined = await db.get(
      "SELECT quantity, minStock FROM inventory WHERE id = ?",
      [it.inventory_id],
    );
    if (after) {
      // Meme regle de statut que la validation de factrure : le stock qui
      // bouge sans que le badge bouge est un stock qui ment.
      let status = "ok";
      if (after.quantity <= 0) status = "critical";
      else if (after.quantity <= after.minStock) status = "low";
      await db.run("UPDATE inventory SET status = ? WHERE id = ?", [
        status,
        it.inventory_id,
      ]);
    }
    receivedLines += 1;
  }

  // Le statut se juge sur le SOLDE CUMULE du bon, et non sur le lot de ce coup
  // de clic : un second appel (double-clic, retry reseau) ne recoit rien
  // (receivedLines = 0) et ne doit donc pas retrograder un bon deja RECEIVED en
  // PARTIAL. Un statut qui se degrade sur un no-op rend l'onglet Reception
  // inutilisable des le premier double-clic.
  const solde: { encore: number; deja: number } | undefined = await db.get(
    // ⚠ `i.id IS NOT NULL` dans le compte des lignes RESTANTES : une ligne dont
    // l'article a quitte l'inventaire depuis la commande ne sera JAMAIS
    // receptionnable (l'UPDATE de stock ne a rien ou joindre). La laisser
    // compte dans le solde, c'est un bon qui reste PARTIAL pour toujours et
    // qu'on ne peut plus cloturer. Elle n'est pas « recue » pour autant : elle
    // reste SIGNALEE a l'ecran (badge « hors inventaire ») et le champ
    // received_quantity y reste vide — le solde jugule seulement la cloture.
    `SELECT
       SUM(CASE WHEN COALESCE(di.received_quantity, 0) <= 0 AND i.id IS NOT NULL
                 THEN 1 ELSE 0 END) AS encore,
       SUM(CASE WHEN COALESCE(di.received_quantity, 0) > 0
                THEN 1 ELSE 0 END) AS deja
       FROM document_items di
       LEFT JOIN inventory i ON di.inventory_id = i.id
      WHERE di.document_id = ?`,
    [req.params.id],
  );
  const unpaid = solde ? Number(solde.encore) || 0 : 0;
  const alreadyDone = solde ? Number(solde.deja) || 0 : 0;
  let nextStatus: string;
  if (unpaid === 0) nextStatus = "RECEIVED";
  else if (alreadyDone > 0) nextStatus = "PARTIAL";
  else nextStatus = doc.status || "PENDING"; // aucun mouvement : on ne touche pas
  await db.run("UPDATE documents SET status = ?, received_at = ? WHERE id = ?", [
    nextStatus,
    new Date().toISOString(),
    req.params.id,
  ]);

  res.json({ status: "success", order_status: nextStatus, received_lines: receivedLines });
} catch (error) {
  console.error("Error receiving order:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to receive order" });
}
});

router.post("/api/suppliers", async (req, res) => {
try {
  if (!requireString(req, res, "name", 200)) return;
  const name = req.body.name;
  const email = optionalString(req, "email", 200) || "";
  const phone = optionalString(req, "phone", 50) || "";
  const id = Date.now().toString();
  await db.run(
    "INSERT INTO suppliers (id, name, email, phone) VALUES (?, ?, ?, ?)",
    [id, name, email, phone],
  );
  res.json({
    id,
    name,
    email,
    phone,
    status: "ACTIVE",
  });
} catch (error) {
  console.error("Error creating supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to create supplier" });
}
});
router.delete("/api/suppliers/:id", async (req, res) => {
try {
  await db.run("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (error) {
  console.error("Error deleting supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to delete supplier" });
}
});
router.put("/api/suppliers/:id", async (req, res) => {
try {
  const { name, email, phone } = req.body;
  await db.run(
    "UPDATE suppliers SET name = ?, email = ?, phone = ? WHERE id = ?",
    [name, email || "", phone || "", req.params.id],
  );
  res.json({
    id: req.params.id,
    name,
    email: email || "",
    phone: phone || "",
    status: "success",
  });
} catch (error) {
  console.error("Error updating supplier:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to update supplier" });
}
});

  return router;
}

interface InvRow {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
  unit: string;
  unit_price: number | null;
  yield_percent: number | null;
}
interface PriceRow {
  inventory_id: string;
  price: number;
  updated_at: string;
}
interface DocRow {
  id: string;
  type: string;
  supplier: string | null;
  date: string | null;
  total_amount: number | null;
  status: string | null;
  received_at?: string | null;
  items?: unknown;
}
interface ItemRow {
  id: string;
  in_stock?: number | boolean;
  document_id: string;
  inventory_id: string | null;
  original_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  received_quantity?: number | null;
}
interface NeedRow {
  inventory_id: string | null;
  recipe_json: string | null;
  quantity_per_person: number | null;
}

// -- Besoin recettes : la seule source de verite de l'approvisionnement -------
// Avant ce correctif, `besoin_recettes` etait recopie `0` pour CHAQUE ligne : la
// colonne « Besoin Recettes » du tableau et la suggestion de commande
// (`minStock - quantity + besoin_recettes`) ne tenaient compte d'AUCUNE recette
// planifiee. Le cuisinier qui prepare le service du lendemain voyait une colonne
// a 0 et commandait a l'oeil : c'etait de l'affichage, pas du metier.
//
// Le besoin sort de ce qui EXISTE dans la base :
//   menu_planning (couverts saisis) -> recipe_ingredients.quantity_per_person
//     -> inventory (rendement d'epeluchage)
// par article : SOMME sur les plats planifies de couverts x qpp / (rendement/100).
//
// Deux conventions de date, chacune decidee par MESURE (scripts/probe-index-forecast.py) :
//  - la FENETRE part d'<aujourd'hui> et non d'un jour seul : le planning se remplit
//    a l'avance (la base du client a ses plats en J+1..J+6 et RIEN au jour du
//    jour) — un besoin calibre sur le seul jour courant commanderait 0 ;
//  - le HORIZON est borne (14 par defaut, `?horizon=`) : sans borne, un planning
//    saisi sur trois semaines commanderait trois semaines de stock d'un coup.
//
// LE FILTRE PORTE DEUX PREDICATS, et c'est un choix mesure :
//   * `date >= ? AND date <= ?` (comparaison binaire sur l'ISO) est SARGABLE : il
//     donne a SQLite un SEARCH sur idx_mp_date. Mesure : 0,055 ms.
//   * `DATE(date) >= DATE(?)` est la forme PRECISE : elle normalise une date
//     heritee non zero-padée ('2026-9-15'), qu'une comparaison binaire EXCLURAIT
//     en silence (elle est plus grande que '2026-09-24' en octets) — donc un plat
//     planifie qui ne commande rien.
// Seul, le premier est rapide et FAUX sur la donne abimee ; seul, le second est
// juste mais part en SCAN (0,168 ms, et l'index ne sert RIEN : gain mesure
// -0,6 %, l'index ne peut pas s'appliquer sous une fonction). Les DEUX ensemble
// donnent le plan PLEIN (le predicat de l'index apparait DANS le plan) au prix
// d'un scan qui ne se produit que si une date est reellement abimee. C'est la
// meme decision que `staff_schedule` (deux index, un par branche chaude).
// L'index est cree `IF NOT EXISTS` dans src/db/init.ts : la migration rejoue a
// chaque demarrage sur les bases deja livrees.
async function computeRecipeNeed(
  db: Database,
  fromDate: string,
  horizonDays: number,
): Promise<Record<string, number>> {
  // ⚠ Il n'y a PAS de colonne `couverts` dans menu_planning : les couverts
  // vivent dans recipe_json (texte JSON saisi par la vue Menu). Un
  // SUM(mp.couverts) sur une colonne inexistante ne rougit pas le lint et sort
  // un 500 au premier appel — l'agregation des couverts se fait donc ici, ligne
  // par ligne, avec coversOf() comme seul point d'entree.
  const hz = Math.max(0, Math.floor(horizonDays));
  const rows: NeedRow[] = await db.all(
    `SELECT ri.inventory_id AS inventory_id,
            mp.recipe_json  AS recipe_json,
            ri.quantity_per_person AS quantity_per_person
       FROM menu_planning mp
       JOIN recipe_ingredients ri ON ri.recipe_id = mp.recipe_id
      WHERE mp.recipe_id IS NOT NULL
        AND mp.recipe_id <> ''
        AND mp.date >= DATE(?)
        AND mp.date <= DATE(?, '+' || ? || ' days')
        AND DATE(mp.date) >= DATE(?)
        AND DATE(mp.date) <= DATE(?, '+' || ? || ' days')`,
    [fromDate, fromDate, hz, fromDate, fromDate, hz],
  );

  if (rows.length === 0) return {};

  const rawByItem = new Map<string, number>();
  for (const r of rows) {
    if (!r.inventory_id) continue;
    const covers = coversOf({ recipe_json: r.recipe_json });
    const qpp = Number(r.quantity_per_person);
    const per = Number.isFinite(qpp) && qpp > 0 ? qpp : 0;
    rawByItem.set(
      r.inventory_id,
      (rawByItem.get(r.inventory_id) || 0) + covers * per,
    );
  }

  const ids = Array.from(rawByItem.keys());
  const marks = ids.map(() => "?").join(",");
  const invRows: Array<{ id: string; yield_percent: number | null }> =
    await db.all(
      `SELECT id, yield_percent FROM inventory WHERE id IN (${marks})`,
      ids,
    );

  const need: Record<string, number> = {};
  for (const [invId, raw] of rawByItem) {
    const row = invRows.find((i) => i.id === invId);
    const y = row ? Number(row.yield_percent) : NaN;
    // Le rendement est un DIVISEUR : absent, null ou 0 (saisi par megarde) il
    // vaut 100 %. Le garder comme diviseur tel quel ferait partir le besoin en
    // Infinity, ou le reduirait a 0 — les deux etant des defauts silencieus.
    const pct = Number.isFinite(y) && y > 0 ? y : 100;
    need[invId] = Number((raw / (pct / 100)).toFixed(3));
  }
  return need;
}

// Le jour local en ISO AAAA-MM-JJ. Un toISOString() serait en UTC : entre 00:00
// et 02:00 en CEST il rend la veille, et la fenetre du besoin exclurait alors le
// service du jour. Le defaut est invisible hors de ce creneau, donc il se fige ici.
function localIsoDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Les ids d'un filtre ?ids=, valides avant l'IN() : la liste vient de l'URL, pas
// de la voie d'ecriture de l'app, donc elle ne merite pas la confiance. Un
// `ids=1 OR 1=1` n'a rien a faire dans une interpolation de marqueurs.
function parseIdList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const clean = raw
    .split(",")
    .map((s) => s.trim())
    .filter(
      (s) => s.length > 0 && s.length <= 64 && /^[0-9a-zA-Z_.:-]+$/.test(s),
    );
  return Array.from(new Set(clean)).slice(0, 500);
}

// Les couverts d'une ligne de planning. recipe_json est du texte JSON et le
// client peut le laisser vide : un parse qui jette ne doit pas faire rougir
// toute la prevision. Le defaut est 1 couvert et non 0 — avec 0 le besoin du
// plat s'annule en silence, exactement la faute que ce correctif vient punir.
function coversOf(planRow: { recipe_json?: string | null }): number {
  if (!planRow.recipe_json) return 1;
  try {
    let parsed: any = JSON.parse(planRow.recipe_json);
    // ⚠ Le champ est SOUVENT double-encode : la vue Menu envoie une chaine
    // deja serialisee et le POST la re-stringify. Un parse seul rend alors une
    // CHAINE, dont .couverts est undefined, et les couverts retombent a 1. Le
    // besoin sort divise par le nombre de convives : un chiffre plausible et
    // faux, donc le pire des defauts (rien ne rougit, et le 0/1 s'explique
    // 'naturellement' a l'ecran). Il etait 120 pour 20 couverts x 120 g.
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return 1;
      }
    }
    const raw = Number(
      parsed && typeof parsed === "object"
        ? parsed.couverts ?? parsed.covers
        : NaN,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  } catch {
    return 1;
  }
}

