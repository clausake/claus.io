// Routes : Inventaire
import { Router } from "express";
import { safeJsonParse } from "../shared/util.js";
import {
  COLONNES_NUM,
  COLONNES_TEXTE,
  COLONNE_TEXTE_MAX,
  STATUTS,
  statutDeparse,
  lireNombre,
  estNombreExploitable,
  lireTexte,
  nombreALaCreation,
  texteALaCreation,
} from "../shared/inventory-fields.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import type { Database } from "sqlite";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/inventory", async (req, res) => {
console.log("[DEBUG] /api/inventory route called");
try {
  const inventory = await db.all("SELECT * FROM inventory");
  console.log("[DEBUG] inventory fetched:", inventory.length);
  res.json(inventory);
} catch (error) {
  console.error("Error fetching inventory:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch inventory" });
}
});
router.post("/api/inventory", async (req, res) => {
try {
  // Contrat ECRIT/LUE de la CREATION d'une ligne d'inventaire (Sprint 8).
  //
  // C'etait le PUT du Sprint 6, en pire, et la sonde brute
  // scripts/probe-post-inventory-voices.mjs l'a rendu sur des payloads pris dans
  // le code de l'UI (et non inventes par la sonde) :
  //
  //  1. LA VOIE D'AJOUT RAPIDE DE L'ECRAN FACTURE ETAIT MORTE. DocumentManager
  //     (handleQuickAdd, ~138) poste {name, unit, category, minStock, unit_price}
  //     SANS `quantity` ni `status`. La route passoit ces `undefined` au binding
  //     sur des colonnes NOT NULL -> « NOT NULL constraint failed » -> 500.
  //     La sonde rend `status_http=500, ligne_en_base=AUCUNE` : le chef ne peut
  //     pas creer l'article depuis cet ecran. Idem `name` absent ou non-str
  //     (S6, S8b) : 500 au lieu d'un 400 qui lui dirait quoi corriger.
  //  2. UN TEXTE DANS UNE COLONNE REAL Y SURVIT, et le badge de l'auditeur
  //     devient un chiffre invente. `quantity:"beaucoup"` a ete ACCEPTE
  //     (status_http=200, relu en base `quantity:"beaucoup"`,
  //     `typeof = text`) et, verification faite dans la MEME sonde, `/api/alerts`
  //     ne remonte PAS cette ligne : `quantity <= minStock` compare texte a reel
  //     et ne matche jamais. Un article dont le stock est reellement bas
  //     disparait silencieusement des alertes du chef.
  //  3. LE STATUT ETAIT CE QUE LE CLIENT DIT. HaccpModules (saveBatch, ~98) y
  //     depose 'normal' -- une valeur que l'ENUM du PUT ne connait pas : la meme
  //     donnee se fait refuser a la modification et accepter a la creation, et
  //     l'auditeur affiche une etiquette que regle d'aucune ne definit. La
  //     creation ne laisse PLUS un agent exterior designer le statut : absente,
  //     la valeur est DERIVEE des quantites par la MEME regle que l'UI
  //     (statutDeparse); presente, elle doit etre dans le jeu ferme.
  //  4. UNE CLEF DEJA PRISE REPONDAIT 500 « Failed to create » (S5), un message
  //     sans rapport avec le defaut (c'est un conflit d'identifiant).
  //
  // Un `undefined` n'entre donc plus nulle part (voir src/shared/inventory-fields.ts
  // pour pourquoi ce n'est pas « une erreur le dira » : sur une colonne NULLABLE,
  // node-sqlite3 l'accepte et ecrit NULL en silence).
  const refus: string[] = [];

  const nom = lireTexte(req.body?.name, COLONNE_TEXTE_MAX);
  if (nom === undefined) refus.push("name");

  const unite = texteALaCreation("unit" in (req.body ?? {}), req.body?.unit, "kg");
  if (unite === undefined) refus.push("unit");
  const categorie = texteALaCreation("category" in (req.body ?? {}), req.body?.category, "Uncategorized");
  if (categorie === undefined) refus.push("category");

  // `quantity` et `minStock` sont NOT NULL en base : absents, ils recoivent un
  // defaut EXPLICITE (0) au lieu d'un `undefined` qui ferait 500.
  // ⚠ ce que la sonde a appris ici: `JSON.stringify(Infinity)` et
  // `JSON.stringify(NaN)` rendent `"null"`. Un Infinity ou un NaN de saisie
  // n'arrive DONC JAMAIS comme nombre, mais comme `null`. Le confondre avec «
  // champ absent » (et lui donner le defaut) ferait passer une saisie que l'UI
  // n'a pas pu serialiser: c'est une ordure, pas une omission. D'ou la paire de
  // helpers absent/present, qui porte la MEME distinction a trois etats que le
  // PUT de ce fichier.
  const quantite = nombreALaCreation("quantity" in (req.body ?? {}), req.body?.quantity, 0);
  if (quantite === undefined || !estNombreExploitable(quantite, COLONNES_NUM.quantity.min, COLONNES_NUM.quantity.max)) {
    refus.push("quantity");
  }
  const minimum = nombreALaCreation("minStock" in (req.body ?? {}), req.body?.minStock, 0);
  if (minimum === undefined || !estNombreExploitable(minimum, COLONNES_NUM.minStock.min, COLONNES_NUM.minStock.max)) {
    refus.push("minStock");
  }
  const prix = nombreALaCreation("unit_price" in (req.body ?? {}), req.body?.unit_price, 0);
  if (prix === undefined || !estNombreExploitable(prix, COLONNES_NUM.unit_price.min, COLONNES_NUM.unit_price.max)) {
    refus.push("unit_price");
  }
  const rendement = nombreALaCreation("yield_percent" in (req.body ?? {}), req.body?.yield_percent, 100);
  if (rendement === undefined || !estNombreExploitable(rendement, COLONNES_NUM.yield_percent.min, COLONNES_NUM.yield_percent.max)) {
    refus.push("yield_percent");
  }

  let statut: string;
  const brutS = req.body?.status;
  // ⚠ `undefined` (le client n'a pas rempli) recoit le statut DERIVE; un
  // `null` EXPLICITE est une saisie que l'UI n'a pas pu serialiser (voir les
  // helpers de src/shared/inventory-fields.ts) et se refuse comme les autres
  // champs, au lieu de recevoir un defaut compatissant.
  if (brutS === undefined) {
    statut = statutDeparse(quantite as number, minimum as number);
  } else if (typeof brutS !== "string" || !STATUTS.includes(brutS.trim().toLowerCase() as (typeof STATUTS)[number])) {
    refus.push("status");
    statut = "active";
  } else {
    statut = brutS.trim().toLowerCase();
  }

  if (refus.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Champs refuses",
      refused: refus,
    });
  }

  const brutId = req.body?.id;
  const itemId =
    typeof brutId === "string" && brutId.trim() !== "" ? brutId.trim() : Date.now().toString();
  const existeDeja = await db.get("SELECT id FROM inventory WHERE id = ?", [itemId]);
  if (existeDeja) {
    // Une clef prise n'est pas une panne du serveur: c'est une requisette
    // invalide, nommee comme telle (l'UI pourra dire « cet article existe deja »).
    return res.status(409).json({
      status: "error",
      message: "Un article porte deja cet identifiant",
      id: itemId,
    });
  }

  await db.run(
    "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category, unit_price, yield_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [itemId, nom, quantite as number, minimum as number, unite as string, statut, categorie as string, prix as number, rendement as number],
  );
  // La reponse relit la BASE (meme contrat que le PUT, S4_RELECTURE) : sans
  // cette relecture la route rendoit un objet recite du corps de la requisette,
  // et un client qui se fie a sa reponseaffiche ce que la base ne contient pas.
  const relu = await db.get(
    "SELECT id, name, quantity, minStock, unit, status, category, unit_price, yield_percent, lot_number, dlc FROM inventory WHERE id = ?",
    [itemId],
  );
  if (!relu) {
    // INSERT qui ne depose aucune ligne est un echec, pas un succes a rapporter.
    return res.status(500).json({ status: "error", message: "Ligne non creee en base" });
  }
  res.json({ status: "success", id: relu.id, ...relu });
} catch (error) {
  console.error("Error creating inventory item:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to create inventory item" });
}
});
router.delete("/api/inventory/:id", async (req, res) => {
try {
  await db.run("DELETE FROM inventory WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (error) {
  console.error("Error deleting inventory item:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to delete inventory item" });
}
});
router.put("/api/inventory/:id", async (req, res) => {
try {
  // Contrat ECRIT/LUE de la mise a jour d'une ligne d'inventaire.
  //
  // Trois defauts, tous MESURES par scripts/probe-inventory-put-partial.mjs sur
  // un serveur reel (port impose + garde d'identite confrontee), et tous de la
  // famille « un PASS qui ne peut pas rougir »:
  //
  //  1. Le payload partiel sortait en 500 (S1_CODE=500). La route lisait dix
  //     champs dans req.body et les envoyait TOUS au UPDATE. Un client qui ne
  //     change que le nom laisse les neuf autres a `undefined`, et le binding de
  //     node-sqlite3 JETTE sur un `undefined` — donc un PUT legitime tombait
  //     dans le catch et rendait un 500 « Failed to update inventory item ».
  //     Le pire voisin de ce defaut, si le binding avait ete relache: `undefined`
  //     se convertit en NULL, et renommer un article viderait sa quantite, son
  //     unite et son prix en base. Les deux issues sont fausses; une seule les
  //     evite: ne pas mentionner une colonne dans le SET quand le client ne
  //     l'a pas envoyee.
  //  2. Une chaine partait dans une colonne REAL (S2_CODE=200, puis
  //     quantity="abc" RELU depuis la base). L'affinite dynamique de SQLite ne
  //     verifie rien: le texte est stocke tel quel. Des lors `quantity <= minStock`
  //     compare du texte a un reel, et le badge « ok / bas / critique » de
  //     l'auditeur (InventoryAudit) devient un chiffre invente sans qu'aucune
  //     erreur serveur ne sorte — exactement la classe du KPI reste fige a 0
  //     pendant des mois (PHASES.md, 10/09). Un nombre est donc CONVERTI et
  //     CONTROLE, jamais passe brut.
  //  3. Le statut etait une chaine que le client choisissait (S3_STATUT="defile"
  //     relu en base). Les quatre voies qui ECRIVENT ce statut (les deux badges de
  //     documents.ts et suppliers.ts, l'UI d'InventoryAudit) ne produisent que
  //     "ok", "low", "critical"; l'init, elle, y met 'active'. Accepter n'importe
  //     quoi faisait donc rendre a l'ecran une etiquette que regle d'aucune ne
  //     definit. Le jeu est desormais un ENUM ferme, et il inclut la valeur que
  //     L'ECRITURE de l'app y depose (l'init), sinon le garde rejetterait des
  //     lignes que le produit lui-même a creees.
  //
  // Ou est la cle du contrat: un champ peut etre ABSENT (on n'y touche pas),
  // NET (on ecrit), ou REJETE (le client a envoye une ordure -> 400). Un
  // booleen ne porte pas ces trois etats, d'ou le marqueur REJETE de
  // src/middleware/validate.ts.
  // Les regles de forme (bornes, jeu de statuts, colonnes texte) viennent de
  // src/shared/inventory-fields.ts : la meme source que la CREATION de ce
  // fichier. Une borne recopiee deux fois se perime en silence (lecon des
  // BUDGETS de audit-perf.mjs, puis des prix fournisseurs a trois portes).
  // La boucle de validation, elle, reste ICI et n'est pas partageable avec le
  // POST : le PUT est PARTIEL (une colonne absente = on n'y touche pas), le POST
  // est une CREATION (une colonne absente recoit le defaut du schema).
  const ecrites: string[] = [];
  const valeurs: unknown[] = [];
  const refus: string[] = [];

  for (const col of COLONNES_TEXTE) {
    const brut = req.body?.[col];
    if (brut === undefined) continue;
    if (typeof brut !== "string") { refus.push(col); continue; }
    const propre = brut.trim();
    // Un texte BLANC n'est pas une chaine vide legitime pour ces colonnes: un nom
    // d'article blanc rend deux lignes indiscernables et introuvables.
    if (propre === "") { refus.push(col); continue; }
    ecrites.push(col);
    valeurs.push(propre.slice(0, 500));
  }

  for (const col of Object.keys(COLONNES_NUM) as (keyof typeof COLONNES_NUM)[]) {
    const brut = req.body?.[col];
    if (brut === undefined || brut === null || brut === "") {
      // yield_percent a un defaut dans le schema (100) et la route POST le fige
      // a 100: passer a cote de la colonne quand il est absent lui rend son
      // defaut, au lieu de l'ecrazer a 100 a chaque mise a jour d'un autre champ.
      continue;
    }
    const bornes = COLONNES_NUM[col];
    const n = typeof brut === "number" ? brut
      : typeof brut === "string" && brut.trim() !== "" ? Number(brut) : Number.NaN;
    if (!Number.isFinite(n) || n < bornes.min || n > bornes.max) { refus.push(col); continue; }
    ecrites.push(col);
    valeurs.push(n);
  }

  {
    const brut = req.body?.status;
    if (brut !== undefined && brut !== null) {
      if (typeof brut !== "string") refus.push("status");
      else {
        const propre = brut.trim().toLowerCase();
        if (!STATUTS.includes(propre as (typeof STATUTS)[number])) refus.push("status");
        else { ecrites.push("status"); valeurs.push(propre); }
      }
    }
  }

  if (refus.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Champs refuses",
      refused: refus,
    });
  }
  if (ecrites.length === 0) {
    // Un PUT qui ne change rien n'est pas une reussite a rapporter: dire « 0
    // colonne ecrite » laisse le client croire que sa saisie est passee.
    return res.status(400).json({
      status: "error",
      message: "Aucune colonne exploitable dans ce payload",
    });
  }

  const id = req.params.id;
  // Les placeholders suivent ecrites dans le MEME ordre que valeurs: des que les
  // deux listes sont construites ensemble, un decalage entre une colonne et sa
  // valeur devient impossible par construction (et non evite par vigilance).
  const sql =
    "UPDATE inventory SET " + ecrites.map((c) => `${c} = ?`).join(", ") + " WHERE id = ?";
  const resultat = await db.run(sql, [...valeurs, id]);

  if (resultat?.changes !== 1) {
    // Le defaut precedent repondait 200 a un UPDATE qui n'avait touche AUCUNE
    // ligne: un id frappe a la main (ou une ligne supprimee entre deux ecrans)
    // se traduisait par un succes vert. Le compteur de lignes touchees est le
    // seul temoin independant du corps de reponse.
    return res.status(404).json({ status: "error", message: "Article introuvable" });
  }

  if (ecrites.includes("unit_price")) {
    await db.run(
      "INSERT INTO inventory_prices (id, inventory_id, price) VALUES (?, ?, ?)",
      [Date.now().toString() + Math.random(), id, req.body.unit_price],
    );
  }
  // La reponse relit la BASE au lieu de renvoyer le corps de la requete: sans
  // cette relecture, la reponse pouvais afficher la valeur envoyee par le
  // client pendant que la base en gardait une autre (S4_RELECTURE, ou le
  // 12.5 d'origine survit a un PUT qui pretendait avoir mis 7).
  const relu = await db.get(
    "SELECT id, name, quantity, minStock, unit, status, category, unit_price, yield_percent, lot_number, dlc FROM inventory WHERE id = ?",
    [id],
  );
  res.json({ status: "success", item: relu, updated: ecrites });
} catch (error) {
  console.error("Error updating inventory item:", error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to update inventory item" });
}
});
// POST /api/inventory/consume : decrement de stock a la validation d'un chariot
// de production (ProductionPlan.tsx, handleConsumeStock).
//
// CE QUI EST MESURE, et ce qui ne l'est pas (scripts/probe-consume-semantiques.mjs,
// node-sqlite3 sur table `id TEXT PRIMARY KEY, q REAL NOT NULL`):
//   - `UPDATE ... WHERE id = ?` sur une clef inexistante rend `changes: 0` SANS
//     jeter. L'ancien code ignorait ce compteur: une clef inconnue laissait les
//     AUTRES lignes consommees et repondait {success:true}. C'est le defaut
//    central corrige ici (400 + `unknown:[index]` + ROLLBACK).
//   - `typeof quantity !== "number" -> continue` SIGILAIT l'entree et la
//     reponse restait {success:true}: une quantite absente, en texte, nulle ou
//     NEGATIVE (qui, elle, REMPLissait le stock) ne levait aucun signal. Desorais
//     400 + `refused:[index]`, aucune ecriture.
//   - un nombre NON FINI lie dans un `?` d'une colonne REAL NOT NULL JETTE une
//     contrainte (sonde: `NOT NULL constraint failed`). Le garde amont ne sert
//     donc pas a empecher un NaN grave — il sert a rendre un 400 LISIBLE au lieu
//     d'un 500 sorti du catch.
//   - ⚠ MA THESE INITIALE « `BEGIN TRANSACTION` n'existe pas en SQLite, le
//     ROLLBACK etait un no-op » etait FAUSSE et la sonde l'a infirmee: la grammaire
//     SQLite est `BEGIN [DEFERRED|IMMEDIATE|EXCLUSIVE] [TRANSACTION]`, et apres
//     BEGIN TRANSACTION + UPDATE + ROLLBACK la valeur etait RESTAUREE (123 -> 5).
//     Je garde `BEGIN IMMEDIATE` pour une raison DIFFERENTE et non mesuree ici:
//     il prend le verrou d'ecriture a l'entree (donc pas de SQLITE_BUSY en cours
//     de lot sous un WAL ou le webhook HACCP ecrit en continu). Une forme qui
//     marche n'est pas une raison d'en changer sans mesure: si ce choix doit etre
//     juge, le juger par un A/B sous concurrence, pas par une intuition.
//
// Chaque regle est doublee par test/e2e/consume-contract.spec.ts: DELTA d'abord
// (poster par la MEME route que l'UI, exiger le mouvement EXACT relu en base),
// puis RETIRER (re-poster l'inverse) et exiger le retour a la ligne de base.
router.post("/api/inventory/consume", async (req, res) => {
try {
  const items = req.body?.items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid payload: items must be an array" });
  }
  if (items.length === 0) {
    return res.status(400).json({ error: "Invalid payload: items must not be empty" });
  }

  // Une entree est consommeable si elle porte une clef et UNE quantite
  // NUMERIQUE finie et STRICTEMENT POSITIVE. On ne « continue » plus dessus.
  const rejetees: number[] = [];
  const valides: { index: number; id: string; quantite: number }[] = [];
  items.forEach((item: any, index: number) => {
    const brut = item?.quantity;
    const quantite =
      typeof brut === "number" ? brut
        : typeof brut === "string" && brut.trim() !== "" ? Number(brut)
        : Number.NaN;
    if (
      !item ||
      typeof item.inventory_id !== "string" ||
      item.inventory_id.trim() === "" ||
      !Number.isFinite(quantite) ||
      quantite <= 0
    ) {
      rejetees.push(index);
    } else {
      valides.push({ index, id: item.inventory_id, quantite });
    }
  });
  if (rejetees.length > 0) {
    return res.status(400).json({
      error: "Invalid payload: each item needs an inventory_id and a positive quantity",
      refused: rejetees,
    });
  }

  await db.run("BEGIN IMMEDIATE");
  let en_transaction = true;
  try {
    let touches = 0;
    const inconnues: number[] = [];
    for (const ligne of valides) {
      const r = await db.run(
        "UPDATE inventory SET quantity = CASE WHEN quantity - ? < 0 THEN 0 ELSE quantity - ? END WHERE id = ?",
        [ligne.quantite, ligne.quantite, ligne.id],
      );
      // changes === 0: la clef n'existe pas. Le contrat de l'ancien code
      // l'ignorait; ici c'est un refus notifie (le chef ne corrige pas la meme
      // chose pour un article supprimé que pour une quantite abusive).
      if (!r || r.changes !== 1) inconnues.push(ligne.index);
      else touches += r.changes;
    }
    if (inconnues.length > 0) {
      await db.run("ROLLBACK");
      en_transaction = false;
      return res.status(400).json({
        error: "Unknown inventory_id in items",
        unknown: inconnues,
      });
    }
    await db.run("COMMIT");
    en_transaction = false;
    // Le compte-rendu est RE-LU en base (meme contrat que le PUT de ce fichier:
    // `item: relu`), pas recite depuis le corps de la requete.
    const relues: { id: string; name: string; quantity: number }[] = [];
    for (const ligne of valides) {
      const relu = await db.get(
        "SELECT id, name, quantity FROM inventory WHERE id = ?",
        [ligne.id],
      );
      if (relu) relues.push(relu);
    }
    res.json({ success: true, consumed: touches, items: relues });
  } catch (e) {
    if (en_transaction) {
      try { await db.run("ROLLBACK"); } catch { /* deja hors transaction */ }
    }
    throw e;
  }
} catch (error) {
  console.error("Consume API Error:", error);
  res.status(500).json({ error: "Internal Server Error" });
}
});

