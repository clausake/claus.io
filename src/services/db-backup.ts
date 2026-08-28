import fs from "fs";
import path from "path";

// Backup automatique horaire de la base SQLite.
// - Crée le dossier <dataDir>/backups/ si inexistant,
// - copie la base toutes les heures vers backups/db-YYYY-MM-DD_HH-mm-ss.db,
// - ne garde que les 5 derniers backups (rotation par nom de fichier),
// - journalise chaque copie ; les erreurs sont loguées sans crasher le process.

const BACKUP_INTERVAL_MS = 3600000; // 1 heure
const MAX_BACKUPS = 5;

function timestampLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

// Copie la base et supprime les backups au-delà des 5 derniers.
export function runDbBackup(dataDir: string, dbPath: string): void {
  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) return;

  const backupName = `db-${timestampLocal()}.db`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(dbPath, backupPath);

  const sizeKo = (fs.statSync(backupPath).size / 1024).toFixed(1);
  console.log(`[BACKUP] DB copiée → ${backupName} (${sizeKo} Ko)`);

  // Rotation : le nom contient le timestamp (tri alphabétique = tri chronologique).
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("db-") && f.endsWith(".db"))
    .sort();
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift()!;
    fs.unlinkSync(path.join(backupDir, oldest));
    console.log(`[BACKUP] Ancien backup supprimé : ${oldest}`);
  }
}

// Démarre le backup horaire. Retourne stop() pour arrêter l'intervalle (tests).
export function startDbBackup(dataDir: string, dbPath: string): () => void {
  const timer = setInterval(() => {
    try {
      runDbBackup(dataDir, dbPath);
    } catch (err) {
      console.error("[BACKUP] Erreur lors de la sauvegarde :", err);
    }
  }, BACKUP_INTERVAL_MS);
  return () => clearInterval(timer);
}
