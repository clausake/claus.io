// Porte du MODE AVEC AGENT (chantier 6, feuille de route §8).
// Juge le SERVEUR REEL (spawn tsx, USER_DATA_PATH isole, port OS alloue) en
// mode normal (AGENT_OFF absent) — la boucle de bout en bout §8 :
//
//   "cerveau" factice deterministe : le spec JOUE le role de l'agent (login
//   agent + POST /api/suggestions) — EXACTEMENT la voie qu'Hermes empruntera
//   (ai.ts/voice ou ses outils). JAMAIS de LLM reel en CI : le contenu de la
//   suggestion est fixe, ce qui est juge est la BOUCLE, pas l'intelligence.
//
//   A1  l'agent propose -> 201 (sa SEULE ecriture)
//   A2  l'agent ne peut PAS ecrire le metier (403 sur inventory, recipes,
//       suppliers, haccp) — il propose, il n'execute pas
//   A3  l'agent lit tout (200 sur les GET metier : §8 « Hermes LIT tout »)
//   B1  le maitre applique la suggestion de l'agent -> statut 'applique',
//       la route cible VRAIMENT rejouee (DELTA temperature_logs), applique_par
//   B2  la deuxieme suggestion est rejetee avec motif -> 'rejete' + motif relu
//   B3  la troisieme est appliquee par le STAFF -> refuse (maitre seul)
//   C1  le staff garde son CRUD terrain (saisie manuelle complete) :
//       POST /api/inventory passe avec sa session — la boite ne remplace
//       jamais la saisie humaine
//   D1  TOUTE la boucle est tracee dans audit_log (propose + applique + rejete)
//
// Lancement : node scripts/verify-mode-agent.mjs
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

const DATA = join(process.cwd(), "test", "tmp-mode-agent");
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
    COOKDRIVE_INSTANCE_TOKEN: "verify-mode-agent",
    // PAS de COOKDRIVE_AGENT_OFF : le mode AVEC agent est juge ici.
    COOKDRIVE_RATELIMIT_OFF: "1",
  },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});

let pret = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === "verify-mode-agent") { pret = true; break; }
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
      const headers = { "X-Cookdrive-Instance": "verify-mode-agent" };
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

async function auditRows() {
  const db = await open({ filename: DBFILE, driver: sqlite3.Database });
  try { return await db.all("SELECT * FROM audit_log ORDER BY id"); }
  finally { await db.close(); }
}

