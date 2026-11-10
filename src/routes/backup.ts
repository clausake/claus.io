// Routes : Backup (archive zip du dossier de donnees utilisateur)
// Le dossier de donnees (USER_DATA_PATH) est resolu au demarrage ; la meme
// fonction resolveStorageDir() que initDatabase() garantit le meme chemin.
//
// Chantier 42 — LE SNAPSHOT SQLite EST UN HELPER PARTAGE.
// Cette route NE COPIE PLUS le fichier `.db`. Elle demande un snapshot
// coherent a `snapshotSqlite()` (src/services/snapshot-sqlite.ts), qui
// utilise la sauvegarde EN LIGNE de SQLite : le fichier livre contient les
// dernieres ecritures (celles encore dans le WAL), pas seulement celles
// deja ecrites dans le `.db`. Mesure du defaut : le `.db` nu livre 4 096 o
// sans aucune table, alors que la base pesait 290 816 o.
//
// Chantier 43 — LA GARDE EST CENTRALISEE (src/middleware/garde-maitre.ts).
// Avant, la restriction "maitre" n'existait que dans admin.ts : un compte
// STAFF obtenait ce ZIP, donc la base entiere (hachages argon2, sessions
// vivantes, journal d'audit).
//
// Chantier 44 — LISTE BLANCHE, PAS DE COPIE INTEGRALE.
// L'archive ne contient QUE ce qui doit etre sauvegarde :
//   - le snapshot SQLite (autonome : aucun `-wal`/`-shm` a coter) ;
//   - les reglages, SANS leurs secrets (noms de champs filtres par la regle
//     unique de services/settings.ts) ;
//   - un manifeste de version (nom, version, date, contenu) ;
//   - les uploads utiles (images/PDF des documents).
// Elle n'archive PLUS le dossier Electron en entier : les caches, les
// cookies, `Local Storage`, `Session Storage`, les anciennes sauvegardes et
// les fichiers temporaires y entraient (mesure de l'audit : `Cache/junk.bin`,
// `Network/Cookies` et `backups/old.db` se retrouvaient dans le ZIP).
import { Router } from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import type { Database } from "sqlite";
import { resolveStorageDir } from "../db/init.js";
import type { AuditLogger } from "../services/audit.js";
import { snapshotSqlite, SnapshotErreur } from "../services/snapshot-sqlite.js";
import { exigerMaitre } from "../middleware/garde-maitre.js";
import { sansSecrets, settingsStore } from "../services/settings.js";
import { versionApplication } from "../services/version.js";

/** Les fichiers du dossier de donnees qui NE sont JAMAIS dans l'archive.
 *  Defaut de mesure : le parcours integral y entrainait les caches, les
 *  cookies et les anciennes sauvegardes. */
const EXCLUS = new Set(["backup.zip", "agent_culinaire.db-wal", "agent_culinaire.db-shm"]);

/** Dossiers du profil Electron a ne JAMAIS archiver (caches, cookies,
 *  stockages web). Meme raison que ci-dessus : ils ne sont pas des donnees
 *  de l'etablissement et ils grossissent l'archive sans valeur de reprise. */
const DOSSIERS_EXCLUS = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "Network",
  "Local Storage",
  "Session Storage",
  "Service Worker",
  "blob_storage",
  "backups",
  "db_backups",
  "Crashpad",
]);

/** La liste des fichiers a archiver (hors base et hors reglages), relative
 *  au dossier de donnees. Recursive, en ignorant les exclus. */
function fichiersUtiles(racine: string, sousDossier = ""): Array<{ abs: string; rel: string }> {
  const courant = sousDossier ? path.join(racine, sousDossier) : racine;
  const trouve: Array<{ abs: string; rel: string }> = [];
  let entrees: fs.Dirent[];
  try {
    entrees = fs.readdirSync(courant, { withFileTypes: true });
  } catch {
    return trouve;
  }
  for (const entree of entrees) {
    const nom = entree.name;
    const rel = sousDossier ? path.join(sousDossier, nom) : nom;
    if (!sousDossier && (EXCLUS.has(nom) || DOSSIERS_EXCLUS.has(nom))) continue;
    const abs = path.join(courant, nom);
    if (entree.isDirectory()) {
      trouve.push(...fichiersUtiles(racine, rel));
    } else if (entree.isFile()) {
      // Les fichiers temporaires (`.tmp`, `.part`) ne sont pas des donnees.
      if (/\.(tmp|temp|part|crdownload)$/i.test(nom)) continue;
      trouve.push({ abs, rel });
    }
  }
  return trouve;
}

