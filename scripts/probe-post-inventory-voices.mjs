// Sonde brute de POST /api/inventory sur les payloads que l'UI ENVOIE REELLEMENT
// (et non des payloads inventes par la sonde): voir PHASES.md, « juger une route
// d'import avec le payload que l'UI enverRAIT ».
//
// Les trois voies d'ecriture de cette route, relevees dans le code de l'app :
//   V1 InventoryAudit.tsx (handleAddSubmit, ~280) : poste {...newItem, id, status}
//      avec status calcule ('ok' | 'low' | 'critical').
//   V2 DocumentManager.tsx (handleQuickAdd, ~138) : poste {...quickProduct,
//      minStock, unit_price} -- NI `quantity` NI `status` ne sont dans quickProduct.
//   V3 HaccpModules.tsx (saveBatch, ~98) : poste {name, quantity: 0, minStock: 1,
//      unit, status: 'normal', category: 'Sec', allergens}.
//
// Ce que la sonde doit trancher (et non ce que je suppose) :
//   S1 V2, qui n'envoie pas `quantity`, sort-elle en 500 (le binding jette sur
//      `undefined`) ou ecrit-elle quelque chose ? La colonne est NOT NULL.
//   S2 V3 depose status='normal'. La reponse et la base gardent-elles 'normal' ?
//      (le PUT, lui, a un ENUM ferme qui ne connait pas cette valeur)
//   S3 un texte dans une colonne REAL y survit-il (affinite dynamique) et que
//      rend la relécture ? (meme classe que S2 du PUT, jugee ici sur la CREATION)
//   S4 la reponse recite-t-elle le corps de la requete au lieu de relire la base ?
//      Jugé en envoyant une valeur et en comparant avec GET /api/inventory.
//   S5 un `id` deja pris : la route a-t-elle un UNIQUE qui rougit, et que rend la
//      reponse (un succes sur une ligne qui n'existe pas ? un ecrasement ?)
//   S6 un nom absent / blanc : NOT NULL sur name, donc 500 ou 400 ?
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-post");
const TOKEN = `probe-post-inventory-${process.pid}-${Date.now().toString(36)}`;

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

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
  stdio: "pipe",
});
server.on("error", () => process.exit(9));
const groupKilled = () => {
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
};
// Le fils est DETACHE : il est chef de son propre groupe. `server.kill` ne
// vise que son pid, et le `tsx` qu'il a lui-même engendre lui survit (c'est
// precisement le fils remanant qui a tenu les ports FIGES depuis les courses
// precedentes). `process.kill(-pid)` SIGKILL tout le groupe.
server.on("exit", () => groupKilled());

const deadline = Date.now() + 45000;
let pret = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
    if (r.ok) { console.log("INSTANCE ETRANGERE sur le port:", r.headers.get("x-cookdrive-instance")); process.exit(9); }
  } catch { /* pas encore */ }
  await new Promise((r) => setTimeout(r, 400));
}
if (!pret) { console.log("SERVEUR PAS PRET"); process.exit(9); }

const tout = async () => {
  const r = await fetch(`${BASE}/api/inventory`);
  return await r.json();
};
const poste = async (label, data) => {
  const r = await fetch(`${BASE}/api/inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let corps = null;
  try { corps = await r.json(); } catch { corps = "<pas de json>"; }
  const lu = (await tout()).find((i) => i.id === (data.id || (corps && corps.id))) || null;
  console.log(`\n### ${label}`);
  console.log(`    status_http=${r.status}  id_repondu=${corps && corps.id !== undefined ? String(corps.id).slice(0, 22) : "ABSENT"}`);
  console.log(`    reponse_recite=${corps && corps.name !== undefined ? JSON.stringify(corps.name) : "n/a"}`);
  console.log(`    ligne_en_base=${lu ? JSON.stringify({ name: lu.name, quantity: lu.quantity, type_q: typeof lu.quantity, minStock: lu.minStock, unit: lu.unit, status: lu.status, category: lu.category, unit_price: lu.unit_price, yield_percent: lu.yield_percent }) : "AUCUNE"}`);
  return { http: r.status, corps, lu };
};

// --- S4/S1 : la voie V1 (InventoryAudit) telle qu'elle poste --------------
const id1 = "probe-v1-" + Date.now();
await poste("V1 InventoryAudit (telle que handleAddSubmit)", {
  id: id1, name: "Carotte V1", quantity: 10, minStock: 2, unit: "kg",
  category: "Sec", unit_price: 1.5, yield_percent: 100, dlc: "2026-12-31", status: "low",
});

// --- S1 : la voie V2 (DocumentManager quick add) n'envoie NI quantity NI status
await poste("V2 DocumentManager handleQuickAdd (pas de quantity, pas de status)", {
  name: "Filet V2", unit: "kg", category: "Proteines", minStock: 2, unit_price: 0,
});

// --- S2 : la voie V3 (HaccpModules saveBatch) depose status='normal' -------
await poste("V3 HaccpModules saveBatch (status='normal')", {
  name: "Hache V3", quantity: 0, minStock: 1, unit: "kg", status: "normal", category: "Sec",
});

// --- S3 : un texte dans une colonne REAL -----------------------------------
const idTexte = "probe-texte-" + Date.now();
await poste("S3 quantity='beaucoup' dans une colonne REAL", {
  id: idTexte, name: "Test Texte", quantity: "beaucoup", minStock: 1, unit: "kg",
  status: "ok", category: "Sec", unit_price: 1,
});
// et ce que devient le filtre de l'auditeur, quantity <= minStock
const rF = await fetch(`${BASE}/api/alerts`);
const alertes = await rF.json();
console.log(`    /api/alerts -> ${Array.isArray(alertes) ? alertes.length : "?"} alertes, dont celles de la ligne texte: ` +
  JSON.stringify((Array.isArray(alertes) ? alertes : []).filter((a) => String(a.message).includes("Test Texte")).map((a) => ({ sev: a.severity, msg: String(a.message).slice(0, 60) }))));

// --- S5 : un id deja pris --------------------------------------------------
await poste("S5 meme id deux fois", {
  id: id1, name: "CHEVAL DE TROIE", quantity: 999, minStock: 5, unit: "l",
  status: "ok", category: "Autre", unit_price: 7,
});

// --- S6 : nom absent / blanc -----------------------------------------------
await poste("S6 name absent", { id: "probe-sans-nom-" + Date.now(), quantity: 1, minStock: 0, unit: "kg", status: "ok", category: "Sec" });
await poste("S6b name blanc", { id: "probe-blanc-" + Date.now(), name: "   ", quantity: 1, minStock: 0, unit: "kg", status: "ok", category: "Sec" });

// --- S7 : quantite negative / infinie / nulle -----------------------------
await poste("S7 quantity negative", { id: "probe-neg-" + Date.now(), name: "Negatif", quantity: -5, minStock: 0, unit: "kg", status: "ok", category: "Sec" });
await poste("S7b quantity infinie", { id: "probe-inf-" + Date.now(), name: "Infini", quantity: 1e999, minStock: 0, unit: "kg", status: "ok", category: "Sec" });

// --- S8 : body vide et corps non-objet ------------------------------------
for (const [label, body] of [["S8 {}", {}], ["S8b name=42 (nombre)", { name: 42, quantity: 1, minStock: 0, unit: "kg", status: "ok", category: "Sec" }]]) {
  const r = await fetch(`${BASE}/api/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### ${label}\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 140)}`);
}

server.kill("SIGTERM");
groupKilled();
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s'est jouee; les verdicts sont au-dessus, asserts par aucun test).");
