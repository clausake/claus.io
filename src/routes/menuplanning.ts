// Routes : Planification des menus
import { Router } from "express";
import { ollamaSettingsRef } from "../shared/ollama.js";
import type { Database } from "sqlite";

export default function createRouter(db: Database) {
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
  const { date, meal_type, recipe_id, title, recipe_json, language } = req.body;
  const planningLang = language || ollamaSettingsRef.current.language || 'fr';
  const id = Date.now().toString();
  await db.run(
    "INSERT INTO menu_planning (id, date, meal_type, recipe_id, title, recipe_json, language) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      date,
      meal_type,
      recipe_id || null,
      title,
      JSON.stringify(recipe_json || null),
      planningLang
    ],
  );
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
