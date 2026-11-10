// Chantier 49 — REPRENDRE LES DONNEES D'UNE ANCIENNE INSTALLATION.
//
// Le constat reel (audit senior du 09/11) : sur le poste du client, deux
// dossiers ont coexiste :
//   C:\Users\<claud>\AppData\Roaming\ClausIO              (l'install actuelle)
//   C:\Users\<claud>\AppData\Roaming\agent-culinaire-os   (l'ancienne)
// Apres reinstallation, l'application montre une base NEUVE : le client
// croit avoir perdu son stock, alors que l'ancienne base est toujours la.
//
// Les quatre regles du produit (audit) :
//   1. la detection se fait en LECTURE SEULE sur les bases anciennes
//      connues ;
//   2. l'import n'est PROPOSE que si l'installation nouvelle est vierge
//      (hors kit de demonstration) ;
//   3. une base active NON VIDE n'est JAMAIS ecrasee ;
//   4. un snapshot de securite est pose AVANT l'import, et les uploads
//      accompanies sont importes aussi.
//
// L'import se fait par ATTACH + INSERT : la base VIVANTE n'est jamais
// remplacee sur le disque (le serveur ecrit dans le fichier ouvert ; le
// remplacer sous ses pieds est une operation silencieusement destructrice).
import fs from "fs";
import path from "path";
import os from "os";
import type { Database } from "sqlite";
import sqlite3 from "sqlite3";
import { snapshotSqlite } from "./snapshot-sqlite.js";

/** Les noms de dossier qu'une ancienne installation a laisse derriere elle. */
export const NOMS_ANCIENS = [
  "agent-culinaire-os",
  "agent_culinaire_os",
  "agentculinaire",
  "ClausIO",
  "cookdrive-project",
];

/** Les tables qui ne sont JAMAIS importees (etat local, pas donnee). */
const TABLES_EXCLUES = new Set(["sqlite_sequence", "sessions", "demo_kit"]);

export interface DossierAncien {
  /** Le dossier candidat. */
  dossier: string;
  /** Le fichier de base qu'il contient (s'il y en a un). */
  base: string | null;
  /** Tables lues en lecture seule. */
  tables: string[];
  /** Nombre de lignes de metier (toutes tables hors exclusions). */
  lignes: number;
  /** Date de derniere modification du fichier de base. */
  modifie_le: string | null;
  /** Le dossier existe-t-il vraiment ? */
  present: boolean;
}

/** Le dossier de donnees actif (le meme que resolveStorageDir). */
export function dossierDonneesActif(): string {
  const impose = process.env.USER_DATA_PATH;
  if (impose) return impose;
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(home, "AppData", "Roaming", "ClausIO")
    : path.join(home, ".clausio");
}

/**
 * Les dossiers ancienne installation CANDIDATS, lus en lecture seule.
 * On regarde le dossier ACTIF et ses voisins (l'AppData d'un poste Windows
 * contient les deux). Aucun fichier n'est ecrit, aucun fichier n'est ouvert
 * en ecriture.
 */
export async function detecterDossiersAnciens(dossierActif: string): Promise<DossierAncien[]> {
  const parent = path.dirname(dossierActif);
  const vus = new Set<string>();
  const candidats: string[] = [];

  // 1. Les voisins connus du dossier actif.
  for (const nom of NOMS_ANCIENS) {
    const candidat = path.join(parent, nom);
    if (candidat !== dossierActif && !vus.has(candidat)) {
      vus.add(candidat);
      candidats.push(candidat);
    }
  }
  // 2. Les voisins REELS du dossier actif : un ancien dossier peut porter
  //    un nom qu'on ne connait pas (le client l'a renomme). On ne retient
  //    que ceux qui contiennent une base lisible — le reste est ignore.
  try {
    for (const nom of fs.readdirSync(parent)) {
      const candidat = path.join(parent, nom);
      if (candidat === dossierActif || vus.has(candidat)) continue;
      let estDossier = false;
      try {
        estDossier = fs.statSync(candidat).isDirectory();
      } catch {
        continue;
      }
      if (!estDossier) continue;
      if (!fs.existsSync(path.join(candidat, "agent_culinaire.db"))) continue;
      vus.add(candidat);
      candidats.push(candidat);
    }
  } catch {
    /* parent illisible : on garde les candidats connus */
  }

  const lus: DossierAncien[] = [];
  for (const dossier of candidats) {
    lus.push(await inspecterDossierAncien(dossier));
  }
  return lus;
}