export default function backupRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();
  const storageDir = resolveStorageDir();

  router.post("/api/backup", exigerMaitre(), async (req, res) => {
    // Le ZIP est ecrit dans un fichier du dossier de donnees, puis
    // TELECHARGE. On n'archive pas en memoire : une archive de plusieurs
    // dizaines de Mo tiendrait mal en RAM, et le fichier permet d'attendre la
    // fermeture REELLE avant de repondre (le defaut mesure : `res.download`
    // partait sur une archive encore ouverte).
    const zipPath = path.join(storageDir, "backup.zip");
    let archive: archiver.Archiver | null = null;
    try {
      // 1. Le snapshot coherent et verifie (chantier 42). Il est refuse si
      //    `integrity_check` ne repond pas "ok" : un snapshot invalide n'est
      //    JAMAIS livre. La destination est un fichier TEMPORAIRE : le
      //    snapshot ne doit jamais se substituer a la base vivante.
      //    (Le nom ne commence pas par un point : `path.extname` rendrait une
      //    chaine vide et Express chercherait une extension -> 404 mesure.)
      const snapshot = await snapshotSqlite(
        db,
        path.join(
          storageDir,
          `snapshot-export-${process.pid}-${Date.now().toString(36)}.db`,
        ),
      );

      // 2. L'archive : liste blanche (chantier 44).
      const sortie = fs.createWriteStream(zipPath);
      let erreurArchive: Error | null = null;
      let rejeterArchive: ((e: Error) => void) | null = null;
      const termine = new Promise<void>((resolve, reject) => {
        rejeterArchive = reject;
        sortie.on("close", () => resolve());
        sortie.on("error", reject);
      });
      archive = archiver("zip", { zlib: { level: 9 } });
      // Une erreur d'archive doit faire ECHOUER la route : sinon elle
      // repondrait 200 avec une archive tronquee (le defaut mesure :
      // `res.download` partait sur une archive encore ouverte).
      archive.on("error", (err: Error) => {
        erreurArchive = err;
        if (rejeterArchive) rejeterArchive(err);
      });
      archive.pipe(sortie);

      // Le snapshot sous le nom attendu par la restauration.
      archive.file(snapshot.chemin, { name: "agent_culinaire.db" });

      // Les reglages, sans leurs secrets (regle unique de services/settings.ts).
      const reglages = sansSecrets(settingsStore.value as Record<string, unknown>);
      archive.append(JSON.stringify(reglages, null, 2), { name: "reglages.json" });

      // Le manifeste : nom, version, date, contenu (une restauration sans
      // manifeste ne sait pas ce qu'elle restaure).
      const uploads = fichiersUtiles(storageDir, "uploads");
      archive.append(
        JSON.stringify(
          {
            application: "claus.io",
            version: versionApplication(),
            genere_le: new Date().toISOString(),
            base: "agent_culinaire.db",
            tables: snapshot.tables,
            lignes: snapshot.lignes,
            uploads: uploads.map((u) => u.rel),
            archive: "reglages.json + agent_culinaire.db + uploads/",
          },
          null,
          2,
        ),
        { name: "manifeste.json" },
      );

      // Les uploads utiles (images/PDF des documents). `fichiersUtiles` rend
      // un chemin RELATIF au dossier de donnees : on y remet le prefixe
      // « uploads/ » pour que l'archive soit lisible telle quelle.
      for (const f of uploads) {
        archive.file(f.abs, { name: f.rel });
      }

      await archive.finalize();
      await termine;
      if (erreurArchive) throw erreurArchive;

      // Le snapshot temporaire est un intermediaire : il ne doit pas rester
      // dans le dossier de donnees (il serait recopie au prochain export).
      try {
        fs.unlinkSync(snapshot.chemin);
      } catch {
        /* deja absent */
      }

      logAudit(req, res, { route: "/api/backup", action: "backup" }).catch(() => {});
      res.download(zipPath, "sauvegarde-clausio.zip");
    } catch (error) {
      if (archive) {
        try {
          archive.abort();
        } catch {
          /* l'archive peut deja etre fermee */
        }
      }
      const code = error instanceof SnapshotErreur ? error.code : "BACKUP_ECHEC";
      console.error("[BACKUP] Erreur :", error);
      res.status(500).json({
        error: code,
        message:
          error instanceof SnapshotErreur
            ? `La sauvegarde a echoue : ${error.message}`
            : "La sauvegarde a echoue.",
      });
    }
  });

  return router;
}
