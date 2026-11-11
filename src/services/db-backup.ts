// Backup automatique horaire de la base SQLite.
//
// Chantier 42 — le backup automatique utilise le MEME helper de snapshot que
// les exports manuels (src/services/snapshot-sqlite.ts). Avant, il copiait
// le `.db` nu : en mode WAL, une copie de fichier perd les dernieres
// ecritures (elles vivent dans le `-wal`). Le helper produit un fichier
// AUTONOME (mode DELETE, aucun sidecar) et verifie son integrite.
//
// Chantier 45 — LE PREMIER BACKUP EXISTE REELLEMENT.
// Le commentaire d'avant annoncait "un premier fold+copie AU DEMARRAGE" mais
// le code ne posait qu'un `setInterval` d'une heure : sur une installation
// neuve, le dossier `backups/` etait ABSENT tant qu'une heure n'avait pas
// passe. Mesure de l'audit : "Sur le serveur isole nouvellement demarre :
// dossier backups ABSENT." Le premier backup est desormais pose au
// demarrage, avec une erreur NOMMEE et observable.
//
// Chantier 45 (rotation) — les SIDECARS sont supprimes avec leur backup.
// La rotation filtrait sur les `.db` seuls : un `-wal` ou un `-shm` d'un
// backup supprime restait sur le disque. Les deux sont desormais traites.
import fs from "fs";
import path from "path";
import type { Database } from "sqlite";
import { snapshotSqlite, publierSnapshot, SnapshotErreur } from "./snapshot-sqlite.js";

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

/**
 * Pose un backup autonome et verifie dans <dataDir>/backups/.
 * Le fichier est produit par le helper de snapshot (sauvegarde en ligne) :
 * il contient l'etat complet, WAL compris, et se suffit a lui-meme.
 */
export async function runDbBackup(dataDir: string, db: Database): Promise<string> {
  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupName = `db-${timestampLocal()}.db`;
  const backupPath = path.join(backupDir, backupName);
  // Le snapshot est produit dans un fichier TEMPORAIRE, puis deplace a sa
  // place finale : la base VIVANTE ne peut jamais etre remplacee par un
  // backup (le serveur ecrit dans le fichier ouvert, pas dans son nom).
  const snapshot = await snapshotSqlite(
    db,
    path.join(backupDir, `snapshot-${process.pid}-${Date.now().toString(36)}.db`),
    { conserverSiEchec: false },
  );
  try {
    await publierSnapshot(snapshot.chemin, backupPath);
  } catch (e) {
    try { fs.unlinkSync(snapshot.chemin); } catch { /* deja absent */ }
    throw new SnapshotErreur(
      "BACKUP_PUBLICATION_ECHEC",
      "Le backup automatique n'a pas pu etre depose.",
      String((e as Error)?.message ?? e),
    );
  }

  const sizeKo = (fs.statSync(backupPath).size / 1024).toFixed(1);
  console.log(
    `[BACKUP] Base sauvegardee -> ${backupName} (${sizeKo} Ko, ` +
      `${snapshot.lignes} lignes, ${snapshot.tables.length} tables)`,
  );

  // Rotation : le nom contient le timestamp (tri alphabétique = tri
  // chronologique). Les SIDECARS d'un backup supprime partent avec lui.
  const fichiers = fs.readdirSync(backupDir);
  const backups = fichiers
    .filter((f) => f.startsWith("db-") && f.endsWith(".db"))
    .sort();
  while (backups.length > MAX_BACKUPS) {
    const oldest = backups.shift()!;
    for (const suffixe of ["", "-wal", "-shm"]) {
      const p = path.join(backupDir, oldest + suffixe);
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* deja absent */
      }
    }
    console.log(`[BACKUP] Ancien backup supprime : ${oldest}`);
  }
  // Les sidecars ORPHELINS (d'un backup deja supprime par une version
  // anterieure) sont nettoyes aussi : la rotation "5 backups" ne doit pas
  // laisser trainer des fichiers d'anciennes sauvegardes.
  for (const f of fichiers) {
    if (!f.startsWith("db-")) continue;
    if (!f.endsWith("-wal") && !f.endsWith("-shm")) continue;
    if (backups.includes(f.replace(/-(wal|shm)$/, ".db"))) continue;
    try {
      fs.unlinkSync(path.join(backupDir, f));
      console.log(`[BACKUP] Sidecar orphelin supprime : ${f}`);
    } catch {
      /* deja absent */
    }
  }

  return backupPath;
}

/**
 * Demarre le backup automatique : UN backup reel AU DEMARRAGE (chantier 45),
 * puis l'intervalle horaire. Retourne stop() pour arreter l'intervalle.
 */
export function startDbBackup(dataDir: string, db: Database): () => void {
  // Le premier backup est pose tout de suite, et son echec est NOMME et
  // journalise (pas un simple "on essayera plus tard"). L'etat du serveur ne
  // depend pas de lui : un backup rate ne doit pas empeicher l'application
  // de tourner.
  void runDbBackup(dataDir, db).catch((err) => {
    console.error(
      "[BACKUP] Premier backup automatique impossible :",
      err instanceof SnapshotErreur ? `${err.code} - ${err.message}` : err,
    );
  });

  const timer = setInterval(() => {
    void runDbBackup(dataDir, db).catch((err) => {
      console.error("[BACKUP] Erreur lors de la sauvegarde :", err);
    });
  }, BACKUP_INTERVAL_MS);
  return () => clearInterval(timer);
}