/** Lit un dossier ancien EN LECTURE SEULE et resume son contenu. */
export async function inspecterDossierAncien(dossier: string): Promise<DossierAncien> {
  const base = path.join(dossier, "agent_culinaire.db");
  const vide: DossierAncien = {
    dossier,
    base: null,
    tables: [],
    lignes: 0,
    modifie_le: null,
    present: false,
  };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(base);
  } catch {
    return vide;
  }
  const resultat: DossierAncien = {
    ...vide,
    base,
    present: true,
    modifie_le: stat.mtime.toISOString(),
  };
  // Lecture STRICTEMENT en lecture seule : la base ancienne ne doit subir
  // AUCUNE ecriture (pas meme un -wal cree par un lecteur maladroit).
  const brut = new sqlite3.Database(base, sqlite3.OPEN_READONLY);
  const lire = (sql: string): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      brut.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as unknown[])));
    });
  try {
    const tables = (await lire(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )) as Array<{ name: string }>;
    let lignes = 0;
    for (const t of tables) {
      if (TABLES_EXCLUES.has(t.name)) continue;
      const nom = t.name.replace(/"/g, '""');
      const cpt = (await lire(`SELECT COUNT(*) AS n FROM "${nom}"`)) as Array<{ n: number }>;
      lignes += Number(cpt[0]?.n ?? 0);
    }
    resultat.tables = tables.map((t) => t.name);
    resultat.lignes = lignes;
  } catch {
    /* base illisible : elle reste presente mais vide pour l'appelant */
  } finally {
    brut.close(() => undefined);
  }
  return resultat;
}

/**
 * L'installation active est-elle VIERGE (hors kit de demonstration) ?
 * Le kit est trace dans `demo_kit` : ses lignes ne comptent pas comme des
 * donnees (sinon le client ne pourrait jamais importer apres le premier
 * lancement, qui pose le kit).
 */
export async function baseViergeHorsKit(db: Database): Promise<boolean> {
  const tables = ["inventory", "recipes", "documents", "haccp_documents", "menu_planning"];
  for (const table of tables) {
    const lignes = (await db.all(`SELECT id FROM "${table}"`)) as Array<{ id: string }>;
    if (lignes.length === 0) continue;
    const tracees = (await db.all(
      "SELECT entite_id FROM demo_kit WHERE entite != 'marque'",
    )) as Array<{ entite_id: string }>;
    const ids = new Set(tracees.map((t) => t.entite_id));
    for (const l of lignes) {
      if (!ids.has(l.id)) return false;
    }
  }
  return true;
}

export interface ResultatImport {
  tables: Array<{ table: string; lignes: number }>;
  lignes: number;
  uploads: number;
  snapshot: string | null;
}

/**
 * Importe les donnees d'une base ancienne dans la base active.
 *
 * Refuse (et le dit) si l'installation active n'est PAS vierge : une base
 * active non vide n'est jamais ecrasee. Pose un snapshot de securite avant,
 * puis copie les lignes par ATTACH (la base vivante n'est pas remplacee) et
 * les uploads.
 */
