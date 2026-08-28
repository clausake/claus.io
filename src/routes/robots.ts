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
      await db.run(
        'UPDATE robots SET task = ?, status = "active", progress = 0 WHERE id = ?',
        [task, robotId],
      );
      res.json({ status: "success" });
    } catch (error) {
      res
        .status(500)
        .json({ status: "error", message: "Failed to assign task" });
    }
  });

  return router;
}
