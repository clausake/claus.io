// Porte du contrat de la boîte de suggestions (chantier 3, feuille de route §8).
// Juge le SERVEUR REEL (spawn tsx, USER_DATA_PATH isole, port OS alloue).
// Le contrat §8 : L'AGENT PROPOSE, L'HUMAIN EXECUTE.
//
//   A1  POST /api/suggestions avec session agent -> 201 (la SEULE ecriture de
//       l'agent — Hermes informe, il peut maintenant PROPOSER)
//   A2  POST /api/suggestions anonyme            -> 401
//   A3  POST /api/suggestions avec session staff -> 403 STAFF_LECTURE_SEULE
//   A4  la creation refuse type/priorite hors enum, titre blanc, route
//       cible hors liste blanche (400 NOMME — on ne rejoue pas un payload
//       invente vers /api/unlock ou /api/users)
//   A5  la suggestion est RELUE en base (statut nouveau, action pre-remplie)
//   B1  l'agent NE PEUT PAS appliquer ni rejeter (403 MAITRE_REQUIS) —
//       il propose, il ne tranche pas
//   B2  le maitre applique -> statut passe 'applique', la route cible a
//       VRAIMENT ete rejouee (DELTA en base : la cible /api/haccp/cleaning a
//       ecrit sa ligne), applique_par pose
//   B3  le maitre rejette SANS motif -> 400 MOTIF_REQUIS
//   B4  le maitre rejette AVEC motif -> statut 'rejete' + motif_rejet relu
//   B5  une suggestion deja decidee n'est plus decidable (409 DEJA_DECIDE)
//   B6  l'application d'une action que la route cible REFUSE reste 'nouveau'
//       et le refus est NOMME (CIBLE_REFUSEE) — pas de demi-succes
//   C1  lecture libre GET /api/suggestions (l'UI du chef la lit)
//   D1  l'application est tracee dans audit_log (chantier 2 branché)
//
// Le harnais boote avec COOKDRIVE_AUTH_OFF NON pose : ce contrat juge
// L'IDENTITE de bout en bout (login agent, login maitre, application signee).
// Lancement : node scripts/verify-suggestions.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { execSync } from "node:child_process";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DATA = join(process.cwd(), "test", "tmp-suggestions");
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

// Garde fantomes (lecons 03/10) : on tue tout server.ts de CE depot avant spawn.
try {
  for (const pid of execSync(
    'for p in /proc/[0-9]*/cmdline; do tr "\\0" " " < "$p" 2>/dev/null; echo "|PID=${p}"; done',
    { shell: "/bin/bash" },
  ).toString().split("\n")) {
    const m = pid.match(/^(.*)\|PID=\/proc\/(\d+)\/cmdline$/);
    if (!m) continue;
    if (m[1].includes("server.ts") && m[1].includes("cookdrive-project") && Number(m[2]) !== process.pid) {
      try { process.kill(Number(m[2]), "SIGKILL"); } catch {}
    }
  }
} catch {}

const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const child = spawn(process.execPath, [TSX, "server.ts"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    USER_DATA_PATH: DATA,
    COOKDRIVE_INSTANCE_TOKEN: "verify-suggestions",
    // rate-limit coupe : le contrat repete login/mutations, le bucket auth
    // sature sinon. Le contrat rate-limit a SA porte (verify:ratelimit).
    COOKDRIVE_RATELIMIT_OFF: "1",
  },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});

