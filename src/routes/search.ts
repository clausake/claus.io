// Routes : Recherche + alertes
import { Router } from "express";
import type { Database } from "sqlite";
import type { AuditLogger } from "../services/audit.js";

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/search", async (req, res) => {
try {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });
  const query = `%${q}%`;
  const inventory = await db.all(
    'SELECT "inventory" as type, id, name as title, category as subtitle FROM inventory WHERE name LIKE ? OR category LIKE ? LIMIT 5',
    [query, query],
  );
  const recipes = await db.all(
    'SELECT "recipe" as type, id, name as title, "Fiche Technique" as subtitle FROM recipes WHERE name LIKE ? LIMIT 5',
    [query],
  );
  res.json({ results: [...inventory, ...recipes] });
} catch (error) {
  res.status(500).json({ status: "error", message: "Search failed" });
}
});
// C7 : le GET est PUR (lecture seule). La regeneration (DELETE + INSERT) est
// deplacee dans POST /api/alerts/scan, appelee par l'UI apres les ecritures
// metier. Un GET qui n'ecrit plus se juge aussi plus vite (pas d'attente de
// statement prepare).
async function regenererAlertesStock(): Promise<void> {
  const lowStockItems = await db.all(
    "SELECT id, name, quantity, minStock, unit FROM inventory WHERE quantity <= minStock",
  );
  const lowStockIds =
    lowStockItems.length > 0
      ? lowStockItems.map((i) => "'stock_" + i.id + "'").join(",")
      : "'none'";
  await db.run(
    `DELETE FROM alerts WHERE id LIKE 'stock_%' AND id NOT IN (${lowStockIds})`,
  );
  const stmtAlerts = await db.prepare(
    "INSERT OR IGNORE INTO alerts (id, type, message, severity, status) VALUES (?, ?, ?, ?, ?)",
  );
  try {
    for (const item of lowStockItems) {
      const alertId = `stock_${item.id}`;
      const severity = item.quantity <= 0 ? "high" : "medium";
      const message = `Stock d'alerte : ${item.name} (${item.quantity} ${item.unit} restant pour un minimum de ${item.minStock} ${item.unit} param\xE9tr\xE9)`;
      await stmtAlerts.run(alertId, "stock", message, severity, "active");
    }
  } finally {
    await stmtAlerts.finalize();
  }
}
router.get("/api/alerts", async (req, res) => {
try {
  const alerts = await db.all(
    'SELECT * FROM alerts WHERE status = "active" ORDER BY id DESC LIMIT 10',
  );
  res.json(alerts);
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch alerts" });
}
});
// C7 : le scan qui recompte les alertes de stock. Mutating : la gate de
// session le juge (401 sans cookie, agent refuse par la liste §8 exacte).
router.post("/api/alerts/scan", async (req, res) => {
try {
  await regenererAlertesStock();
  const n = await db.get("SELECT COUNT(*) AS n FROM alerts WHERE status = 'active'");
  res.json({ success: true, alertes_actives: (n as { n: number }).n });
} catch (error) {
  console.error(error);
  res.status(500).json({ status: "error", message: "Alert scan failed" });
}
});
router.post("/api/alerts/:id/resolve", async (req, res) => {
try {
  await db.run('UPDATE alerts SET status = "resolved" WHERE id = ?', [
    req.params.id,
  ]);
  await logAudit(req, res, { route: "/api/alerts/:id/resolve", action: "update", entite: req.params.id, payload: { apres: { status: "resolved" } } });
  res.json({ success: true });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to resolve alert" });
}
});
router.post("/api/alerts/:id/ignore", async (req, res) => {
try {
  await db.run('UPDATE alerts SET status = "ignored" WHERE id = ?', [
    req.params.id,
  ]);
  await logAudit(req, res, { route: "/api/alerts/:id/ignore", action: "update", entite: req.params.id, payload: { apres: { status: "ignored" } } });
  res.json({ success: true });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to ignore alert" });
}
});

  return router;
}