try {
  // setup maitre + comptes
  const setup = await call("POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
  check("setup maitre", setup.status === 201, `status=${setup.status}`);
  await call("POST", "/api/users", { username: "brigade", password: "passe-staff-01", role: "staff" });
  await call("POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });

  // --- LA BOUCLE AGENT (cerveau factice deterministe) -----------------------
  jar.cd_session = undefined; delete jar.cd_session;
  const loginA = await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  check("login agent", loginA.status === 200, `status=${loginA.status}`);

  // A3 l'agent lit tout
  for (const [label, url] of [["inventory", "/api/inventory"], ["recipes", "/api/recipes"], ["haccp temperatures", "/api/haccp/temperatures"]]) {
    const r = await call("GET", url);
    check(`A3 agent GET ${label} -> 200`, r.status === 200, `status=${r.status}`);
  }

  // A2 l'agent n'ecrit PAS le metier
  const a2i = await call("POST", "/api/inventory", { name: "x", quantity: 1, unit: "kg", category: "test" });
  check("A2a agent POST inventory -> 403", a2i.status === 403 && a2i.json?.error === "AGENT_LECTURE_SEULE", `status=${a2i.status}`);
  const a2r = await call("POST", "/api/recipes", { name: "x", category: "Plat" });
  check("A2b agent POST recipes -> 403", a2r.status === 403, `status=${a2r.status}`);
  const a2s = await call("POST", "/api/suppliers", { name: "x" });
  check("A2c agent POST suppliers -> 403", a2s.status === 403, `status=${a2s.status}`);
  const a2h = await call("POST", "/api/haccp/temperature", { equipment_name: "x", temperature: 4 });
  check("A2d agent POST haccp -> 403", a2h.status === 403, `status=${a2h.status}`);

  // A1 l'agent PROPOSE (trois suggestions : a appliquer, a rejeter, staff)
  const a1 = await call("POST", "/api/suggestions", {
    type: "haccp", priorite: "haute", titre: "Relever la temperature du froid",
    explication: "Le capteur n'a rien emis depuis ce matin.",
    action_route: "/api/haccp/temperature",
    action_payload: { equipment_name: "Frigo A", temperature: 3.5, user: "SYSTME" },
  });
  check("A1a suggestion 1 (agent) -> 201", a1.status === 201 && a1.json?.statut === "nouveau", `status=${a1.status}`);
  const a1b = await call("POST", "/api/suggestions", {
    type: "stock", titre: "Suggestion a rejeter",
    action_route: "/api/haccp/temperature", action_payload: { equipment_name: "Z", temperature: 99 },
  });
  check("A1b suggestion 2 (agent) -> 201", a1b.status === 201, `status=${a1b.status}`);
  const a1c = await call("POST", "/api/suggestions", {
    type: "menu", titre: "Suggestion pour le staff",
    action_route: "/api/haccp/cleaning", action_payload: { zone_name: "Plonge", completed_by: "agent" },
  });
  check("A1c suggestion 3 (agent) -> 201", a1c.status === 201, `status=${a1c.status}`);

  // --- LE HUMAIN TRANCHE ----------------------------------------------------
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);

  // B3 le STAFF ne tranche pas — la suggestion 3 lui est destinee mais
  // l'application reste maitre-seul (le staff peut la LIRE et la saisir a la
  // main, pas la "valider" a sa place).
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "brigade", password: "passe-staff-01" }, false);
  const b3 = await call("POST", `/api/suggestions/${a1c.json?.id}/appliquer`);
  check("B3 staff appliquer -> 403 MAITRE_REQUIS", b3.status === 403 && b3.json?.error === "MAITRE_REQUIS", `status=${b3.status}`);

  // B1 le maitre applique la 1re : la cible VRAIMENT rejouee
  const avant = await call("GET", "/api/haccp/temperatures");
  const nAvant = Array.isArray(avant.json) ? avant.json.length : 0;
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const b1 = await call("POST", `/api/suggestions/${a1.json?.id}/appliquer`);
  check("B1 maitre applique -> statut applique", b1.status === 200 && b1.json?.statut === "applique",
    `status=${b1.status} corps=${JSON.stringify(b1.json)}`);
  const apres = await call("GET", "/api/haccp/temperatures");
  const nApres = Array.isArray(apres.json) ? apres.json.length : 0;
  check("B1 DELTA : la cible a VRAIMENT ecrit", nApres === nAvant + 1, `avant=${nAvant} apres=${nApres}`);

  // B2 le maitre rejette la 2e avec motif
  const b2 = await call("POST", `/api/suggestions/${a1b.json?.id}/rejeter`, { motif: "Capteur remplace ce matin, releve inutile." });
  check("B2 maitre rejette avec motif -> rejete", b2.status === 200 && b2.json?.statut === "rejete", `status=${b2.status}`);

  // C1 le staff garde son CRUD terrain (la saisie humaine n'est pas degradee)
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "brigade", password: "passe-staff-01" }, false);
  const c1 = await call("POST", "/api/inventory", { name: "Saisie Brigade", quantity: 3, minStock: 1, unit: "kg", category: "test" });
  check("C1 staff POST inventory -> 200 (saisie manuelle complete)", c1.status === 200, `status=${c1.status}`);

  // D1 toute la boucle est tracee
  {
    const rows = await auditRows();
    const propose = rows.filter((r) => r.route === "/api/suggestions" && r.action === "propose");
    const applique = rows.filter((r) => r.action === "applique");
    const rejete = rows.filter((r) => r.action === "rejete");
    check("D1 audit_log trace propose/applique/rejete",
      propose.length >= 3 && applique.length >= 1 && rejete.length >= 1,
      `propose=${propose.length} applique=${applique.length} rejete=${rejete.length}`);
  }
} finally {
  arreter(child);
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du mode avec agent rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT MODE AGENT: toutes les regles vertes");
process.exit(0);
