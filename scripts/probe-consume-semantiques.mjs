// Sonde brute des SEMANTIQUES de node-sqlite3 que POST /api/inventory/consume
// s'apprete a utiliser, et contre lesquelles j'avais TROIS hypotheses dont une
// etait FAUSSE. Elle est la pour qu'aucune de ces theses ne soit jamais reprise
// sur parole (ni par moi, ni par un autre cerveau qui reprendrait le depot).
//
// Ce qu'elle tablit, sur `id TEXT PRIMARY KEY, q REAL NOT NULL` :
//   - `UPDATE ... WHERE id = ?` sur une clef inexistante : ok, changes: 0.
//     Il ne JETTE pas. Donc un compteur de lignes touchees est le seul temoin
//     independant du corps de la reponse.
//   - `BEGIN TRANSACTION` : la grammaire SQLite est
//     `BEGIN [DEFERRED|IMMEDIATE|EXCLUSIVE] [TRANSACTION]` — c'est DONC une
//     instruction VALIDE. Mon enonce initial « ce texte n'existe pas en SQLite,
//     le ROLLBACK etait un no-op » etait FAUX : apres BEGIN TRANSACTION +
//     UPDATE + ROLLBACK la valeur est RESTAUREE (la sonde le rend, pas mon
//     souvenir). Ce qui est juge ici est l'effet REEL (la valeur apres
//     annulation), jamais la presence d'un mot dans le texte de la commande.
//   - `BEGIN IMMEDIATE` + UPDATE + ROLLBACK : valeur restauree pareillement;
//     seule difference, le verrou d'ecriture est pris a l'entree.
//   - un NaN lie dans un `?` d'une colonne REAL NOT NULL : JETTE une contrainte
//     (`NOT NULL constraint failed`). Le garde amont de la route sert donc a la
//     LISIBILITE du refus (400 nomme au lieu d'un 500 du catch) et NON a empecher
//     un NaN grave — ma seconde hypothesis (« le NaN est ecrit sans se plaindre »)
//     ne tenait que sur une colonne SANS NOT NULL.
//
// Lanc: node scripts/probe-consume-semantiques.mjs   (rc=0 = la sonde s'est jouee;
// les verdicts sont RENDUS, ils ne sont pas asserts par le script: c'est une
// sonde, pas une porte — ce qui la rend relisible quand un doute reapparait).
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({ filename: ":memory:", driver: sqlite3.Database });
await db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, q REAL NOT NULL)");
await db.run("INSERT INTO t VALUES ('a', 10)");
await db.run("INSERT INTO t VALUES ('b', 10)");

const out = {};
const run = async (label, sql, params) => {
  try {
    const r = params === undefined ? await db.run(sql) : await db.run(sql, params);
    out[label] = { ok: true, changes: r && r.changes };
  } catch (e) {
    out[label] = { ok: false, err: String((e && e.message) || e) };
  }
};

// (1) le compteur de lignes touchees, seul temoin independant du corps HTTP
await run("upd_1_ligne", "UPDATE t SET q = ? WHERE id = ?", [7, "a"]);
await run("upd_0_ligne_clef_inconnue", "UPDATE t SET q = ? WHERE id = ?", [7, "zzz"]);
await run("upd_2_lignes", "UPDATE t SET q = ? WHERE id IN ('a','b')", [5]);

// (2) NaN dans un ? d'une colonne NOT NULL
await run("upd_nan_not_null", "UPDATE t SET q = ? WHERE id = ?", [Number.NaN, "a"]);
out.ligne_apres_nan = await db.get("SELECT q FROM t WHERE id = 'a'");

// (3) la forme que l'ANCIEN code employait, et son effet REEL
await run("begin_transaction", "BEGIN TRANSACTION");
await run("upd_dans_txn", "UPDATE t SET q = ? WHERE id = ?", [123, "a"]);
out.en_transaction = await db.get("SELECT q FROM t WHERE id = 'a'");
await run("rollback", "ROLLBACK");
out.apres_rollback = await db.get("SELECT q FROM t WHERE id = 'a'");

// (4) la forme gardee par la route (verrou d'entree)
await run("begin_immediate", "BEGIN IMMEDIATE");
await run("upd_dans_txn_2", "UPDATE t SET q = ? WHERE id = ?", [999, "a"]);
out.en_immediate = await db.get("SELECT q FROM t WHERE id = 'a'");
await run("rollback_2", "ROLLBACK");
out.apres_rollback_2 = await db.get("SELECT q FROM t WHERE id = 'a'");

// (5) db.get sur une clef inexistante: undefined, pas un tableau vide
out.get_clef_inconnue = await db.get("SELECT q FROM t WHERE id = ?", ["zzz"]);
out.get_existant = await db.get("SELECT q FROM t WHERE id = ?", ["a"]);

for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26), JSON.stringify(v));
console.log("\nMEMO (verdicts de cette sonde, a ne jamais reprendre sur parole):");
console.log(" - changes vaut 0 sur une clef inconnue, sans jeter");
console.log(" - BEGIN TRANSACTION est VALIDE (grammaire: BEGIN [MODE] [TRANSACTION])");
console.log(" - ROLLBACK annule REELLEMENT (q revient a sa valeur d'avant)");
console.log(" - un NaN dans une colonne REAL NOT NULL jette une contrainte");
console.log(" - db.get(clef inconnue) rend undefined");
