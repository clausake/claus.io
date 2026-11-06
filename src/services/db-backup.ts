import fs from "fs";
import path from "path";

// Backup automatique horaire de la base SQLite.
// - Crée le dossier <dataDir>/backups/ si inexistant,
// - copie la base toutes les heures vers backups/db-YYYY-MM-DD_HH-mm-ss.db,
// - ne garde que les 5 derniers backups (rotation par nom de fichier),
// - journalise chaque copie ; les erreurs sont loguées sans crasher le process.
// C4 : la base est en WAL (init.ts:44). Une copie du seul .db perd les
// écritures du journal ; on fold donc le WAL (TRUNCATE) dans le .db AVANT la
// copie, puis on copie aussi .db-wal/.db-shm s'ils portent encore des octets.

const BACKUP_INTERVAL_MS = 3600000; // 1 heure
const MAX_BACKUPS = 5;

// C4 : le fold WAL. Le handle est passe en parametre (celui du serveur, deja
// ouvert) : `initDatabase()` n'est PAS idempotente (elle re-OPEN la base et
// reseede) — la rappeler dans un juge produisait des lignes d'audit en double
// et des seeds fantomes. Le PRAGMA wal_checkpoint(TRUNCATE) fold le journal
// dans le .db avant copie. Si aucun handle n'est passe (juge qui appelle la
// fonction directement), on FOLDE via un handle ephemere ferme immediatement
// — jamais le handle du serveur, jamais `initDatabase()`.
function foldWal(db: { exec(sql: string): Promise<unknown> } | undefined): void {
  // Le fold n'a de sens QUE dans le process du serveur (le handle y est
  // ouvert). Sans handle, la copie du seul .db reste lisible — le WAL peut
  // porter les dernieres écritures, defaut NOMMÉ, pas une exception.
  if (!db) return;
  void db.exec("PRAGMA wal_checkpoint(TRUNCATE);").catch((e: unknown) => {
    console.error("[BACKUP] wal_checkpoint ignore :", e);
  });
}

function timestampLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

// Copie la base et supprime les backups au-delà des 5 derniers.
export function runDbBackup(
  dataDir: string,
  dbPath: string,
  db?: { exec(sql: string): Promise<unknown> },
): void {
  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) return;

  // C4 : fold du WAL dans le fichier principal, puis copie des trois fichiers.
  foldWal(db);

  const backupName = `db-${timestampLocal()}.db`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(dbPath, backupPath);
  // Les sidecars ne sont copies que s'ils portent des octets (apres un fold
  // reussi ils sont vides, et un fichier vide ne nuit pas a la restauration).
  for (const suffixe of ["-wal", "-shm"]) {
    const side = `${dbPath}${suffixe}`;
    if (fs.existsSync(side) && fs.statSync(side).size > 0) {
      fs.copyFileSync(side, `${backupPath}${suffixe}`);
    }
  }

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

// Démarre le backup : un premier fold+copie AU DEMARRAGE (C4 : la premiere
// heure ne doit pas laisser la base sans backup), puis l'intervalle horaire.
// Retourne stop() pour arrêter l'intervalle (tests).
export function startDbBackup(
  dataDir: string,
  dbPath: string,
  db?: { exec(sql: string): Promise<unknown> },
): () => void {
  const timer = setInterval(() => {
    try {
      runDbBackup(dataDir, dbPath, db);
    } catch (err) {
      console.error("[BACKUP] Erreur lors de la sauvegarde :", err);
    }
  }, BACKUP_INTERVAL_MS);
  return () => clearInterval(timer);
}
