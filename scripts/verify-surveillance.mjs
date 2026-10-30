// Porte du moteur de surveillance (chantier 4, feuille de route §8).
// Juge le SERVEUR REEL (spawn tsx, USER_DATA_PATH isole, port OS alloue) :
// les regles produisent des SUGGESTIONS et rien d'autre — le moteur n'ecrit
// JAMAIS le metier. Chaque regle est jouee sur un terrain SEME par le spec
// (via l'API du depot, jamais a la main) puis jugee par DELTA sur la table
// suggestions, relue EN BASE SQLite.
//
//   S1  scan anonyme -> 401 ; scan staff -> 403 STAFF_LECTURE_SEULE
//   S2  R1 rupture imminente : article semé (quantity <= minStock + marge) ->
//       une suggestion deposee, action pre-remplie vers /api/purchasing/order
//   S3  R2 stock mort : article quantity=0 + prix>0 -> suggestion 'anomalie'
//   S4  R3 DLC proche : lot semé (expiration_date <= J+3) -> suggestion haccp
//   S5  R4 temperature hors bornes : releve semé a 90 deg -> suggestion
//       corrective NOMMEE (l'humain liera son log_id)
//   S6  R5 anti-gaspillage : les lots DLC -> une suggestion 'menu'
//   S7  DEDUPLICATION : rejouer le scan ne REPONTE pas les memes cles
//       (deposees constant, ignorees croissant)
//   S8  le moteur n'a JAMAIS ecrit le metier : les articles/lots semés sont
//       INTACTS en base (quantité et lignes identiques) — §8 : il propose
//   S9  seuils configurables : POST /api/settings {jours_dlc: 30} change le
//       périmètre (un lot a J+10 n'alerte plus a 3 jours mais a 30)
//   S10 GET /api/surveillance/seuils rend les seuils actifs
//   D1  le scan est trace dans audit_log
//
// Lancement : node scripts/verify-surveillance.mjs
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, mkdirSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { execSync } from "node:child_process";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const RACINE = resolve(fileURLToPath(import.meta.url), "..", "..");

// La racine du depot, DERIVEE du fichier lui-meme : un nom en dur
// (« cookdrive-project » = l ancien nom, ou « .clausio/claus.io » = le
// chemin de MA machine) ne figure dans la cmdline d aucun fils sur un
// autre poste — mesure le 30/10 : la CI GitHub (depot dans
// /home/runner/work/claus.io/claus.io) ne voyait AUCUN fils et la porte
// verify:garde-fantomes rougissait « la porte serait decorative ».

// `child.kill()` ne tue que le CLI tsx : le SERVEUR est un petit-fils
// node (tsx relance un processus). Mesure du 30/10 : six harnais joues a
// la suite laissaient SIX serveurs vivants, chacun avec sa base — le
// fantome que le garde d'amont rattrapait a chaque run. On spawn donc
// detache (le fils devient chef de son groupe) et on tue le GROUPE.
const arreter = (c) => {
  if (!c || !c.pid) return;
  try { process.kill(-c.pid, "SIGKILL"); }
  catch { try { c.kill("SIGKILL"); } catch {} }
};

const DATA = join(RACINE, "test", "tmp-surveillance");
const DBFILE = join(DATA, "agent_culinaire.db");
const TSX = join(RACINE, "node_modules", ".bin", "tsx");
const ERRLOG = join(DATA, "serveur-stderr.log");

const portLibre = () => new Promise((resolve, reject) => {
  const srv = createServer();
  srv.once("error", reject);
  srv.listen(0, "127.0.0.1", () => {
    const p = srv.address().port;
    srv.close(() => resolve(p));
  });
});

// Garde fantomes (lecons 03/10).
try {
  for (const pid of execSync(
    'for p in /proc/[0-9]*/cmdline; do tr "\\0" " " < "$p" 2>/dev/null; echo "|PID=${p}"; done',
    { shell: "/bin/bash" },
  ).toString().split("\n")) {
    const m = pid.match(/^(.*)\|PID=\/proc\/(\d+)\/cmdline$/);
    if (!m) continue;
    if (m[1].includes("server.ts") && m[1].includes(RACINE) && Number(m[2]) !== process.pid) {
      try { process.kill(Number(m[2]), "SIGKILL"); } catch {}
    }
  }
} catch {}

