// Porte du MODE SANS AGENT (chantier 6, feuille de route §8).
// Juge le SERVEUR REEL (spawn tsx, USER_DATA_PATH isole, port OS alloue) avec
// COOKDRIVE_AGENT_OFF=1 (mode sans agent) ET une identite active.
//
// Le contrat §8 : « Sans agent : saisie et gestion manuelles completes. »
//   M1  POST /api/suggestions -> 404 MODE_SANS_AGENT (la boite est fermee :
//       l'agent n'existe pas dans ce mode, il ne peut rien proposer)
//   M2  TOUTE route d'ecriture METIER passe avec la session HUMAINE (maitre) :
//       inventory CRUD (create/update/delete), recipes create, suppliers
//       create, haccp temperature — le mode manuel est COMPLET, rien n'est
//       degrade
//   M3  la lecture reste libre (GET inventory/recipes/settings)
//   M4  l'audit trail fonctionne toujours (chantier 2 : la tracabilite ne
//       depend pas du mode) — chaque mutation M2 est tracee
//   M5  le compte agent, s'il existe, ne peut RIEN ecrire (la gate §8 ferme
//       l'exemption suggestions dans ce mode) : AGENT_LECTURE_SEULE partout
//   M6  la lecture de la boite de suggestions reste libre (l'historique doit
//       rester consultable meme sans agent)
//
// Lancement : node scripts/verify-mode-manuel.mjs
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

const DATA = join(process.cwd(), "test", "tmp-mode-manuel");
const DBFILE = join(DATA, "agent_culinaire.db");
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
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
    COOKDRIVE_INSTANCE_TOKEN: "verify-mode-manuel",
    COOKDRIVE_AGENT_OFF: "1", // LE mode juge ici
    COOKDRIVE_RATELIMIT_OFF: "1",
  },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});

let pret = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === "verify-mode-manuel") { pret = true; break; }
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
      const headers = { "X-Cookdrive-Instance": "verify-mode-manuel" };
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

async function auditRows(routeExact) {
  const db = await open({ filename: DBFILE, driver: sqlite3.Database });
  try { return await db.all("SELECT * FROM audit_log WHERE route LIKE ?", [routeExact + "%"]); }
  finally { await db.close(); }
}

try {
  // setup maitre + creation d'un compte agent (pour M5)
  const setup = await call("POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
  check("setup maitre", setup.status === 201, `status=${setup.status}`);
  const agent = await call("POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });
  check("compte agent cree (par le maitre)", agent.status === 201, `status=${agent.status}`);

  // M1 la boite est FERMEE dans ce mode
  const m1 = await call("POST", "/api/suggestions", {
    type: "stock", titre: "x", action_route: "/api/haccp/cleaning",
  });
  check("M1 POST /api/suggestions -> 404 MODE_SANS_AGENT",
    m1.status === 404 && m1.json?.error === "MODE_SANS_AGENT", `status=${m1.status} error=${m1.json?.error}`);

  // M3 lectures libres
  for (const [label, url] of [["M3a inventory", "/api/inventory"], ["M3b recipes", "/api/recipes"], ["M3c settings", "/api/settings"]]) {
    const r = await call("GET", url);
    check(`${label} GET -> 200`, r.status === 200, `status=${r.status}`);
  }
  // M6 l'historique de la boite reste lisible
  const m6 = await call("GET", "/api/suggestions");
  check("M6 GET /api/suggestions -> 200 (historique lisible)", m6.status === 200 && Array.isArray(m6.json), `status=${m6.status}`);

  // M2 le CRUD HUMAIN est COMPLET — create / update / delete / create / create / create
  const m2c = await call("POST", "/api/inventory",
    { name: "Mode Manuel", quantity: 7, minStock: 2, unit: "kg", category: "test" });
  check("M2a POST /api/inventory -> 200 + id", m2c.status === 200 && m2c.json?.id, `status=${m2c.status}`);
  const iid = m2c.json?.id;
  const m2u = await call("PUT", `/api/inventory/${iid}`, { name: "Mode Manuel 2" });
  check("M2b PUT /api/inventory/:id -> 200", m2u.status === 200, `status=${m2u.status}`);
  const m2d = await call("DELETE", `/api/inventory/${iid}`);
  check("M2c DELETE /api/inventory/:id -> 200", m2d.status === 200, `status=${m2d.status}`);

  const m2r = await call("POST", "/api/recipes",
    { name: "Recette Manuel", category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "manuel" });
  check("M2d POST /api/recipes -> 200 + id", m2r.status === 200 && m2r.json?.id, `status=${m2r.status}`);

  const m2s = await call("POST", "/api/suppliers", { name: "Fournisseur Manuel" });
  check("M2e POST /api/suppliers -> 200 + id", m2s.status === 200 && m2s.json?.id, `status=${m2s.status}`);

  const m2h = await call("POST", "/api/haccp/temperature",
    { equipment_name: "Frigo Manuel", temperature: 3.9, user: "SYSTME" });
  check("M2f POST /api/haccp/temperature -> 200 + id", m2h.status === 200 && m2h.json?.id, `status=${m2h.status}`);

  // M4 l'audit trail ne depend pas du mode
  check("M4a audit_log trace l'inventaire", (await auditRows("/api/inventory")).length >= 2);
  check("M4b audit_log trace la recette", (await auditRows("/api/recipes")).length >= 1);
  check("M4c audit_log trace le fournisseur", (await auditRows("/api/suppliers")).length >= 1);
  check("M4d audit_log trace la temperature", (await auditRows("/api/haccp/temperature")).length >= 1);

  // M5 l'agent ne peut RIEN ecrire dans ce mode (l'exemption §8 est fermee)
  jar.cd_session = undefined; delete jar.cd_session;
  const loginA = await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  check("login agent", loginA.status === 200, `status=${loginA.status}`);
  const m5a = await call("POST", "/api/suggestions", { type: "stock", titre: "x", action_route: "/api/haccp/cleaning" });
  check("M5a agent POST suggestions -> 403 (boite fermee pour lui aussi)",
    m5a.status === 403 && m5a.json?.error === "AGENT_LECTURE_SEULE", `status=${m5a.status} error=${m5a.json?.error}`);
  const m5b = await call("POST", "/api/inventory", { name: "x", quantity: 1, unit: "kg", category: "test" });
  check("M5b agent POST inventory -> 403", m5b.status === 403 && m5b.json?.error === "AGENT_LECTURE_SEULE", `status=${m5b.status}`);
} finally {
  arreter(child);
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du mode sans agent rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT MODE MANUEL: toutes les regles vertes");
process.exit(0);
