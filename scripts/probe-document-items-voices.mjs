// Sonde de la voie D'IMPORT DE FACTURE (DocumentManager -> POST /api/documents),
// jouee avec le payload que l'UI construit REELLEMENT.
//
// POURQUOI: DocumentManager.tsx (handleAddItem ~107) initialise chaque ligne a
// {quantity:"", unit_price:""} et le formulaire ne convertit rien avant l'envoi.
// Or `document_items.quantity` est `REAL NOT NULL` en base (src/db/init.ts) et
// `received_quantity` est ajoute par migration. Ce qui arrive au binding quand
// l'UI envoie la chaine VIDE n'est pas ce que je decide de chez moi.
//
// ⚠ LA PREMIERE VERSION DE CETTE SONDE AVAIT UN VERDICT CREUX. Elle relisait
// par GET /api/documents/:id et receevait du HTML (cette route rend un 404
// renvoye vers le SPA), donc `res.json()` levt un SyntaxError sur « <!doctype »
// et la sonde affichoit « relecture impossible » — ce qui ne prouvait RIEN et
// laissit croire que le 200 etait un succes. La relecture passe desorais par la
// BASE DE L'INSTANCE DU TEST (l'API du depot, src/db/init.ts:80:
// `open({filename, driver: sqlite3.Database})`). Lecon: un GET qui ne rend pas
// ce qu'on attend n'est pas une absence de donnee; et « la reponse n'a pas leve
// » n'est jamais un PASS.
//
// Verdicts rendus (06/09, node 22.23, instance isolee + garde d'identite):
//   A  quantity:"", unit_price:""  -> http=200 et EN BASE quantity='' (t_q=text)
//   B  ligne valide + ligne vide   -> les DEUX lignes ecrites, la vide en TEXT
//   C  quantity:"beaucoup"         -> http=200, relu "beaucoup" (t_q=text)
//   D  quantity absente            -> http=500 « Failed to save document »
//   E  sans items / F non-tableau  -> http=500
//   G  inventory_id inconnu        -> http=200, ligne ORPHELINEE en base
//   H  total_amount:"42,50"        -> http=200, relu en TEXTE dans une REAL
//   tous les received_quantity     -> NULL (la reception n'a aucune base)
//
// Lanc: node scripts/probe-document-items-voices.mjs
// rc=0 = elle s'est jouée ; les verdicts sont RENDUS (aucun assert), juges par
// un spec de contrat quand il existe.
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-docitems");
const TOKEN = "probe-document-items";

async function portLibre() {
  return await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}
async function attendrePortLibre(port) {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const libre = await new Promise((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
    });
    if (libre) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = await portLibre();
await attendrePortLibre(PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
  stdio: "pipe",
});
server.on("error", () => process.exit(9));

let pret = false;
const deadline = Date.now() + 45000;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    const e = r.headers.get("x-cookdrive-instance");
    if (r.ok && e === TOKEN) { pret = true; break; }
    if (r.ok && e) { console.log("INSTANCE ETRANGERE:", e); process.exit(9); }
  } catch { /* pas encore a l'ecoute */ }
  await new Promise((r) => setTimeout(r, 400));
}
if (!pret) { console.log("SERVEUR PAS PRET"); process.exit(9); }

// L'API est CELLE DU DEPOT (src/db/init.ts:80), pas un sqlite3.open() invente.
const dbInstance = await open({
  filename: path.join(DATA_DIR, "agent_culinaire.db"),
  driver: sqlite3.Database,
});
await dbInstance.run("PRAGMA busy_timeout = 8000");

// un article reel, cree par la voie de l'app
const inv = await (await fetch(`${BASE}/api/inventory`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Tomate probe", quantity: 10, minStock: 1, unit: "kg", unit_price: 2 }),
})).json();
const inventoryId = inv.id || (inv.item && inv.item.id);