const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const child = spawn(process.execPath, [TSX, "server.ts"], {
    detached: true, // le fils devient chef de groupe (killed par `arreter`)
  env: {
    ...process.env,
    PORT: String(PORT),
    USER_DATA_PATH: DATA,
    COOKDRIVE_INSTANCE_TOKEN: "verify-surveillance",
    // Le mode AVEC agent est juge ici ; le rate-limit est coupe (le contrat
    // repete des mutations, le bucket sature sinon).
    COOKDRIVE_RATELIMIT_OFF: "1",
  },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});

let pret = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === "verify-surveillance") { pret = true; break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

if (!pret) {
  arreter(child);
  console.log("ECHEC  serveur pas pret sur " + BASE + " (stderr: " + ERRLOG + ")");
  process.exit(1);
}

const jar = {};
function rememberSetCookie(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  for (const line of sc) {
    const [pair] = line.split(";");
    const [name, value] = pair.split("=");
    jar[name.trim()] = value;
  }
}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const call = async (method, path, body) => {
  for (let essai = 0; essai < 4; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      const headers = { "X-Cookdrive-Instance": "verify-surveillance" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookieHeader()) headers["Cookie"] = cookieHeader();
      const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      rememberSetCookie(res);
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    } catch {}
  }
  return { status: 0, json: null };
};

const dansJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function suggestionsRows() {
  const db = await open({ filename: DBFILE, driver: sqlite3.Database });
  try { return await db.all("SELECT * FROM suggestions ORDER BY created_at"); }
  finally { await db.close(); }
}