export async function importerDonneesAnciennes(
  db: Database,
  dossierActif: string,
  dossierAncien: string,
): Promise<ResultatImport> {
  if (!(await baseViergeHorsKit(db))) {
    throw new Error(
      "IMPORT_REFUSE_BASE_ACTIVE : l'installation active contient deja des donnees ; " +
        "aucun ecrasement n'est possible.",
    );
  }
  const baseAncienne = path.join(dossierAncien, "agent_culinaire.db");
  if (!fs.existsSync(baseAncienne)) {
    throw new Error("IMPORT_REFUSE_BASE_ABSENTE : l'ancienne base est introuvable.");
  }

  // 1. Snapshot de securite AVANT import (le client peut toujours
  //    revenir en arriere : le snapshot est dans <donnees>/backups/).
  let snapshot: string | null = null;
  try {
    const dossierBackups = path.join(dossierActif, "backups");
    if (!fs.existsSync(dossierBackups)) fs.mkdirSync(dossierBackups, { recursive: true });
    const garde = await snapshotSqlite(
      db,
      path.join(
        dossierBackups,
        `avant-import-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
      ),
    );
    snapshot = garde.chemin;
  } catch (e) {
    throw new Error(
      "IMPORT_REFUSE_SNAPSHOT : le snapshot de securite n'a pas pu etre pose ; " +
        "l'import est refuse plutot que de risquer la base active.",
    );
  }

  // 2. Copie des lignes par ATTACH (la base active n'est pas remplacee).
  const attache = "ancien_import";
  await db.run(`ATTACH DATABASE ? AS ${attache}`, [baseAncienne]);
  const copie: Array<{ table: string; lignes: number }> = [];
  let lignes = 0;
  try {
    const tablesAnciennes = (await db.all(
      `SELECT name FROM ${attache}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )) as Array<{ name: string }>;
    const tablesActives = (await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )) as Array<{ name: string }>;
    const actives = new Set(tablesActives.map((t) => t.name));

    for (const t of tablesAnciennes) {
      const nom = t.name;
      if (TABLES_EXCLUES.has(nom)) continue;
      if (!actives.has(nom)) continue;
      // Colonnes communes : les schemas evoluent d'une version a l'autre,
      // on ne copie que les colonnes presentes des DEUX cotes.
      const colonnesAnciennes = (await db.all(`PRAGMA ${attache}.table_info("${nom}")`)) as Array<{
        name: string;
      }>;
      const colonnesActives = (await db.all(`PRAGMA table_info("${nom}")`)) as Array<{ name: string }>;
      const communes = colonnesAnciennes
        .map((c) => c.name)
        .filter((c) => colonnesActives.some((a) => a.name === c));
      if (communes.length === 0) continue;
      const liste = colonnesAnciennes.map((c) => c.name).join(",");
      const cibles = communes.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
      const source = colonnesAnciennes.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
      const sql = `INSERT OR REPLACE INTO main."${nom.replace(/"/g, '""')}" (${cibles}) ` +
        `SELECT ${source} FROM ${attache}."${nom.replace(/"/g, '""')}"`;
      try {
        await db.run(sql);
        const cpt = (await db.get(`SELECT COUNT(*) AS n FROM main."${nom.replace(/"/g, '""')}"`)) as {
          n: number;
        };
        const n = Number(cpt?.n ?? 0);
        copie.push({ table: nom, lignes: n });
        lignes += n;
      } catch (e) {
        // Une table qui ne se copie pas (schema incompatible) n'annule pas
        // l'import : elle est signalee, pas fatale.
        copie.push({ table: nom, lignes: 0 });
      }
    }
  } finally {
    await db.exec(`DETACH DATABASE ${attache}`);
  }

  // 3. Les uploads accompagnants (images/PDF des documents).
  let uploads = 0;
  const dossierUploadsAncien = path.join(dossierAncien, "uploads");
  const dossierUploadsActif = path.join(dossierActif, "uploads");
  if (fs.existsSync(dossierUploadsAncien)) {
    if (!fs.existsSync(dossierUploadsActif)) fs.mkdirSync(dossierUploadsActif, { recursive: true });
    const fichiers = ((): string[] => {
      try {
        return fs.readdirSync(dossierUploadsAncien);
      } catch {
        return [];
      }
    })();
    for (const nom of fichiers) {
      const source = path.join(dossierUploadsAncien, nom);
      const cible = path.join(dossierUploadsActif, nom);
      try {
        if (!fs.statSync(source).isFile()) continue;
        if (fs.existsSync(cible)) continue; // on n'ecrase pas un upload existant
        fs.copyFileSync(source, cible);
        uploads++;
      } catch {
        /* upload non copie : signale par le compte */
      }
    }
  }

  return { tables: copie, lignes, uploads, snapshot };
}
