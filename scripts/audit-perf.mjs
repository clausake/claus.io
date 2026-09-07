// Mesures de terrain pour l'audit perf (chemin HTTP reel = chemin de prod).
//  1. debit de polling du front vs rate-limit global 300/15min
//  2. headers de cache HTTP des assets (ETag / Cache-Control)
//  3. latence des endpoints lourds (scans sans index, agregats recalculs)
//  4. poids reel du chargement d'EpicureModel + des embeddings
// Usage: node scripts/audit-perf.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync, statSync } from "node:fs";
import process from "node:process";

const PORT = 4125;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(process.cwd(), "test", "tmp-perf");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const t0 = process.hrtime.bigint();
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "production" },
  stdio: "pipe",
});
const logs = [];
child.stdout.on("data", (d) => logs.push(d.toString()));
child.stderr.on("data", (d) => logs.push(d.toString()));

let readyMs = -1;
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${BASE}/api/settings`); if (r.ok) { readyMs = Number(process.hrtime.bigint() - t0) / 1e6; break; } } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`\n=== 1. demarrage (cold, inclut EpicureModel + 3 x 2.1 Mo d'embeddings) ===`);
console.log(`pret en ${readyMs.toFixed(0)} ms`);
const epic = logs.filter((l) => l.includes("EpicureModel")).join("").trim();
console.log(epic || "(aucun log EpicureModel)");

// --- seeding via l'API seule (pas de pilote sqlite3 requis) ---
const post = (p, body) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const inv = await post("/api/inventory", { name: "Souche Audit", quantity: 3, minStock: 1, unit: "kg", status: "active", category: "Divers", unit_price: 4 });
const invId = (await inv.json()).id;
const sup = await post("/api/suppliers", { name: "Frs Audit", contact: "-", email: "a@b.c", phone: "0", category: "Gros", delivery_time: "24h" });
const supId = (await sup.json()).id;
for (let i = 0; i < 12; i++) await post("/api/supplier-prices", { supplier_id: supId, inventory_id: invId, raw_unit_price: 1 + i * 0.1, unit: "kg" });

console.log(`\n=== 2. endpoints lourds (moyenne de 12 appels) ===`);
const bench = async (label, path) => {
  const ts = [];
  let status = 0;
  for (let i = 0; i < 12; i++) {
    const t = process.hrtime.bigint();
    const r = await fetch(`${BASE}${path}`);
    ts.push(Number(process.hrtime.bigint() - t) / 1000);
    status = r.status;
  }
  ts.sort((a, b) => a - b);
  console.log(`${label.padEnd(38)} ${String(status)}  p50=${ts[6].toFixed(0)}us  p95=${ts[11].toFixed(0)}us`);
};
await bench("GET /api/supplier-prices", "/api/supplier-prices");
await bench("GET /api/supplier-prices/comparison", "/api/supplier-prices/comparison");
await bench("GET /api/dashboard/stats", "/api/dashboard/stats");
await bench("GET /api/anti-waste/critical", "/api/anti-waste/critical");
await bench("GET /api/search?q=souche", "/api/search?q=souche");
await bench("GET /api/haccp/production-history", "/api/haccp/production-history");

console.log(`\n=== 3. cache HTTP des assets statiques (dist/) ===`);
const idx = await fetch(`${BASE}/`);
const h = idx.headers;
console.log(`GET /            : etag=${h.get("etag") ?? "AUCUN"}  cache-control=${h.get("cache-control") ?? "AUCUN (revalide a chaud)"}`);
const m = (await idx.text()).match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
const jsName = m ? m[1] : null;
if (jsName) {
  const a = await fetch(`${BASE}/assets/${jsName}`);
  console.log(`GET ${jsName.slice(0, 24)}…: ${a.status}  cache-control=${a.headers.get("cache-control") ?? "AUCUN"}`);
}

console.log(`\n=== 4. budget rate-limit vs polling reel du front ===`);
const perMin = (ms) => 60000 / ms;
const haccp = perMin(4000), robots = perMin(5000), alerts = perMin(30000);
const sim = haccp + robots + alerts;
console.log(`front onglet HACCP ouvert : capteurs ${haccp}/min + robots ${robots}/min + alertes ${alerts}/min = ${sim.toFixed(1)} req/min`);
console.log(`rate-limit global         : 300 / 15 min = 20.0 req/min soutenable`);
console.log(`=> verrou (429) declenche au bout de ~${(300 / sim).toFixed(1)} min d'onglet laisse ouvert, sans autre activite`);
let first429 = -1;
for (let i = 1; i <= 340; i++) { const r = await fetch(`${BASE}/api/dashboard/stats`); if (r.status === 429) { first429 = i; break; } }
console.log(`429 observe reellement a la ${first429 > 0 ? first429 + "e requete" : "(non atteint en 340)"} `);

child.kill("SIGTERM");
process.exit(0);
