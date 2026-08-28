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
  const {
    name,
    quantity,
    minStock,
    unit,
    status,
    category,
    unit_price,
    yield_percent,
    lot_number,
    dlc,
  } = req.body;
  const id = req.params.id;
  const finalYield = yield_percent !== undefined ? yield_percent : 100;
  await db.run(
    "UPDATE inventory SET name = ?, quantity = ?, minStock = ?, unit = ?, status = ?, category = ?, unit_price = ?, yield_percent = ?, lot_number = ?, dlc = ? WHERE id = ?",
    [
      name,
      quantity,
      minStock,
      unit,
      status,
      category,
      unit_price,
      finalYield,
      lot_number,
      dlc,
      id,
    ],
  );
  if (unit_price !== void 0) {
    await db.run(
      "INSERT INTO inventory_prices (id, inventory_id, price) VALUES (?, ?, ?)",
      [Date.now().toString() + Math.random(), id, unit_price],
    );
  }
  res.json({ status: "success" });
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
