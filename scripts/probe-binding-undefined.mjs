// Sonde brute du COMPORTEMENT DE BINDING de node-sqlite3 sur `undefined`.
//
// POURQUOI ELLE EXISTE. La regle consignee au Sprint 6 (« ne jamais passer un
// `undefined` a l'UPDATE, node-sqlite3 JETTE ») etait VRAISE mais INCOMPLETE,
// et l'incomplet a failli cacher un defaut de la famille la plus chere du
// depot : sur une colonne NULLABLE, `undefined` ne jette PAS, il ecrit NULL en
// silence. Le PUT de src/routes/inventory.ts Touche `unit_price` (NULLABLE) :
// y laisser passer un `undefined` y effaceroit le prix sans aucune erreur
// serveur. Ce qu'une regle dit ne se verifie pas en relisant la regle.
//
// Elle juge DEUX formes de colonne, parce que c'est la distinction qui porte
// tout le verdict: `nullable_col REAL` et `notnull_col REAL NOT NULL`.
//
// Ce qu'elle a rendu (06/09, node 22.23, meme moteur que l'app):
//   insert_undefined_nullable   {"ok":true,"changes":1}   -> la ligne ressort NULL
//   insert_undefined_notnull    {"ok":false,"err":"NOT NULL constraint failed: z.notnull_col"}
//   update_undefined_nullable   {"ok":true,"changes":1}   -> la colonne DEVIENT NULL
//   texte_dans_real             {"nullable_col":"beaucoup","t":"text"}  (affinite dynamique)
//   filtre_auditeur             []   (une valeur en TEXTE ne matche JAMAIS `<= 3`)
//
// Lance: node scripts/probe-binding-undefined.mjs
// rc=0 = la sonde s'est jouee ; les verdicts sont RENDUS (aucun assert) pour
// qu'elle reste relisible quand un doute reapparait sur ce que fait le binding.
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({ filename: ":memory:", driver: sqlite3.Database });
await db.exec("CREATE TABLE z (id TEXT PRIMARY KEY, nullable_col REAL, notnull_col REAL NOT NULL)");

const out = {};
const run = async (label, sql, params) => {
  try {
    const r = await db.run(sql, params);
    out[label] = { ok: true, changes: r && r.changes };
  } catch (e) {
    out[label] = { ok: false, err: String((e && e.message) || e).slice(0, 120) };
  }
};

await run("insert_undefined_nullable", "INSERT INTO z VALUES (?, ?, ?)", ["a", undefined, 5]);
out.ligne_a = await db.get("SELECT nullable_col, notnull_col FROM z WHERE id = 'a'");
await run("insert_undefined_notnull", "INSERT INTO z VALUES (?, ?, ?)", ["b", 1, undefined]);
await run("update_undefined_nullable", "UPDATE z SET nullable_col = ? WHERE id = ?", [undefined, "a"]);
out.ligne_apres_update = await db.get("SELECT nullable_col FROM z WHERE id = 'a'");

// et le cousin du meme defaut: du TEXTE dans une colonne REAL (affinite
// dynamique de SQLite) + ce que devient le filtre de l'auditeur dessus.
await run("update_texte_dans_real", "UPDATE z SET nullable_col = ? WHERE id = ?", ["beaucoup", "a"]);
out.texte_dans_real = await db.get("SELECT nullable_col, typeof(nullable_col) AS t FROM z WHERE id = 'a'");
out.filtre_auditeur = await db.all("SELECT id FROM z WHERE nullable_col <= 3");

for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26), JSON.stringify(v));
console.log("\nMEMO (verdicts de cette sonde, a ne jamais reprendre sur parole):");
console.log(" - `undefined` sur une colonne NULLABLE : accepte, et ecrit NULL (aucune erreur)");
console.log(" - `undefined` sur une colonne NOT NULL : jette une contrainte");
console.log(" - donc `undefined` n'a PAS un comportement unique: on ne le laisse entrer nulle part");
console.log(" - du TEXTE dans une colonne REAL y survit (typeof=text) et ne matche jamais un filtre numerique");