router.post("/api/inventory/analyze", async (req, res) => {
try {
  const inventory = await db.all("SELECT * FROM inventory");
  const lowStock = inventory.filter((i) => i.quantity <= i.minStock);
  const critical = inventory.filter(
    (i) => i.status === "critical" || i.quantity <= 0,
  );
  const inventoryContext = inventory
    .map((i) => `${i.name}: ${i.quantity} ${i.unit} (Min: ${i.minStock})`)
    .join(", ");
  const langName =
    ollamaSettingsRef.current.language === "fr"
      ? "français"
      : ollamaSettingsRef.current.language === "es"
        ? "Español"
        : ollamaSettingsRef.current.language === "de"
          ? "Deutsch"
          : ollamaSettingsRef.current.language === "it"
            ? "Italiano"
            : "English";
  const prompt = `Tu es l'Assistant IA, l'expert en gestion de cuisine de l'établissement.
Analyse cet inventaire et donne 3 conseils strat\xE9giques concrets (gestion des stocks, commandes \xE0 passer, optimisation des co\xFBts, ou id\xE9es de recettes pour \xE9couler le stock).
Inventaire : ${inventoryContext}
\xC9l\xE9ments critiques : ${critical.map((i) => i.name).join(", ")}
\xC9l\xE9ments bas : ${lowStock.map((i) => i.name).join(", ")}

R\xE9ponds en ${langName}. Sois concis, professionnel et percutant. Pas de bla-bla inutile.
Format de r\xE9ponse souhait\xE9 (texte brut, environ 100-150 mots).`;
  const response = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt,
    options: { temperature: 0.7 },
  });
  res.json({ analysis: response.response });
} catch (error) {
  console.error("Analysis API Error:", error);
  res.status(500).json({
    status: "error",
    message: "D\xE9sol\xE9 Chef, l'analyse stratégique de l'IA a \xE9chou\xE9.",
  });
}
});

  return router;
}
