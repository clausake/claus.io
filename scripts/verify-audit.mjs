// Porte du contrat d'audit (chantier 2). Juge le SERVEUR REEL (spawn tsx,
// USER_DATA_PATH isole, port alloue par l'OS) : chaque route mutable testee
// doit ecrire une ligne dans audit_log, lue PAR DELTA en base SQLite — pas par
// un rendu de route. Un log qui n'ecrit pas n'est pas un log.
//
// Regles du contrat (chaque regle DELTA puis relecture):
//   A1  POST /api/haccp/temperature        -> audit_log porte action=create, entite=id
//   A2  POST /api/inventory                -> create + entite
//   A3  PUT /api/inventory/:id             -> update + entite
//   A4  DELETE /api/inventory/:id          -> delete + entite
//   A5  POST /api/recipes                  -> create + entite
//   A6  DELETE /api/recipes/:id            -> delete + entite
//   A7  POST /api/suppliers                -> create + entite
//   A8  POST /api/haccp/batches            -> create (HACCP: lot trace)
//   A9  POST /api/haccp/cleaning           -> create (HACCP: registre)
//   A10 POST /api/haccp/corrective-action  -> create (HACCP: action corrective)
//   A11 POST /api/menu-planning            -> create + entite
//   A12 POST /api/staff                    -> create + entite
//   B1  actor_kind est pose et non vide (humain|harnais|agent|anonyme)
//   B2  route posee et non vide
//   C1  LECTURE libre GET /api/haccp/temperatures n'ecrit PAS dans audit_log
//       (l'audit juge les mutations, pas les lectures — sinon la table explose)
//   C2  la morsure: une route dont logAudit est retire fait rougir le DELTA
//       (prouve par scripts/negative-test-audit.py sur son propre serveur)
//
// Le harnais boote avec COOKDRIVE_AUTH_OFF=1 (actor=harnais) : le contrat juge
// QUE l'ecriture d'audit a lieu, pas l'identite (verify:auth la juge).
// Lancement: node scripts/verify-audit.mjs
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, mkdirSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { execSync } from "node:child_process";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const RACINE = resolve(fileURLToPath(import.meta.url), "..", "..");

const DATA = join(process.cwd(), "test", "tmp-audit");
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

// Fantome : le garde du depot (lecons 03/10) — on tue tout server.ts de CE
// depot avant de spawn, sinon un fils remanant sert une VIEILLE base.
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

// La racine du depot, DERIVEE du fichier lui-meme : un nom en dur
// (« cookdrive-project » = l ancien nom, ou « .clausio/claus.io » = le
// chemin de MA machine) ne figure dans la cmdline d aucun fils sur un
// autre poste — mesure le 30/10 : la CI GitHub (depot dans
// /home/runner/work/claus.io/claus.io) ne voyait AUCUN fils et ma porte
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
    COOKDRIVE_INSTANCE_TOKEN: "verify-audit",
    COOKDRIVE_AUTH_OFF: "1",
    COOKDRIVE_RATELIMIT_OFF: "1",
  },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});

let pret = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === "verify-audit") { pret = true; break; }
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

const call = async (method, path, body) => {
  for (let essai = 0; essai < 4; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      const headers = body !== undefined ? { "Content-Type": "application/json" } : {};
      const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    } catch {}
  }
  return { status: 0, json: null };
};

async function auditRows() {
  const db = await open({ filename: DBFILE, driver: sqlite3.Database });
  try {
    return await db.all("SELECT * FROM audit_log ORDER BY id");
  } finally { await db.close(); }
}

