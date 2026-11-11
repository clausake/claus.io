// Chantier A — la sonde du document de verification 1.0.6 : « 30 exports
// successifs doivent reussir (0 EBUSY) ». Elle exerce LE MEME geste que les
// trois points d'export (le helper snapshotSqlite puis sa publication), donc
// elle porte le meme code que la route /api/backup et le backup horaire.
//
// Un EBUSY sur le rename est exactement ce qui, sous Windows, rendait
// SNAPSHOT_PUBLICATION_ECHEC. Cette sonde rougit si un seul export echoue.
//
// Lancement : node scripts/probe-stress-snapshot.mjs (le code de sortie EST
// le verdict). Le helper est du TypeScript : on le charge par le VRAI CLI
// tsx (scripts/harnais-serveur.cjs), jamais par le script shell .bin.
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";
import { cheminTsx } from "./harnais-serveur.cjs";

const ESSAIS = Number(process.argv[2] ?? 30);
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Le corps de l'epreuve est ecrit dans un .mjs TEMPORAIRE, lance par tsx : le
// helper est en TypeScript et ne s'importe pas par un node nu.
const epreuve = `
import fs from "fs";
import os from "os";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { snapshotSqlite } from ${JSON.stringify(path.join(RACINE, "src", "services", "snapshot-sqlite.ts"))};

const ESSAIS = ${ESSAIS};
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "clausio-stress-"));
const dbChemin = path.join(dossier, "agent_culinaire.db");
const db = await open({ driver: sqlite3.Database, filename: dbChemin });
await db.exec("PRAGMA journal_mode=WAL;");
await db.exec("CREATE TABLE articles (id INTEGER PRIMARY KEY, nom TEXT, quantite REAL);");
for (let i = 0; i < 400; i++) {
  await db.run("INSERT INTO articles (nom, quantite) VALUES (?, ?)", "a-" + i, i);
}
const sorties = path.join(dossier, "exports");
fs.mkdirSync(sorties, { recursive: true });
let ok = 0;
const echecs = [];
for (let i = 0; i < ESSAIS; i++) {
  await db.run("UPDATE articles SET quantite = quantite + 1 WHERE id = ?", i);
  try {
    const s = await snapshotSqlite(db, path.join(sorties, "snapshot-" + i + ".db"));
    if (s.tables.length === 0) throw new Error("snapshot SANS TABLE");
    if (s.octets <= 0) throw new Error("snapshot de 0 octet");
    ok++;
  } catch (e) { echecs.push("#" + i + ": " + (e && e.message)); }
}
// LA MORSURE, jouable ici (EBUSY ne se reproduit que sur NTFS, hors de portee
// de cette machine Linux) : le controle d'integrite du helper doit REFUSER une
// base cassee. On fabrique un fichier SQLite volontairement invalide et on le
// passe par verifierBaseAutonome. Un controle neutralise — le defaut qu'on
// combat — dirait « ok » et CETTE SONDE ROUGIT.
try {
  const casse = path.join(dossier, "cassee.db");
  fs.writeFileSync(casse, "%PDF-1.4 ce n'est pas du SQLite" + "x".repeat(4096));
  const { verifierBaseAutonome } = await import(${JSON.stringify(path.join(RACINE, "src", "services", "snapshot-sqlite.ts"))});
  const d = await verifierBaseAutonome(casse);
  if (d.integrite.trim().toLowerCase() === "ok") {
    echecs.push("morsure: verifierBaseAutonome a dit « ok » sur un fichier non-SQLite");
  } else {
    console.log("MORSURE : le fichier cassee est bien rejete (integrite=" + d.integrite.slice(0, 28) + ")");
  }
} catch (e) { echecs.push("morsure: " + (e && e.message)); }
await db.close();
console.log("STRESS SNAPSHOT : " + ok + "/" + ESSAIS + " exports reussis");
for (const e of echecs) console.log("  ECHEC " + e);
fs.rmSync(dossier, { recursive: true, force: true });
if (echecs.length) { console.log("VERDICT : ROUGE (des exports ont echoue)"); process.exit(1); }
console.log("VERDICT : VERT (0 EBUSY, tous les snapshots sont lisibles)");
process.exit(0);
`;

const fichier = path.join(RACINE, `stress-snapshot-${process.pid}.mjs`);
fs.writeFileSync(fichier, epreuve);
const r = spawnSync(process.execPath, [cheminTsx(RACINE), fichier], {
  stdio: "inherit",
  cwd: RACINE,
});
fs.rmSync(fichier, { force: true });
process.exit(r.status ?? 1);

