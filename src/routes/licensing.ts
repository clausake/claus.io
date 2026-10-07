// Routes : Licence (statut trial + unlock)
import { Router } from "express";
import type { Database } from "sqlite";
import { verifyLicenseKey, LicenseState } from "../db/init.js";
import type { AuditLogger } from "../services/audit.js";

// Factory : les routes ont besoin de la base de données et de l'état licence
// initialisés au démarrage du serveur.
export default function licensingRouter(db: Database, licenseState: LicenseState, logAudit: AuditLogger) {
  const router = Router();

  router.get("/api/trial-status", async (_req, res) => {
    const { machineId, finalInstallTime, TRIAL_MS } = licenseState;
    const installDate = parseInt(finalInstallTime);
    const elapsed = Date.now() - installDate;
    const daysLeft = Math.ceil((TRIAL_MS - elapsed) / (1e3 * 60 * 60 * 24));
    let unlockedRow = await db.get(
      "SELECT value FROM app_license WHERE key = 'is_unlocked'",
    );
    const isUnlocked = unlockedRow ? (unlockedRow as { value: string }).value === "true" : false;
    res.json({
      isExpired: elapsed > TRIAL_MS,
      daysLeft: Math.max(0, daysLeft),
      isUnlocked,
      machineId,
    });
  });
  router.post("/api/unlock", async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });
    if (verifyLicenseKey(licenseState.machineId, key.trim())) {
      await db.run(
        "INSERT OR REPLACE INTO app_license (key, value) VALUES ('is_unlocked', 'true')",
      );
      // L'audit journalise le DEBLOCAGE, jamais la clef elle-meme.
      await logAudit(req, res, { route: "/api/unlock", action: "unlock" });
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Invalid key" });
  });

  return router;
}
