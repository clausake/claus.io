// Routes : Anti-gaspillage (lots critiques + génération de recettes)
import { Router } from "express";
import type { Database } from "sqlite";
import { safeJsonParse } from "../shared/util.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/anti-waste/critical", async (req, res) => {
try {
  const expiringBatches = await db.all(`
    SELECT b.*, i.name as product_name 
    FROM batches b 
    JOIN inventory i ON b.inventory_id = i.id
    WHERE date(b.expiration_date) <= date('now', '+7 days')
    AND b.quantity > 0
  `);
  const mappedInventory = expiringBatches.map((b) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const isUrgent = new Date(b.expiration_date) <= d;
    return {
      name: b.product_name,
      quantity: b.quantity,
      unit: b.unit,
      status: isUrgent ? "urgent" : "low",
    };
  });
  res.json({ inventory: mappedInventory, expiringBatches });
} catch (error) {
  res.status(500).json({ error: "Failed to load critical data" });
}
});
router.post("/api/anti-waste/generate", async (req, res) => {
try {
  const { expiringBatches } = (await db.get("SELECT 1"))
    ? {
        expiringBatches: await db.all(`
      SELECT i.name, b.quantity, b.unit, b.expiration_date 
      FROM batches b 
      JOIN inventory i ON b.inventory_id = i.id
      WHERE date(b.expiration_date) <= date('now', '+7 days')
      AND b.quantity > 0
    `),
      }
    : { expiringBatches: [] };
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
  const prompt =
    ollamaSettingsRef.current.language === "it"
      ? `Genera una proposta creativa e professionale per ricette anti-spreco.
Istruzioni:
1. Usa prioritariamente questi ingredienti con data di scadenza breve: ${expiringBatches.map((b) => `${b.name} (${b.quantity} ${b.unit}, scade il ${b.expiration_date})`).join(", ")}.
2. Completa con altri ingredienti di base.
3. MENZIONE OBBLIGATORIA: Elenca gli allergeni per ogni piatto.

Rispondi ESCLUSIVAMENTE in JSON con questo formato in ITALIANO:
{
"menu_name": "Proposta Anti-Spreco",
"dishes": [
{
  "name": "...",
  "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
  "allergens": ["..."],
  "preparation_steps": "..."
}
]
}`
      : ollamaSettingsRef.current.language === "es"
        ? `Genera una propuesta creativa y profesional de recetas anti-residuos.

Instrucciones:
1. Utiliza prioritariamente estos ingredientes con fecha de caducidad corta para crear la base: ${expiringBatches.map((b) => `${b.name} (${b.quantity} ${b.unit}, expira el ${b.expiration_date})`).join(", ")}.
2. Complementa estos ingredientes con insumos culinarios b\xE1sicos (especias, aceites, cereales, l\xE1cteos) para crear una receta equilibrada.
3. MENCI\xD3N OBLIGATORIA: Para cada plato, enumera los posibles al\xE9rgenos.

Responde \xDANICAMENTE en JSON con este formato en ESPA\xD1OL:
{
"menu_name": "Propuesta Anti-Residuos",
"dishes": [
  {
    "name": "...",
    "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
    "allergens": ["...", "..."],
    "preparation_steps": "..."
  }
]
}`
        : ollamaSettingsRef.current.language === "de"
          ? `Erstelle einen kreativen und professionellen Vorschlag für ein Anti-Waste-Rezept.
Anweisungen:
1. Verwenden Sie vorrangig Zutaten mit kurzem Haltbarkeitsdatum: ${expiringBatches.map((b) => `${b.name} (${b.quantity} ${b.unit}, läuft ab am ${b.expiration_date})`).join(", ")}.
2. Kombinieren Sie sie mit Standardzutaten, um ein ausgewogenes Rezept zu kreieren.
3. PFLICHTANGABE: Listen Sie mögliche Allergene auf.

Antworten Sie AUSSCHLIESSLICH als JSON auf DEUTSCH mit folgendem Format:
{
"menu_name": "Anti-Waste Proposal",
"dishes": [
{
  "name": "...",
  "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
  "allergens": ["...", "..."],
  "preparation_steps": "..."
}
]
}`
          : ollamaSettingsRef.current.language === "en"
            ? `Generate a creative and professional anti-waste recipe proposal.

Instructions :
1. Use priority ingredients with a short shelf life to create the base: ${expiringBatches.map((b) => `${b.name} (${b.quantity} ${b.unit}, expires on ${b.expiration_date})`).join(", ")}.
2. Complete these ingredients with culinary essentials (spices, oils, cereals, dairy products) to create a balanced recipe.
3. MANDATORY MENTION: For each dish, list the potential allergens.

Respond ONLY in JSON with this format in English:
{
"menu_name": "Anti-Waste Proposal",
"dishes": [
  {
    "name": "...",
    "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
    "allergens": ["...", "..."],
    "preparation_steps": "..."
  }
]
}`
            : `G\xE9n\xE8re une proposition de recettes anti-gaspillage cr\xE9ative et professionnelle. 

Instructions :
1. Utilise en priorit\xE9 ces ingr\xE9dients avec une DLC courte pour cr\xE9er la base : ${expiringBatches.map((b) => `${b.name} (${b.quantity} ${b.unit}, expire le ${b.expiration_date})`).join(", ")}.
2. Compl\xE8te ces ingr\xE9dients avec les indispensables de cuisine (\xE9pices, huiles, c\xE9r\xE9ales, produits laitiers) pour cr\xE9er une recette \xE9quilibr\xE9e.
3. MENTION OBLIGATOIRE : Pour chaque plat, liste les allerg\xE8nes potentiels.

R\xE9ponds UNIQUEMENT en JSON avec ce format en ${langName} :
{
"menu_name": "Proposition Anti-gaspillage",
"dishes": [
  {
    "name": "...",
    "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
    "allergens": ["...", "..."],
    "preparation_steps": "..."
  }
]
}`;
  const response = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt,
    format: "json",
  });
  res.json(safeJsonParse(response.response));
} catch (error) {
  console.error("Anti-waste generation error:", error);
  res.status(500).json({ error: "Failed to generate anti-waste recipes" });
}
});

  return router;
}
