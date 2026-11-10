// Chantier 42 — UN SEUL helper serveur de snapshot SQLite coherent.
//
// Le defaut mesure (audit senior du 09/11) : les DEUX exports de la base
// pouvoir etre VIDES. POST /api/backup archivait le `.db` nu alors que la
// base est en WAL : les dernieres ecritures vivent dans `agent_culinaire.db-wal`,
// que la route EXCLUAIT de l'archive. Le ZIP livre donc un fichier de 4 096 o
// sans aucune table. GET /api/admin/db-download telechargeait ce meme `.db`
// nu : 4 096 o, aucune table.
//
// Pourquoi un HELPER, et pas un correctif dans chaque route : les trois
// points d'export (l'archive manuelle, le telechargement direct, la sauvegarde
// automatique horaire) doivent produire le MEME octet. Trois corrections
// se divergeraient au premier changement de schema.
//
// Le mecanisme : la SAUVEGARDE EN LIGNE de SQLite (sqlite3_backup), pas une
// copie de fichier. Mesures faites sur ce poste avant d'ecrire ce fichier :
//   - `db.backup(fichier)` SANS `.step()` ne copie RIEN (fichier de 0 octet) :
//     l'API exige le pilotage explicite du backup ;
//   - `backup(...).step(-1, cb)` copie l'ETAT COMPLET, y compris les ecritures
//     encore dans le WAL ;
//   - la copie herite du mode WAL de la source : on la bascule en `DELETE`
//     pour qu'elle soit AUTONOME (aucun `-wal`/`-shm` a Cote) ;
//   - `VACUUM INTO` produisait un fichier autonome lui aussi, mais il prend un
//     verrou de lecture sur la source : le backup en ligne est le mecanisme
//     prevu pour une base vivante.
//
// Apres generation, on REJOINT le fichier en lecture seule et on lance
// `PRAGMA integrity_check` : un snapshot invalide n'est JAMAIS livre.
import fs from "fs";
import path from "path";
import type { Database } from "sqlite";
import sqlite3 from "sqlite3";

// Le handle natif expose le moteur de sauvegarde en ligne. Les typings
// `@types/sqlite3` ne le declarent pas : on declare ICI la forme exacte
// utilisee (le seuil du depot est 0 `:any`, on ne contourne pas la regle).
interface SauvegardeNative {
  step(pages: number, cb: (err: Error | null) => void): void;
}
interface BaseNative {
  backup(chemin: string): SauvegardeNative;
}

/** Erreur nommee : un snapshot qui ne peut pas etre livre ne l'est pas. */
export class SnapshotErreur extends Error {
  readonly code: string;
  readonly details: string;
  constructor(code: string, message: string, details = "") {
    super(message);
    this.name = "SnapshotErreur";
    this.code = code;
    this.details = details;
  }
}

export interface SnapshotSqlite {
  /** Chemin du snapshot livre (autonome : aucun -wal/-shm requis). */
  chemin: string;
  /** Taille en octets. */
  octets: number;
  /** Tables presentes dans le snapshot. */
  tables: string[];
  /** Nombre de lignes au total (toutes tables). */
  lignes: number;
}

/** La base existe-t-elle sur le disque ? */
export function baseExiste(dbPath: string): boolean {
  try {
    return fs.statSync(dbPath).isFile();
  } catch {
    return false;
  }
}

/** Compter les lignes et lister les tables d'un fichier SQLite ouvert en RO. */
function inspecter(chemin: string): Promise<{ tables: string[]; lignes: number }> {
  const brut = new sqlite3.Database(chemin, sqlite3.OPEN_READONLY);
  const lire = (sql: string): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      brut.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as unknown[])));
    });
  const fermer = (): Promise<void> =>
    new Promise((resolve) => brut.close(() => resolve()));
  return (async () => {
    try {
      const tables = (await lire(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )) as Array<{ name: string }>;
      let lignes = 0;
      for (const t of tables) {
        // Un nom de table vient de sqlite_master : il ne peut pas contenir de
        // guillemet, mais on l'echappe quand meme (le defaut d'un defaut).
        const nom = t.name.replace(/"/g, '""');
        const cpt = (await lire(`SELECT COUNT(*) AS n FROM "${nom}"`)) as Array<{ n: number }>;
        lignes += Number(cpt[0]?.n ?? 0);
      }
      return { tables: tables.map((t) => t.name), lignes };
    } finally {
      await fermer();
    }
  })();
}

