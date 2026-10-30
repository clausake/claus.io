// Routes : Planification des menus
import { Router } from "express";
import { ollamaSettingsRef } from "../shared/ollama.js";
import type { Database } from "sqlite";
import { requireString, optionalString } from "../middleware/validate.js";
import type { AuditLogger } from "../services/audit.js";
import { nouvelId } from "../shared/util.js";

// Un champ de detail de plat doit rester du JSON LISIBLE. Les DEUX noms de
// champ sont acceptes (recipe_json cote API, recipe_details cote vue Menu, que
// MenuAnalysis est seul a emettre) et une chaine DEJA serialisee n'est pas
// re-serialisee : le double-encodage etait la cause reelle du besoin faux.
function normalizeRecipeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    try {
      JSON.parse(trimmed);
      return trimmed; // deja du JSON : on ne le re-stringify pas
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return null;
}

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/menu-planning", async (req, res) => {
try {
  const { start, end } = req.query;
  let query = "SELECT * FROM menu_planning WHERE language = ?";
  const params = [ollamaSettingsRef.current.language || 'fr'];
  if (start && end) {
    query += " AND date >= ? AND date <= ?";
    params.push(start as string, end as string);
  }
  query += " ORDER BY date ASC";
  const planning = await db.all(query, params);
  res.json(planning);
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch menu planning" });
}
});
router.post("/api/menu-planning", async (req, res) => {
try {
  if (!requireString(req, res, "date", 20)) return;
  const { date, meal_type, recipe_id, title, recipe_json, recipe_details, language } =
    req.body;
  const mealType = optionalString(req, "meal_type", 50) || "lunch";
  const recipeId = optionalString(req, "recipe_id", 50) || null;
  const titleVal = optionalString(req, "title", 200) || "";
  const planningLang = language || ollamaSettingsRef.current.language || 'fr';
  const id = nouvelId();
  await db.run(
    "INSERT INTO menu_planning (id, date, meal_type, recipe_id, title, recipe_json, language) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      date,
      mealType,
      recipeId,
      titleVal,
      // ⚠ Ne pas re-stringifier ici. L'UI (MenuAnalysis) envoie deja
      // recipe_details en CHAINE JSON.stringifye; la re-serialiser colle des
      // guillemets d'echappement, le lecteur ne retrouve plus .couverts, les
      // couverts retombent a 1 et le besoin est divise par le nombre de
      // convives — un chiffre plausible et FAUX, sans aucun rougissement.
      // Les DEUX noms de champ sont acceptes (recipe_json cote API,
      // recipe_details cote vue Menu) au lieu de juger un payload invente.
      normalizeRecipeJson(recipe_json ?? recipe_details),
      planningLang
    ],
  );
  await logAudit(req, res, { route: "/api/menu-planning", action: "create", entite: id, payload: { apres: { date: date, meal_type: mealType, title: titleVal } } });
  res.json({ status: "success", id });
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to save to planning" });
}
});
router.delete("/api/menu-planning/:id", async (req, res) => {
try {
  await db.run("DELETE FROM menu_planning WHERE id = ?", [req.params.id]);
  await logAudit(req, res, { route: "/api/menu-planning/:id", action: "delete", entite: req.params.id });
  res.json({ status: "success" });
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to delete from planning" });
}
});

  return router;
}
