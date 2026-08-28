// Routes : Backup (archive zip du dossier de données utilisateur)
import { Router } from "express";
import fs from "fs";
import path from "path";
import { resolveStorageDir } from "../db/init.js";

const router = Router();

const storageDir = resolveStorageDir();

router.post("/api/backup", async (_req, res) => {
  try {
    const archiver = require("archiver");
    const output = fs.createWriteStream(path.join(storageDir, "backup.zip"));
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () =>
      res.download(path.join(storageDir, "backup.zip")),
    );
    archive.pipe(output);
    archive.directory(storageDir, false, { date: new Date() });
    archive.finalize();
  } catch (error) {
    res.status(500).json({ error: "Backup failed" });
  }
});

export default router;