/**
 * Produit un snapshot SQLite COHERENT et AUTONOME de la base vivante.
 *
 * @param db        handle du serveur (le vrai, celui qui ecrit)
 * @param chemin    destination du snapshot (le fichier final)
 * @param options   `verifier` : relecture en lecture seule + `integrity_check`
 *                  (defaut : vrai). `ecraser` : autorise une destination
 *                  EXISTANTE (par defaut, le helper REFUSE : ecraser la base
 *                  vivante par un snapshot serait une catastrophe silencieuse).
 *                  `conserverSiEchec` : ne pas supprimer le fichier en cas
 *                  d'echec (debug).
 */
export async function snapshotSqlite(
  db: Database,
  chemin: string,
  options: { verifier?: boolean; conserverSiEchec?: boolean; ecraser?: boolean } = {},
): Promise<SnapshotSqlite> {
  const verifier = options.verifier !== false;
  const dossier = path.dirname(chemin);
  if (!fs.existsSync(dossier)) fs.mkdirSync(dossier, { recursive: true });

  // Garde-fou : on n'ecrase JAMAIS un fichier existant. Le cas concret
  // mesure : un appelant passait la base VIVANTE en destination, et le
  // snapshot la remplacait (le serveur continuait d'ecrire dans l'ancien
  // inode, invisible). Le helper doit dire non, pas ecraser.
  if (!options.ecraser && fs.existsSync(chemin)) {
    throw new SnapshotErreur(
      "CIBLE_EXISTANTE",
      "La destination du snapshot existe deja : elle ne sera pas ecrasee.",
      chemin,
    );
  }

  // Fichier temporaire a cote de la destination : meme systeme de fichiers,
  // donc le renommage final est atomique (un snapshot n'est jamais vu a
  // moitie ecrit par un lecteur concurrent).
  const tmp = `${chemin}.tmp-${process.pid}-${Date.now().toString(36)}`;
  const nettoyer = () => {
    for (const p of [tmp, `${tmp}-wal`, `${tmp}-shm`]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* le fichier a deja disparu : rien a nettoyer */
      }
    }
  };
  nettoyer();

  // 1. Sauvegarde en ligne : l'etat complet, WAL compris.
  let natif: BaseNative;
  try {
    natif = db.getDatabaseInstance() as unknown as BaseNative;
  } catch (e) {
    throw new SnapshotErreur(
      "HANDLE_INDISPONIBLE",
      "Le handle SQLite du serveur n'expose pas la sauvegarde en ligne.",
      String((e as Error)?.message ?? e),
    );
  }
  await new Promise<void>((resolve, reject) => {
    let sauvegarde: SauvegardeNative;
    try {
      sauvegarde = natif.backup(tmp);
    } catch (e) {
      reject(
        new SnapshotErreur(
          "SNAPSHOT_ECHEC",
          "La sauvegarde en ligne a refuse de demarrer.",
          String((e as Error)?.message ?? e),
        ),
      );
      return;
    }
    sauvegarde.step(-1, (err) => {
      if (err) {
        reject(
          new SnapshotErreur(
            "SNAPSHOT_ECHEC",
            "La sauvegarde en ligne a echoue.",
            String(err?.message ?? err),
          ),
        );
        return;
      }
      resolve();
    });
  });

  // 2. Le fichier herite du mode WAL de la source : on le bascule en DELETE
  //    pour qu'il soit AUTONOME (aucun sidecar a copier ni a lors de la
  //    restauration). Mesure : apres bascule, `pragma journal_mode` = delete
  //    et plus aucun `-wal`/`-shm` n'existe a cote.
  await new Promise<void>((resolve, reject) => {
    const brut = new sqlite3.Database(tmp);
    brut.exec("PRAGMA journal_mode=DELETE;", (err) => {
      if (err) {
        brut.close(() =>
          reject(
            new SnapshotErreur(
              "SNAPSHOT_MODE_ECHEC",
              "Le snapshot n'a pas pu etre rendu autonome.",
              String(err.message ?? err),
            ),
          ),
        );
        return;
      }
      brut.close(() => resolve());
    });
  });
  for (const p of [`${tmp}-wal`, `${tmp}-shm`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* sidecar absent ou deja retire */
    }
  }

  // 3. Controle AVANT livraison : relecture en lecture seule + integrite.
  if (verifier) {
    let verdict: string;
    try {
      const brut = new sqlite3.Database(tmp, sqlite3.OPEN_READONLY);
      verdict = await new Promise<string>((resolve, reject) => {
        brut.get("PRAGMA integrity_check;", (err, row) => {
          if (err) reject(err);
          else resolve(String((row as { integrity_check?: string })?.integrity_check ?? ""));
        });
      });
      brut.close(() => undefined);
    } catch (e) {
      if (!options.conserverSiEchec) nettoyer();
      throw new SnapshotErreur(
        "SNAPSHOT_ILLEGIBLE",
        "Le snapshot genere n'a pas pu etre relu.",
        String((e as Error)?.message ?? e),
      );
    }
    if (verdict.trim().toLowerCase() !== "ok") {
      if (!options.conserverSiEchec) nettoyer();
      throw new SnapshotErreur(
        "SNAPSHOT_INVALIDE",
        `Le snapshot n'a pas passe le controle d'integrite : ${verdict}`,
        "integrity_check a repondu autre chose que ok",
      );
    }
  }

  // 4. Publication atomique.
  try {
    fs.renameSync(tmp, chemin);
  } catch (e) {
    if (!options.conserverSiEchec) nettoyer();
    throw new SnapshotErreur(
      "SNAPSHOT_PUBLICATION_ECHEC",
      "Le snapshot n'a pas pu etre publie.",
      String((e as Error)?.message ?? e),
    );
  }

  const { tables, lignes } = await inspecter(chemin);
  let octets = 0;
  try {
    octets = fs.statSync(chemin).size;
  } catch {
    octets = 0;
  }
  return { chemin, octets, tables, lignes };
}

/**
 * Verifie qu'un fichier de base est autonome et sain (lecture seule).
 * Renvoie le verdict, jamais une exception : c'est un diagnostic.
 */
export async function verifierBaseAutonome(
  chemin: string,
): Promise<{ autonome: boolean; integrite: string; tables: string[]; lignes: number }> {
  const vide = { autonome: false, integrite: "FICHIER_ABSENT", tables: [] as string[], lignes: 0 };
  if (!baseExiste(chemin)) return vide;
  let verdict = "";
  try {
    const brut = new sqlite3.Database(chemin, sqlite3.OPEN_READONLY);
    verdict = await new Promise<string>((resolve, reject) => {
      brut.get("PRAGMA integrity_check;", (err, row) => {
        if (err) reject(err);
        else resolve(String((row as { integrity_check?: string })?.integrity_check ?? ""));
      });
    });
    brut.close(() => undefined);
  } catch (e) {
    return { ...vide, integrite: `ILLISIBLE: ${String((e as Error)?.message ?? e)}` };
  }
  const autonome = verdict.trim().toLowerCase() === "ok" && !fs.existsSync(`${chemin}-wal`);
  const { tables, lignes } = await inspecter(chemin);
  return { autonome, integrite: verdict, tables, lignes };
}
