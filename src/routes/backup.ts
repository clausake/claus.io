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
    // C4 : exclusion des artefacts qui faussent l'archive — backup.zip lui-
    // même (récursion mesurée) et les sidecars WAL (-wal/-shm), folds dans le
    // .db par le checkpoint ; les recopier double l'état sans rien ajouter.
    const exclus = new Set(["backup.zip", "agent_culinaire.db-wal", "agent_culinaire.db-shm"]);
    for (const nom of fs.readdirSync(storageDir)) {
      if (exclus.has(nom)) continue;
      const p = path.join(storageDir, nom);
      if (fs.statSync(p).isDirectory()) {
        archive.directory(p, nom);
      } else {
        archive.file(p, { name: nom });
      }
    }
    archive.finalize();
    logAudit(req, res, { route: "/api/backup", action: "backup" }).catch(() => {});
  } catch (error) {
    console.error("[BACKUP] Erreur :", error);
    res.status(500).json({ error: "Backup failed" });
  }
});

export default router;
