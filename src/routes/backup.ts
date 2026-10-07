// Routes : Backup (archive zip du dossier de données utilisateur)
// Le dossier de données (USER_DATA_PATH) est résolu au démarrage ; la même
// fonction resolveStorageDir() que initDatabase() garantit le même chemin.
import { Router } from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { resolveStorageDir } from "../db/init.js";
import { logAuditRacine } from "../services/audit.js";

const router = Router();

const storageDir = resolveStorageDir();

const logAudit = logAuditRacine;

router.post("/api/backup", async (req, res) => {
  try {
    const output = fs.createWriteStream(path.join(storageDir, "backup.zip"));
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () =>
      res.download(path.join(storageDir, "backup.zip")),
    );
    archive.pipe(output);
    archive.directory(storageDir, false, { date: new Date() });
    archive.finalize();
    logAudit(req, res, { route: "/api/backup", action: "backup" }).catch(() => {});
  } catch (error) {
    console.error("[BACKUP] Erreur :", error);
    res.status(500).json({ error: "Backup failed" });
  }
});

export default router;