const upload = async (label, corps) => {
  const r = await fetch(`${BASE}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  let json = null;
  try { json = await r.json(); } catch { json = "<pas de json>"; }
  console.log(`\n### ${label}`);
  console.log(`    status_http=${r.status}`);
  console.log(`    corps=${JSON.stringify(json).slice(0, 220)}`);
  const id = json && (json.id || (json.document && json.document.id) || json.docId);
  if (!id) {
    console.log("    (pas de clef rendue: la reponse de creation ne dit pas ou est la ligne)");
    return { http: r.status, json, lignes: null };
  }
  const ls = await dbInstance.all(
    `SELECT di.original_name, di.quantity, typeof(di.quantity) AS t_q,
            di.unit_price, typeof(di.unit_price) AS t_p, di.received_quantity, di.inventory_id
       FROM document_items di WHERE di.document_id = ? ORDER BY di.rowid`,
    [id],
  );
  for (const l of ls) console.log(`    ligne_en_base=${JSON.stringify(l)}`);
  if (ls.length === 0) console.log("    ligne_en_base=AUCUNE");
  return { http: r.status, json, lignes: ls };
};

const baseDoc = (items, extra) => ({
  type: "FACTURE", supplier: "Probe Metro", date: "2026-09-12", total_amount: 10,
  items, ...extra,
});

// A. la forme EXACTE de l'UI: quantity et unit_price en CHAINES VIDES
await upload("A lignes telles que handleAddItem les cree (quantity:'', unit_price:'')",
  baseDoc([{ inventory_id: inventoryId, original_name: "T1", quantity: "", unit_price: "", lot_number: "", dlc: "" }]));

// B. une ligne valide + une ligne a quantite vide : le chef est-il prévenu ?
await upload("B melange valide + quantite vide",
  baseDoc([
    { inventory_id: inventoryId, original_name: "OK", quantity: 5, unit_price: 3 },
    { inventory_id: inventoryId, original_name: "VIDE", quantity: "", unit_price: 3 },
  ]));

// C. quantite en texte non numerique
await upload("C quantite 'beaucoup'",
  baseDoc([{ inventory_id: inventoryId, original_name: "X", quantity: "beaucoup", unit_price: 2 }]));

// D. quantite absente du tout
await upload("D quantite absente",
  baseDoc([{ inventory_id: inventoryId, original_name: "Y", unit_price: 2 }]));

// E / F. payload sans lignes exploitables
await upload("E sans items", baseDoc(undefined));
await upload("F items non-tableau", baseDoc("tout"));

// G. clef d'article inexistante (aucune cle etrangere n'est-elle verifiee ?)
await upload("G inventory_id inconnu",
  baseDoc([{ inventory_id: "pas-un-article-42", original_name: "Z", quantity: 2, unit_price: 1 }]));

// H. un total en texte a la saisie francaise
await upload("H total_amount '42,50' (et '42.50')",
  baseDoc([{ inventory_id: inventoryId, original_name: "TT", quantity: 2, unit_price: 1 }],
    { total_amount: "42,50" }));
const h2 = await upload("H2 total_amount '42.50'",
  baseDoc([{ inventory_id: inventoryId, original_name: "TT2", quantity: 2, unit_price: 1 }],
    { total_amount: "42.50" }));
if (h2.json && h2.json.document) {
  const relu = await dbInstance.get("SELECT total_amount, typeof(total_amount) AS t FROM documents WHERE id = ?",
    [h2.json.document.id]);
  console.log(`    total_relu_en_base=${JSON.stringify(relu)}`);
}

// Le comptage final aussi se fait EN BASE: un GET qui rendrait une liste vide
// (ou du HTML) ne doit pas pouvoir faire passer « rien en base » comme un verdict.
console.log("\n=== COMOTEURS RELIS EN BASE (et non par un GET) ===");
console.log("   documents       :", (await dbInstance.get("SELECT COUNT(*) AS n FROM documents")).n);
console.log("   document_items  :", (await dbInstance.get("SELECT COUNT(*) AS n FROM document_items")).n);
const texte = await dbInstance.all(
  "SELECT original_name, quantity, typeof(quantity) AS t FROM document_items WHERE typeof(quantity) NOT IN ('real','integer')",
);
console.log("   quantites en TEXTE dans une colonne REAL NOT NULL :", texte.length, JSON.stringify(texte));
const sansReception = await dbInstance.get(
  "SELECT COUNT(*) AS n FROM document_items WHERE received_quantity IS NULL",
);
console.log("   received_quantity NULL (la reception n'a aucune base) :", sansReception.n);
const orphelines = await dbInstance.all(
  `SELECT di.id, di.inventory_id FROM document_items di
     LEFT JOIN inventory i ON i.id = di.inventory_id WHERE i.id IS NULL`,
);
console.log("   lignes a clef d article INEXISTANTE:", orphelines.length, JSON.stringify(orphelines));
await dbInstance.close();

server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s'est jouée; les verdicts sont au-dessus, asserts par aucun test).");
