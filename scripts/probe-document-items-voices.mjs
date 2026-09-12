// Sonde de la voie D'IMPORT DE FACTURE (DocumentManager -> POST /api/documents),
// jouee avec le payload que l'UI construit REELLEMENT (DocumentManager.tsx
// handleAddItem ~107 initialise chaque ligne {quantity:"", unit_price:""} et le
// formulaire ne force aucune conversion avant l'envoi).
//
// POURQUOI: les colonnes `quantity` et `received_quantity` sont `NOT NULL` en
// base (src/db/init.ts: document_items.quantity REAL NOT NULL). Ce qui arrive au
// binding quand l'UI envoie la chaine VIDE n'est pas ce que je decide de chez
// moi : soit la route le convertit (et il faut savoir en quoi), soit il part en
// NOT NULL violation et l'import de facture entier meurt d'un 500 sur un champ
// que le chef n'a pas eu a remplir.
//
// La sonde rend aussi si `received_quantity` (ajoutee par migration) recoit une
// valeur a l'upload, et si les lignes rejetees sont NOMMEES au chef.
//
// Lance: node scripts/probe-document-items-voices.mjs (rc=0 = elle s'est jouee).
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

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
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
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
  } catch { /* pas encore */ }
  await new Promise((r) => setTimeout(r, 400));
}
if (!pret) { console.log("SERVEUR PAS PRET"); process.exit(9); }

// un article reel, cree par la voie de l'app
const inv = await (await fetch(`${BASE}/api/inventory`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Tomate probe", quantity: 10, minStock: 1, unit: "kg", unit_price: 2 }),
})).json();
const inventoryId = inv.id || inv.item?.id;

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
  console.log(`    corps=${JSON.stringify(json).slice(0, 300)}`);
  // relire le document et ses lignes par la voie de lecture de l'app
  const id = json && (json.id || json.document?.id || json.docId);
  if (id) {
    try {
      const d = await (await fetch(`${BASE}/api/documents/${id}`)).json();
      console.log(`    relu=${JSON.stringify(d).slice(0, 420)}`);
    } catch (e) { console.log(`    relecture impossible: ${e}`); }
  }
  return { http: r.status, json };
};

// A. la forme EXACTE de l'UI: quantity et unit_price en CHAINES VIDES
await upload("A lignes telles que handleAddItem les cree (quantity:'', unit_price:'')", {
  type: "FACTURE",
  supplier: "Probe Metro",
  date: "2026-09-12",
  total_amount: 42.5,
  items: [
    { inventory_id: inventoryId, original_name: "Tomate 5kg", quantity: "", unit_price: "", lot_number: "", dlc: "" },
  ],
});

// B. une ligne valide + une ligne a quantite vide : le chef est-il prévenu ?
await upload("B melange valide + quantite vide", {
  type: "FACTURE",
  supplier: "Probe Metro",
  date: "2026-09-12",
  total_amount: 100,
  items: [
    { inventory_id: inventoryId, original_name: "OK", quantity: 5, unit_price: 3 },
    { inventory_id: inventoryId, original_name: "VIDE", quantity: "", unit_price: 3 },
  ],
});

// C. quantite en texte non numerique
await upload("C quantite 'beaucoup'", {
  type: "FACTURE", supplier: "S", date: "2026-09-12", total_amount: 10,
  items: [{ inventory_id: inventoryId, original_name: "X", quantity: "beaucoup", unit_price: 2 }],
});

// D. quantite absente du tout
await upload("D quantite absente", {
  type: "FACTURE", supplier: "S", date: "2026-09-12", total_amount: 10,
  items: [{ inventory_id: inventoryId, original_name: "Y", unit_price: 2 }],
});

// E. sans items du tout
await upload("E sans items", { type: "FACTURE", supplier: "S", date: "2026-09-12", total_amount: 10 });

// F. items non-tableau
await upload("F items non-tableau", { type: "FACTURE", supplier: "S", total_amount: 1, items: "tout" });

// G. clef d'article inexistante
await upload("G inventory_id inconnu", {
  type: "FACTURE", supplier: "S", total_amount: 1,
  items: [{ inventory_id: "pas-un-article-42", original_name: "Z", quantity: 2, unit_price: 1 }],
});

// H. la voie de validation qui en depend: le document d'A a-t-il survecu ?
const liste = await (await fetch(`${BASE}/api/documents`)).json();
console.log(`\n### documents en base: ${Array.isArray(liste) ? liste.length : JSON.stringify(liste).slice(0, 80)}`);
console.log("    " + JSON.stringify((Array.isArray(liste) ? liste : []).map((d) => ({ id: d.id, type: d.type, total: d.total_amount, status: d.status }))));

server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s'est jouée; les verdicts sont au-dessus, asserts par aucun test).");
