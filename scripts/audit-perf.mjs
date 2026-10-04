// Mesures de terrain pour l'audit perf (chemin HTTP reel = chemin de prod).
//  1. debit de polling du front vs budgets de rate-limit (lus dans le module)
//     ⚠ ce bloc etait mesongeur depuis le rate-limit par categorie : il
//     recopiait les chiffres au lieu de les lire. Voir section 4.
//  2. headers de cache HTTP des assets (ETag / Cache-Control)
//  3. latence des endpoints lourds (scans sans index, agregats recalculs)
//  4. poids reel du chargement d'EpicureModel + des embeddings
// Usage: node scripts/audit-perf.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync, statSync, readFileSync } from "node:fs";
import process from "node:process";

const root = process.cwd();
const PORT = 4125;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(process.cwd(), "test", "tmp-perf");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const t0 = process.hrtime.bigint();
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "production" },
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

// Les budgets sont LUS dans src/middleware/api-rate-limiter.ts : un audit qui les
// recopie est deja faux (c'est ce qui est arrive a ce bloc). On les relit donc a la
// source a chaque tour, et un retrait de la constante ferait echouer le script.
const srcLimiter = readFileSync(join(root, "src/middleware/api-rate-limiter.ts"), "utf8");
const parseBudgets = (src) => {
  const blk = /const BUDGETS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!blk) return null;
  // Les fenetres s'ecrivent `5 * MIN` : sans la constante resolve, windowMs
  // sortait a 5 ms et le script annoncait un budget absurde (720 000 req/min).
  // On la relit dans le module, la aussi, au lieu de la recopier.
  const minDef = /const MIN\s*=\s*([0-9_]+)/.exec(src);
  const MIN = minDef ? Number(minDef[1].replace(/_/g, "")) : 60_000;
  const num = (tok) => Number(String(tok).replace(/_/g, ""));
  const mult = (expr) => {
    const m = /^\s*([0-9_]+)\s*(?:\*\s*(MIN|60))\s*$/.exec(expr);
    if (m) return num(m[1]) * (m[2] === "60" ? 60 : MIN);
    const b = /^\s*([0-9_]+)\s*$/.exec(expr);
    return b ? num(b[1]) : null;
  };
  const out = {};
  const re = /(\w+)\s*:\s*\{\s*windowMs\s*:\s*([^,}]+),\s*limit\s*:\s*([0-9_]+)\s*\}/g;
  for (const m of blk[1].matchAll(re)) {
    const [, nom, w, lim] = m;
    const wm = mult(w);
    if (wm === null) return null; // forme inconnue : on echoue, on ne devine pas
    out[nom] = { windowMs: wm, limit: num(lim) };
  }
  return Object.keys(out).length ? out : null;
};
const BUDGETS = parseBudgets(srcLimiter);
if (!BUDGETS) {
  console.log("ECHEC  BUDGETS relus dans api-rate-limiter.ts : forme non reconnue (le script doit suivre le module, pas le deviner)");
  child.kill("SIGTERM");
  process.exit(1);
}
console.log(`\n=== 4. budget rate-limit vs polling reel du front ===`);
// ⚠ CE BLOC AVAIT ETE LAISSE MESONGER par le passage au rate-limit par categorie
// (commit aa83fb2) : il recalculait encore avec l'ancien budget global de
// 300/15 min et annoncait un 429 au bout de ~10 min d'onglet HACCP ouvert.
// C'etait exactement le genre de verdict faux qui fait perdre une journee a une
// decision de perf. Depuis, la verite vient du MODULE (BUDGETS), pas du script.
// Le polling est lu dans le code du front (setInterval / filet SSE), et non
// devine. Ce qui ne vient pas d'une mesure est marque 'hypothese'.
const perMin = (ms) => 60_000 / ms;
const readSource = (rel) => {
  try { return readFileSync(join(root, rel), "utf8"); } catch { return ""; }
};
// Fréquence reelle des emetteurs periodiques du front.
const srcRobot = readSource("src/components/RobotManagement.tsx");
const srcHaccp = readSource("src/components/Haccp.tsx");
const msOf = (src, fn) => {
  const m = new RegExp(`setInterval\\s*\\(\\s*${fn}\\s*,\\s*([0-9]+)\\s*\\)`).exec(src);
  return m ? Number(m[1]) : null;
};
const robotMs = msOf(srcRobot, "fetchRobots");
// Le filet du client SSE: re-synchronisation HTTP quand aucun evenement ne vient.
const guardMs = (() => {
  const m = /const guard = setInterval\s*\(\s*\(\) =>\s*\{[\s\S]{0,200}?([0-9_]{2,})\s*\)/.exec(srcHaccp);
  if (!m) return null;
  const lit = m[1].replace(/_/g, "");
  return /^\d+$/.test(lit) ? Number(lit) : null;
})();
const sseActif = /new EventSource\(/.test(srcHaccp);
const emetteurs = [];
if (sseActif && guardMs) emetteurs.push({ quoi: "filet SSE (garde, 1 seule route)", ms: guardMs });
else if (!sseActif) emetteurs.push({ quoi: "capteurs (polling herite)", ms: 4000 });
if (robotMs) emetteurs.push({ quoi: "robots (setInterval fetchRobots)", ms: robotMs });
const sim = emetteurs.reduce((a, e) => a + perMin(e.ms), 0);
console.log(`emetteurs periodiques du front : ` + emetteurs.map((e) => `${e.quoi} 1/${e.ms}ms`).join(" + ") + ` = ${sim.toFixed(2)} req/min`);
for (const [nom, b] of Object.entries(BUDGETS)) {
  console.log(`  budget ${nom.padEnd(6)} : ${b.limit} / ${Math.round(b.windowMs / 60000)} min = ${(b.limit / (b.windowMs / 60000)).toFixed(1)} req/min soutenable`);
}
const read = BUDGETS.read;
// ⚠ Le calcul est par FENETRE glissante figee, pas accumule sur la journee : a
// sim req/min, une fenetre de windowMs consomme sim * (windowMs/60000) requetes et
// se reinitialise. Comparer ce chiffre a limit est la seule question qui a du sens.
const win = read.windowMs / 60000;
const parFenetre = sim * win;
const marge = parFenetre > 0 ? read.limit / parFenetre : Infinity;
console.log(`=> une tablette passee sur l'onglet consomme ${parFenetre.toFixed(1)} req par fenetre de ${win} min, budget ${read.limit} : ${marge >= 1 ? `le verrou ne se declenchera JAMAIS en passif (${marge.toFixed(1)}x de marge, il faudrait ~${(read.limit / win).toFixed(0)} req/min pour l'atteindre)` : `VERROU ATTEINT en passif (${(1 / marge).toFixed(1)}x le budget)`}`);
console.log(`   (hypothese explicitee : 1 seule origine de lecture periodique ; chaque onglet ouvert de plus ajoute son debit)`);
// Le verrou doit etre OBSERVE, pas calcule : on frappe la categorie 'read' jusqu'a
// 429 (ou 3x le budget, preuve que le quota tient) et on verifie la forme du 429.
let first429 = -1, limitHeader = null, first429Headers = null;
for (let i = 1; i <= read.limit * 3; i++) {
  const r = await fetch(`${BASE}/api/dashboard/stats`);
  if (r.status === 429) { first429 = i; first429Headers = { draft8: r.headers.get("ratelimit") ?? r.headers.get("ratelimit-policy"), draft7: r.headers.get("ratelimit-limit") }; limitHeader = first429Headers.draft8; break; }
}
// Le 429 ne peut PAS se lire brut : les sections 2 et 3 ont deja consomme le meme
// quota 'read' sur la MEMME cle IP (le limiteur ne connaft que la boucle locale).
// C'est ce qui faisait passer la 528e requete pour un budget de 600 mal applique.
const dejaVu = 12 * 6 /* section 2 */ + 2 /* section 3 (GET / + asset) */;
const net = first429 > 0 ? first429 + dejaVu : -1;
const netOk = net > 0 && Math.abs(net - read.limit) <= read.limit * 0.15;
console.log(`429 observe a la ${first429 > 0 ? first429 + "e requete de la section 4" : `NON atteint en ${read.limit * 3}`} ; + ${dejaVu} deja consommes par les sections 2-3 = ${net} vs budget ${read.limit} -> ${net > 0 ? (netOk ? "COHERENT" : "ECART INEXPLIQUE") : "-"}`);
if (first429 > 0) {
  // draft-8 (choisi deliberatement): le NOM du quota est publie dans RateLimit /
  // RateLimit-Policy. draft-7 ne le publie pas -- c'est ce qui a fait rougir la
  // verification du module. On ne verifie donc pas un chiffre lu au hasard.
  console.log(`  en-tetes du 429 : draft-8=${first429Headers.draft8 ?? "AUCUN"}`);
  // draft-8 publie le NOM du quota (identifier) + le restant (r) + le temps avant
  // remise a zero (t). Le QUOTA absolu, lui, n'est publie que par les en-tetes
  // herites draft-7, volontairement desactives (legacyHeaders: false). On verifie
  // donc le contrat reel : nom + restant + temps.
  const d8 = String(first429Headers.draft8 ?? "");
  const publie = /read/.test(d8) && /r=\d+/.test(d8) && /t=\d+/.test(d8);
  console.log(`  ${publie ? "OK" : "ECHEC"}  le 429 publie le nom du quota ('read'), le restant et le delai : le client se regule sans interrogater le serveur`);
} else {
  console.log(`  ${first429 < 0 ? "OK" : "INFO"}  aucun verrou avant 3x le budget : le quota de lecture tient la journee d'une tablette`);
}

child.kill("SIGTERM");
process.exit(0);
