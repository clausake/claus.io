// Routes : Robots de cuisine (liste + assignation de tâches)
import { Router } from "express";
import type { Database } from "sqlite";

export default function createRouter(db: Database) {
  const router = Router();

  router.get("/api/robots", async (_req, res) => {
    try {
      const robots = await db.all("SELECT * FROM robots");
      res.json(robots);
    } catch (error) {
      res
        .status(500)
        .json({ status: "error", message: "Failed to fetch robots" });
    }
  });
  router.post("/api/robots/assign", async (req, res) => {
    try {
      const { robotId, task } = req.body;
      const resultat = await db.run(
        'UPDATE robots SET task = ?, status = "active", progress = 0 WHERE id = ?',
        [task, robotId],
      );
      // Un UPDATE de ZERO ligne n'est pas une reussite: le compteur de lignes
      // touchees est le seul temoin independant du corps de reponse (la classe
      // « un 200 sur une ligne qui n'existe pas » du POST /api/inventory,
      // mesuree le Sprint 8). L'id adresse par l'appelant est une RESOURCE de
      // l'URI (voie UPDATE), donc le code est 404 (pas 400).
      if (resultat?.changes !== 1) {
        res
          .status(404)
          .json({ status: "error", message: "Robot introuvable", refused: ["robotId"] });
        return;
      }
      const relue = await db.get("SELECT id, name, task, status, progress FROM robots WHERE id = ?", robotId);
      res.json({ status: "success", item: relue });
    } catch (error) {
      res
        .status(500)
        .json({ status: "error", message: "Failed to assign task" });
    }
  });

  return router;
}
