// Verification terrain de l'instrumentation de latence par route (chemin HTTP reel).
//
// Ce que ce script prouve, sur le serveur reel et non sur un bouchon :
//   1. /health/perf repond 200 avec la structure attendue ;
//   2. les routes appelees apparaissent sous leur MOTIF (une serie par route,
//      pas une serie par id) ;
//   3. les compteurs refletent reellement le volume envoye (60 + 30) ;
//   4. l'ordre des percentiles est coherent (p50 <= p95, p95 > 0) ;
//   5. /health et /health/perf sont exclus (pas d'auto-mesure du poll de sante) ;
//   6. aucun col mesure (p95 < 50 ms apres ~90 requetes) ;
//   7. une pluie d'ids ne fait pas exploser la cardinalite de la table.
//
// Usage: node scripts/verify-perf.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import process from "node:process";

const PORT = 4128;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(process.cwd(), "test", "tmp-perf");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "production" },
  stdio: "pipe",
});
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});

let ready = false;
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok) { ready = true; break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
if (!ready) {
  child.kill("SIGTERM");
  console.log("ECHEC  serveur pas pret sur " + BASE);
  setTimeout(() => process.exit(1), 200);
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

// --- 1. on charge le serveur sur deux routes, a volume connu ---
const N_STATS = 60;
const N_INV = 30;
const get = async (p) => {
  try { return await fetch(`${BASE}${p}`); } catch { return null; }
};

// un item seede pour pouvoir frapper des chemins avec id reels
const seed = await fetch(`${BASE}/api/inventory`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Souche Perf", quantity: 5, minStock: 1, unit: "kg",
    status: "active", category: "Divers", unit_price: 3,
  }),
});
const seeded = seed.ok ? (await seed.json()).id : null;

for (let i = 0; i < N_STATS; i++) await get("/api/dashboard/stats");
for (let i = 0; i < N_INV; i++) await get("/api/inventory");

// pluie d'ids : 30 chemins distincts qui doivent rester UNE seule serie
for (let i = 1; i <= 30; i++) await get(`/api/inventory/${seeded === null ? i : seeded + i}`);
// 30 ids de recipe (existants ou non) : la route est quand meme matchee par
// Express, donc l'instrumentation doit agglutiner les 30 sous UN seul motif.
for (let i = 1; i <= 30; i++) await get(`/api/recipes/${9000 + i}`);

// le poll de sante, lui, ne doit PAS entrer dans les stats
await get("/health");
await get("/health/perf");

// --- 2. lecture de l'instantane ---
const res = await get("/health/perf");
check("(a) GET /health/perf repond 200", !!res && res.status === 200, res ? "HTTP " + res.status : "aucune reponse");

let snap = null;
try { snap = await res.json(); } catch {}
check(
  "(a) structure attendue { ok, routes[], inflight, total, series }",
  !!snap && snap.ok === true && Array.isArray(snap.routes) &&
    typeof snap.inflight === "number" && typeof snap.total === "number" && typeof snap.series === "number",
  snap ? Object.keys(snap).join(",") : "json illisible"
);

const byRoute = new Map((snap ? snap.routes : []).map((r) => [r.route, r]));
const stats = byRoute.get("GET /api/dashboard/stats");
const inv = byRoute.get("GET /api/inventory");

check(
  "(b) au moins 2 series distinctes avec les bons labels",
  !!stats && !!inv && snap.routes.length >= 2,
  snap ? snap.routes.map((r) => r.route).slice(0, 6).join(" | ") : "aucune"
);
check("(c) 'GET /api/dashboard/stats' a >= 60 samples", !!stats && stats.samples >= N_STATS, stats ? "samples=" + stats.samples : "absente");
check("(c) 'GET /api/inventory' a >= 30 samples", !!inv && inv.samples >= N_INV, inv ? "samples=" + inv.samples : "absente");

const pctOk = (r) => !!r && r.p95Ms > 0 && r.p95Ms >= r.p50Ms;
check(
  "(d) percentiles coherents (p95 > 0 et p95 >= p50) sur les 2 series",
  pctOk(stats) && pctOk(inv),
  stats ? `stats p50=${stats.p50Ms} p95=${stats.p95Ms}` : "-"
);
check("(d) p99 >= p95 et max >= p99 sur /api/dashboard/stats",
  !!stats && stats.p99Ms >= stats.p95Ms && stats.maxMs >= stats.p99Ms,
  stats ? `p95=${stats.p95Ms} p99=${stats.p99Ms} max=${stats.maxMs}` : "-");

check("(e) total observe >= 90", !!snap && snap.total >= N_STATS + N_INV, snap ? "total=" + snap.total : "-");

const leaked = (snap ? snap.routes : []).filter((r) => r.route.includes("/health"));
check("(f) /health et /health/perf exclus des series", leaked.length === 0, leaked.map((r) => r.route).join(","));

const slow = (snap ? snap.routes : []).filter(
  (r) => (r.route === "GET /api/dashboard/stats" || r.route === "GET /api/inventory") && r.p95Ms >= 50
);
check("(g) aucun col : p95 < 50 ms sur les routes chargees", slow.length === 0,
  slow.map((r) => `${r.route}=${r.p95Ms}ms`).join(",") || `p95 stats=${stats ? stats.p95Ms : "-"}ms`);

// (h) anti-cardinalite : les 30 ids ne doivent pas avoir cree 30 series.
const perId = (snap ? snap.routes : []).filter((r) => /^GET \/api\/inventory\/[^:]/.test(r.route));
check("(h) pas de serie par id brut (cardinalite bornee)", perId.length === 0,
  perId.map((r) => r.route).slice(0, 5).join(",") || "ok");
// Les 30 ids de recipe (route inexistante donc 404, sans motif Express)
// doivent converger vers UN seul motif via l'heuristique : c'est la preuve que
// 30 chemins differents ne creent pas 30 series sur le chemin reel.
const rec = byRoute.get("GET /api/recipes/:id");
check("(h) 30 ids de recipe agreges sous UN seul motif 'GET /api/recipes/:id'", !!rec && rec.samples >= 30,
  rec ? "samples=" + rec.samples : "absente");
check("(h) series totales <= 20 pour ~160 requetes", !!snap && snap.series <= 20,
  snap ? "series=" + snap.series : "-");

child.kill("SIGTERM");
console.log(fail === 0 ? "\nVERIF PERF: TOUT PASS" : "\nVERIF PERF: " + fail + " ECHEC(S)");
setTimeout(() => process.exit(fail === 0 ? 0 : 1), 400);