try {
  // setup maitre + staff + agent
  await call("POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
  await call("POST", "/api/users", { username: "brigade", password: "passe-staff-01", role: "staff" });
  await call("POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });

  // S1 le scan n'est pas ouvert a tous
  jar.cd_session = undefined; delete jar.cd_session;
  const s1a = await call("POST", "/api/surveillance/scan");
  check("S1a scan anonyme -> 401", s1a.status === 401, `status=${s1a.status}`);
  await call("POST", "/api/auth/login", { username: "brigade", password: "passe-staff-01" }, false);
  const s1b = await call("POST", "/api/surveillance/scan");
  check("S1b scan staff -> 403", s1b.status === 403 && s1b.json?.error === "STAFF_LECTURE_SEULE", `status=${s1b.status}`);

  // S10 seuils actifs lus
  const s10 = await call("GET", "/api/surveillance/seuils");
  check("S10 GET seuils -> defauts sains", s10.status === 200 && s10.json?.jours_dlc === 3 && s10.json?.marge_rupture === 5,
    `corps=${JSON.stringify(s10.json)}`);

  // --- SEMER LE TERRAIN (par l'API du depot, en session maitre) -------------
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const rupture = await call("POST", "/api/inventory",
    { name: "Semi Rupture", quantity: 2, minStock: 10, unit: "kg", category: "surv" });
  check("semis rupture", rupture.status === 200, `status=${rupture.status}`);
  const mort = await call("POST", "/api/inventory",
    { name: "Semi Mort", quantity: 0, minStock: 0, unit: "u", category: "surv", unit_price: 12.5 });
  check("semis stock mort", mort.status === 200, `status=${mort.status}`);
  const sain = await call("POST", "/api/inventory",
    { name: "Semi Sain", quantity: 500, minStock: 10, unit: "kg", category: "surv" });
  check("semis article sain (temoin negatif)", sain.status === 200, `status=${sain.status}`);
  const lot = await call("POST", "/api/haccp/batches", {
    inventory_id: sain.json?.id, lot_number: "SURV-1", expiration_date: dansJours(2),
    quantity: 4, unit: "kg",
  });
  check("semis lot DLC J+2", lot.status === 200, `status=${lot.status} corps=${JSON.stringify(lot.json)}`);
  const temp = await call("POST", "/api/haccp/temperature",
    { equipment_name: "Semi Four", temperature: 90, user: "SYSTME" });
  check("semis releve 90 deg (hors bornes)", temp.status === 200, `status=${temp.status}`);

  // --- SCAN PAR L'AGENT (son role §8 : SURVEILLE et INFORME) ----------------
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  const scan1 = await call("POST", "/api/surveillance/scan");
  check("scan agent -> 200", scan1.status === 200, `status=${scan1.status} corps=${JSON.stringify(scan1.json)}`);
  check("scan agent depose des propositions", (scan1.json?.deposees ?? 0) >= 4,
    `deposees=${scan1.json?.deposees} propositions=${scan1.json?.propositions}`);

  // S2/S3/S4/S5/S6 DELTA : les regles ont chacune depose leur ligne
  const rows = await suggestionsRows();
  const rupt = rows.find((r) => r.titre?.startsWith("Rupture imminente"));
  check("S2 R1 rupture -> suggestion + action pre-remplie purchasing",
    !!rupt && rupt.action_route === "/api/purchasing/order" && JSON.parse(rupt.action_payload).items?.[0]?.inventory_id === rupture.json?.id,
    `titre=${rupt?.titre}`);
  const mortRow = rows.find((r) => r.titre?.startsWith("Stock mort"));
  check("S3 R2 stock mort -> suggestion anomalie", !!mortRow && mortRow.type === "anomalie", `titre=${mortRow?.titre}`);
  const dlcRow = rows.find((r) => r.titre?.startsWith("DLC proche"));
  check("S4 R3 DLC -> suggestion haccp", !!dlcRow && dlcRow.type === "haccp", `titre=${dlcRow?.titre}`);
  const tempRow = rows.find((r) => r.titre?.startsWith("Temperature hors bornes"));
  check("S5 R4 temperature -> suggestion corrective", !!tempRow && tempRow.action_route === "/api/haccp/corrective-action",
    `titre=${tempRow?.titre}`);
  const antiRow = rows.find((r) => r.titre?.startsWith("Anti-gaspillage"));
  check("S6 R5 anti-gaspillage -> suggestion menu", !!antiRow && antiRow.type === "menu", `titre=${antiRow?.titre}`);

  // S8 le moteur n'a JAMAIS ecrit le metier : le semis est INTACT
  const inv = await call("GET", "/api/inventory");
  const semiRupture = inv.json?.find?.((i) => i.name === "Semi Rupture");
  const semiSain = inv.json?.find?.((i) => i.name === "Semi Sain");
  check("S8a l'article de rupture n'a PAS ete modifie par le moteur", semiRupture?.quantity === 2, `quantity=${semiRupture?.quantity}`);
  check("S8b l'article sain n'a PAS ete commande", semiSain?.quantity === 500, `quantity=${semiSain?.quantity}`);
  const apres = await call("GET", "/api/haccp/temperatures");
  const fourApres = apres.json?.filter?.((t) => t.equipment_name === "Semi Four");
  check("S8c aucun second releve depose pour le four", fourApres?.length === 1, `lignes=${fourApres?.length}`);

  // S7 deduplication : rejouer ne reposte pas
  const scan2 = await call("POST", "/api/surveillance/scan");
  check("S7a rejouer le scan -> 0 deposee", scan2.status === 200 && scan2.json?.deposees === 0,
    `deposees=${scan2.json?.deposees} ignorees=${scan2.json?.ignorees}`);

  // S9 seuils configurables par le maitre : jours_dlc=30 elargit le perimetre
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const setSeuil = await call("POST", "/api/settings", { jours_dlc: 30 });
  check("S9a POST /api/settings jours_dlc=30", setSeuil.status === 200, `status=${setSeuil.status}`);
  const seuilLu = await call("GET", "/api/surveillance/seuils");
  check("S9b seuil relu = 30", seuilLu.json?.jours_dlc === 30, `corps=${JSON.stringify(seuilLu.json)}`);
  // Un lot a J+10 n'alertait PAS a jours_dlc=3 mais alerte a 30.
  const lot10 = await call("POST", "/api/haccp/batches", {
    inventory_id: sain.json?.id, lot_number: "SURV-2", expiration_date: dansJours(10),
    quantity: 1, unit: "kg",
  });
  check("S9c semis lot J+10", lot10.status === 200, `status=${lot10.status}`);
  await call("POST", "/api/surveillance/scan");
  const rows3 = await suggestionsRows();
  const dlc10 = rows3.find((r) => r.titre?.includes("SURV-2"));
  check("S9d le lot J+10 est maintenant couvert (jours_dlc=30)", !!dlc10, `titre=${dlc10?.titre}`);

  // D1 le scan est trace
  {
    const db = await open({ filename: DBFILE, driver: sqlite3.Database });
    try {
      const audit = await db.all("SELECT * FROM audit_log WHERE route = '/api/surveillance/scan'");
      check("D1 scan trace dans audit_log", audit.length >= 2, `lignes=${audit.length}`);
    } finally { await db.close(); }
  }
} finally {
  arreter(child);
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du moteur de surveillance rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT SURVEILLANCE: toutes les regles vertes");
process.exit(0);
