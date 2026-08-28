import multer from "multer";
import path from "path";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // 25 Mo max par upload (factures/scans + PDF) — évite les uploads illimités
    fileSize: 25 * 1024 * 1024,
    files: 5,
    fields: 20,
  },
  fileFilter: (_req, file, cb) => {
    // On refuse les exécutables / scripts (le serveur n'en a pas besoin)
    const blocked = /\.(exe|msi|bat|cmd|sh|ps1|js|cjs|mjs|ts|py|jar|apk|iso|zip)$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.test(file.originalname) || (ext === ".js" || ext === ".ts")) {
      return cb(new Error(`Type de fichier non autorisé : ${file.originalname}`));
    }
    cb(null, true);
  },
});

export { upload };