let pret = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === "verify-suggestions") { pret = true; break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

if (!pret) {
  child.kill("SIGKILL");
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
      const headers = { "X-Cookdrive-Instance": "verify-suggestions" };
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

async function suggestionRows() {
  const db = await open({ filename: DBFILE, driver: sqlite3.Database });
  try { return await db.all("SELECT * FROM suggestions ORDER BY created_at"); }
  finally { await db.close(); }
}

try {
  // Setup maitre + comptes agent/staff (chantier 1).
  const setup = await call("POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
  check("setup initial -> 201 maitre", setup.status === 201 && setup.json?.user?.role === "maitre", `status=${setup.status}`);

  // C1 lecture libre sans session
  const c1 = await call("GET", "/api/suggestions");
  check("C1 GET sans session -> 200 (lecture libre)", c1.status === 200 && Array.isArray(c1.json), `status=${c1.status}`);

  // A2 creation anonyme refusee (on vide le jar du setup)
  jar.cd_session = undefined; delete jar.cd_session;
  const a2 = await call("POST", "/api/suggestions", { type: "stock", titre: "x", action_route: "/api/haccp/cleaning" });
  check("A2 POST anonyme -> 401", a2.status === 401, `status=${a2.status}`);

  // A3 creation staff refusee (reconnexion maitre d'abord)
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const staff = await call("POST", "/api/users", { username: "brigade", password: "passe-staff-01", role: "staff" });
  check("staff cree", staff.status === 201, `status=${staff.status}`);
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "brigade", password: "passe-staff-01" }, false);
  const a3 = await call("POST", "/api/suggestions", { type: "stock", titre: "x", action_route: "/api/haccp/cleaning" });
  check("A3 POST avec session staff -> 403", a3.status === 403, `status=${a3.status} error=${a3.json?.error}`);

  // A1 creation agent acceptee (LA SEULE ecriture de l'agent) — reconnexion
  // maitre : le jar porte encore la session staff du A3.
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const agent = await call("POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });
  check("agent cree", agent.status === 201, `status=${agent.status}`);
  jar.cd_session = undefined; delete jar.cd_session;
  const loginA = await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  check("login agent", loginA.status === 200 && loginA.json?.user?.role === "agent", `status=${loginA.status}`);
  const a1 = await call("POST", "/api/suggestions", {
    type: "stock", priorite: "haute", titre: "Reveiller le stock Audit",
    explication: "Le frigo A1 derive.",
    action_route: "/api/haccp/cleaning", action_payload: { zone_name: "Plonge", completed_by: "agent" },
  });
  check("A1 POST avec session agent -> 201", a1.status === 201 && a1.json?.statut === "nouveau", `status=${a1.status} corps=${JSON.stringify(a1.json)}`);
  const a1id = a1.json?.id;

  // A4 invalides refusees NOMMEES
  const a4a = await call("POST", "/api/suggestions", { type: "hors_enum", titre: "x", action_route: "/api/haccp/cleaning" });
  check("A4a type hors enum -> 400", a4a.status === 400 && a4a.json?.error === "TYPE_INVALIDE", `status=${a4a.status}`);
  const a4b = await call("POST", "/api/suggestions", { type: "stock", titre: "   ", action_route: "/api/haccp/cleaning" });
  check("A4b titre blanc -> 400", a4b.status === 400 && a4b.json?.error === "TITRE_INVALIDE", `status=${a4b.status}`);
  const a4c = await call("POST", "/api/suggestions", { type: "stock", titre: "x", action_route: "/api/unlock" });
  check("A4c route hors liste blanche -> 400", a4c.status === 400 && a4c.json?.error === "ROUTE_INCONNUE", `status=${a4c.status} error=${a4c.json?.error}`);

  // A5 relue en base
  {
    const rows = await suggestionRows();
    const relue = rows.find((r) => r.id === a1id);
    check("A5 suggestion relue en base (nouveau + action pre-remplie)",
      !!relue && relue.statut === "nouveau" && relue.action_route === "/api/haccp/cleaning" && JSON.parse(relue.action_payload).zone_name === "Plonge",
      `statut=${relue?.statut} route=${relue?.action_route}`);
  }

  // B1 l'agent ne tranche pas
  const b1a = await call("POST", `/api/suggestions/${a1id}/appliquer`);
  check("B1a agent appliquer -> 403", b1a.status === 403, `status=${b1a.status} error=${b1a.json?.error}`);
  const b1b = await call("POST", `/api/suggestions/${a1id}/rejeter`, { motif: "x" });
  check("B1b agent rejeter -> 403", b1b.status === 403, `status=${b1b.status}`);

  // B4 le maitre rejette AVEC motif
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const b4 = await call("POST", `/api/suggestions/${a1id}/rejeter`, { motif: "La plonge a deja ete faite ce jour." });
  check("B4 rejeter avec motif -> statut rejete", b4.status === 200 && b4.json?.statut === "rejete", `status=${b4.status} corps=${JSON.stringify(b4.json)}`);
  {
    const rows = await suggestionRows();
    const relue = rows.find((r) => r.id === a1id);
    check("B4 motif_rejet relu en base", relue?.statut === "rejete" && relue?.motif_rejet === "La plonge a deja ete faite ce jour.");
  }

  // B5 deja decidee -> 409
  const b5 = await call("POST", `/api/suggestions/${a1id}/appliquer`);
  check("B5 deja decidee -> 409", b5.status === 409 && b5.json?.error === "DEJA_DECIDE", `status=${b5.status}`);

  // B3 rejet SANS motif refuse
  const a2id = "sug-a2-" + Date.now();
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  const a2b = await call("POST", "/api/suggestions", {
    type: "haccp", titre: "Relever la temperature du froid",
    action_route: "/api/haccp/temperature", action_payload: { equipment_name: "Frigo B", temperature: 3.5, user: "SYSTME" },
  });
  check("2e suggestion agent creee", a2b.status === 201, `status=${a2b.status}`);
  const a2bid = a2b.json?.id;
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const b3 = await call("POST", `/api/suggestions/${a2bid}/rejeter`, { motif: "" });
  check("B3 rejet sans motif -> 400 MOTIF_REQUIS", b3.status === 400 && b3.json?.error === "MOTIF_REQUIS", `status=${b3.status}`);

  // B2 application : la route cible VRAIMENT rejouee (DELTA en base)
  const avant = await call("GET", "/api/haccp/temperatures");
  const nAvant = Array.isArray(avant.json) ? avant.json.length : 0;
  const b2 = await call("POST", `/api/suggestions/${a2bid}/appliquer`);
  check("B2 application par le maitre -> statut applique", b2.status === 200 && b2.json?.statut === "applique",
    `status=${b2.status} corps=${JSON.stringify(b2.json)}`);
  const apres = await call("GET", "/api/haccp/temperatures");
  const nApres = Array.isArray(apres.json) ? apres.json.length : 0;
  check("B2 DELTA : la route cible a VRAIMENT ecrit", nApres === nAvant + 1, `avant=${nAvant} apres=${nApres}`);
  {
    const rows = await suggestionRows();
    const relue = rows.find((r) => r.id === a2bid);
    check("B2 applique_par pose", relue?.statut === "applique" && typeof relue?.applique_par === "string" && relue.applique_par !== "");
  }

  // B6 action refusee par la cible : reste 'nouveau', refus NOMME
  const a3id = (await call("POST", "/api/suggestions", {
    type: "stock", titre: "Payload invalide volontaire",
    action_route: "/api/haccp/temperature", action_payload: { equipment_name: "", temperature: "vingt degres" },
  })).json?.id;
  const b6 = await call("POST", `/api/suggestions/${a3id}/appliquer`);
  check("B6 cible refusee -> refus NOMME + suggestion reste nouveau",
    b6.status === 422 && b6.json?.error === "CIBLE_REFUSEE" && b6.json?.cible_status === 400, `status=${b6.status} corps=${JSON.stringify(b6.json)}`);
  {
    const rows = await suggestionRows();
    check("B6 suggestion reste 'nouveau' apres refus cible", rows.find((r) => r.id === a3id)?.statut === "nouveau");
  }

  // D1 l'application est tracee dans audit_log
  {
    const db = await open({ filename: DBFILE, driver: sqlite3.Database });
    try {
      const rows = await db.all(
        "SELECT * FROM audit_log WHERE route = ? AND action = 'applique'",
        [`/api/suggestions/${a2bid}/appliquer`]);
      check("D1 application tracee dans audit_log", rows.length >= 1, `lignes=${rows.length}`);
    } finally { await db.close(); }
  }
} finally {
  child.kill("SIGKILL");
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du contrat suggestions rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT SUGGESTIONS: toutes les regles vertes");
process.exit(0);