try {
  // ---- C1 prealable : une LECTURE n'ecrit pas (compteur de base) ----------
  const avant = await call("GET", "/api/haccp/temperatures");
  const base = await auditRows();
  check("C1 lecture libre n'ecrit PAS dans audit_log", avant.status === 200 && base.length === 0,
    `status=${avant.status} lignes=${base.length}`);

  // ---- A1 HACCP temperature (reglementaire) -------------------------------
  const a1 = await call("POST", "/api/haccp/temperature",
    { equipment_name: "Frigo A1", temperature: 4.2, user: "SYSTME" });
  check("A1 POST /api/haccp/temperature -> 200 + id", a1.status === 200 && typeof a1.json?.id === "string",
    `status=${a1.status}`);
  {
    const rows = await auditRows();
    const ligne = rows.find((r) => r.route === "/api/haccp/temperature" && r.action === "create");
    check("A1 audit_log porte la mutation", !!ligne && ligne.entite === a1.json?.id,
      `lignes=${rows.length} entite=${ligne?.entite} attendu=${a1.json?.id}`);
  }

  // ---- A2/A3/A4 inventaire ------------------------------------------------
  const a2 = await call("POST", "/api/inventory",
    { name: "Audit Carotte", quantity: 10, minStock: 2, unit: "kg", category: "audit" });
  check("A2 POST /api/inventory -> 200 + id", a2.status === 200 && a2.json?.id,
    `status=${a2.status}`);
  {
    const rows = await auditRows();
    check("A2 audit_log create inventory", rows.some((r) => r.route === "/api/inventory" && r.action === "create" && r.entite === a2.json?.id));
    const a3 = await call("PUT", `/api/inventory/${a2.json.id}`, { name: "Audit Carotte 2" });
    check("A3 PUT /api/inventory/:id -> 200", a3.status === 200, `status=${a3.status}`);
    const rows3 = await auditRows();
    check("A3 audit_log update inventory", rows3.some((r) => r.route === `/api/inventory/${a2.json.id}` && r.action === "update" && r.entite === a2.json.id));
    const a4 = await call("DELETE", `/api/inventory/${a2.json.id}`);
    check("A4 DELETE /api/inventory/:id -> 200", a4.status === 200, `status=${a4.status}`);
    const rows4 = await auditRows();
    check("A4 audit_log delete inventory", rows4.some((r) => r.route === `/api/inventory/${a2.json.id}` && r.action === "delete" && r.entite === a2.json.id));
  }

  // ---- A5/A6 recettes ------------------------------------------------------
  const a5 = await call("POST", "/api/recipes",
    { name: "Audit Recette", category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "audit" });
  check("A5 POST /api/recipes -> 200 + id", a5.status === 200 && a5.json?.id, `status=${a5.status}`);
  {
    const rows = await auditRows();
    check("A5 audit_log create recipe", rows.some((r) => r.route === "/api/recipes" && r.action === "create" && r.entite === a5.json?.id));
    const a6 = await call("DELETE", `/api/recipes/${a5.json.id}`);
    check("A6 DELETE /api/recipes/:id -> 200", a6.status === 200, `status=${a6.status}`);
    const rows6 = await auditRows();
    check("A6 audit_log delete recipe", rows6.some((r) => r.route === `/api/recipes/${a5.json.id}` && r.action === "delete" && r.entite === a5.json.id));
  }

  // ---- A7 fournisseurs -----------------------------------------------------
  const a7 = await call("POST", "/api/suppliers", { name: "Audit Fournisseur" });
  check("A7 POST /api/suppliers -> 200 + id", a7.status === 200 && a7.json?.id, `status=${a7.status}`);
  {
    const rows = await auditRows();
    check("A7 audit_log create supplier", rows.some((r) => r.route === "/api/suppliers" && r.action === "create" && r.entite === a7.json?.id));
  }

  // ---- A8 lot HACCP --------------------------------------------------------
  // Il faut un article reel pour la cle etrangere jugee par la route.
  const art = await call("POST", "/api/inventory", { name: "Audit Lot", quantity: 1, minStock: 0, unit: "kg", category: "audit" });
  const a8 = await call("POST", "/api/haccp/batches", {
    inventory_id: art.json?.id, lot_number: "LOT-A8", expiration_date: "2030-01-01", quantity: 2, unit: "kg",
  });
  check("A8 POST /api/haccp/batches -> 200 + id", a8.status === 200 && a8.json?.id, `status=${a8.status} corps=${JSON.stringify(a8.json)}`);
  {
    const rows = await auditRows();
    check("A8 audit_log create batch (HACCP)", rows.some((r) => r.route === "/api/haccp/batches" && r.action === "create" && r.entite === a8.json?.id));
  }

  // ---- A9 nettoyage HACCP ---------------------------------------------------
  const a9 = await call("POST", "/api/haccp/cleaning", { zone_name: "Plonge", completed_by: "audit" });
  check("A9 POST /api/haccp/cleaning -> 200 + id", a9.status === 200 && a9.json?.id, `status=${a9.status}`);
  {
    const rows = await auditRows();
    check("A9 audit_log create cleaning (HACCP)", rows.some((r) => r.route === "/api/haccp/cleaning" && r.action === "create" && r.entite === a9.json?.id));
  }

  // ---- A10 action corrective HACCP ------------------------------------------
  const tempLog = (await call("GET", "/api/haccp/temperatures")).json?.find?.(() => true);
  const a10 = tempLog ? await call("POST", "/api/haccp/corrective-action", { log_id: tempLog.id, action_taken: "audit correction" }) : { status: 0, json: null };
  check("A10 POST /api/haccp/corrective-action -> 200 + id", a10.status === 200 && a10.json?.id, `status=${a10.status}`);
  {
    const rows = await auditRows();
    check("A10 audit_log create corrective (HACCP)", rows.some((r) => r.route === "/api/haccp/corrective-action" && r.action === "create" && r.entite === a10.json?.id));
  }

  // ---- A11 menu planning -----------------------------------------------------
  const a11 = await call("POST", "/api/menu-planning", { date: "2026-10-07", meal_type: "lunch", title: "Audit" });
  check("A11 POST /api/menu-planning -> 200 + id", a11.status === 200 && a11.json?.id, `status=${a11.status}`);
  {
    const rows = await auditRows();
    check("A11 audit_log create menu-planning", rows.some((r) => r.route === "/api/menu-planning" && r.action === "create" && r.entite === a11.json?.id));
  }

  // ---- A12 staff -------------------------------------------------------------
  const a12 = await call("POST", "/api/staff", { name: "Audit Staff", hourlyRate: 15 });
  check("A12 POST /api/staff -> 200 + id", a12.status === 200 && a12.json?.id, `status=${a12.status}`);
  {
    const rows = await auditRows();
    check("A12 audit_log create staff", rows.some((r) => r.route === "/api/staff" && r.action === "create" && r.entite === a12.json?.id));
  }

  // ---- B1/B2 colonnes de traçabilite ----------------------------------------
  {
    const rows = await auditRows();
    const kinds = new Set(rows.map((r) => r.actor_kind));
    check("B1 actor_kind pose et nomme", rows.length > 0 && [...kinds].every((k) => ["humain", "agent", "harnais", "anonyme"].includes(k)),
      `kinds=${[...kinds].join(",")}`);
    check("B2 route posee sur chaque ligne", rows.every((r) => typeof r.route === "string" && r.route.startsWith("/")));
  }
} finally {
  arreter(child);
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du contrat d'audit rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT AUDIT: toutes les regles vertes");
process.exit(0);
