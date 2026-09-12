// Routes : Inventaire
import { Router } from "express";
import { safeJsonParse } from "../shared/util.js";
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
  const {
    id,
    name,
    quantity,
    minStock,
    unit,
    status,
    category,
    unit_price,
    yield_percent,
  } = req.body;
  const itemId = id || Date.now().toString();
  const finalYield = yield_percent !== undefined ? yield_percent : 100;
  await db.run(
    "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category, unit_price, yield_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [itemId, name, quantity, minStock, unit, status, category, unit_price, finalYield],
  );
  res.json({
    id: itemId,
    name,
    quantity,
    minStock,
    unit,
    status,
    category,
    unit_price,
    yield_percent: finalYield,
  });
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
  const COLONNES_NUM = {
    quantity: { min: 0, max: 1_000_000 },
    minStock: { min: 0, max: 1_000_000 },
    unit_price: { min: 0, max: 1_000_000 },
    yield_percent: { min: 0, max: 100 },
  } as const;
  const COLONNES_TEXTE = ["name", "unit", "category", "lot_number", "dlc"] as const;
  const STATUTS = ["ok", "low", "critical", "active"] as const;

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
router.post("/api/inventory/consume", async (req, res) => {
try {
  const items = req.body.items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid payload: items must be an array" });
  }

  await db.run("BEGIN TRANSACTION");
  try {
    for (const item of items) {
      if (!item.inventory_id || typeof item.quantity !== 'number') continue;
      await db.run(
        "UPDATE inventory SET quantity = CASE WHEN quantity - ? < 0 THEN 0 ELSE quantity - ? END WHERE id = ?",
        [item.quantity, item.quantity, item.inventory_id]
      );
    }
    await db.run("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await db.run("ROLLBACK");
    throw e;
  }
} catch (error) {
  console.error(error);
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
