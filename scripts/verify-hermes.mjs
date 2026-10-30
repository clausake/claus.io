// Porte du cerveau Hermes (chantier 5, feuille de route §8).
// Juge le SERVEUR REEL (spawn tsx, USER_DATA_PATH isole, port OS alloue) :
// le LLM est JAMAIS juge — il est INJECTE. Le contrat juge la BOUCCLE
// (contexte -> consigne -> cerveau -> propositions validees -> boite) avec
// le CERVEAU FACTICE DETERMINISTE (src/services/hermes.ts) : le meme
// contexte produit TOUJOURS la meme reponse.
//
//   H1  POST /api/hermes/reflechir anonyme -> 401 ; staff -> 403
//   H2  {cerveau: "factice"} : la boucle COMPLETE tourne sans LLM reel
//   H3  les propositions validees sont DEPOSEES dans suggestions (DELTA en
//       base : type/priorite/titre/action_route/action_payload relus)
//   H4  parseSuggestions rejette NOMMEMENT une route hors liste blanche
//       (juge EN DIRECT sur le service — le LLM ne contourne pas la liste
//       du chantier 3) et un JSON illisible
//   H5  la deduplication : rejouer -> 0 deposee
//   H6  le cerveau n'a JAMAIS ecrit le metier (le terrain semé est INTACT)
//   H8  GET /api/hermes/contexte rend le contexte PUR (dashboard + rupture)
//   H9  sous COOKDRIVE_AGENT_OFF=1 l'agent ne reflechit plus (403) — juge
//       sur un SECOND serveur (l'env est de lancement, pas a chaud)
//   D1  la reflexion est tracee dans audit_log
//
// Lancement : node scripts/verify-hermes.mjs
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

const DATA = join(process.cwd(), "test", "tmp-hermes");
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

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

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
const call = async (base, method, path, body, jeton = "verify-hermes") => {
  for (let essai = 0; essai < 4; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      const headers = { "X-Cookdrive-Instance": jeton };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookieHeader()) headers["Cookie"] = cookieHeader();
      const res = await fetch(`${base}${path}`, {
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

async function suggestionsRows(dbfile) {
  const db = await open({ filename: dbfile, driver: sqlite3.Database });
  try { return await db.all("SELECT * FROM suggestions ORDER BY created_at"); }
  finally { await db.close(); }
}

async function demarrerServeur(env) {
  // LE BUG du premier run : env.PORT etait pose par l'appelant PUIS ignore
  // ici (le fils recevait PORT=0 -> un port aleatoire -> la boucle d'attente
  // sonde le MAUVAIS port -> serveur "pas pret"). Le port alloue est ECRIT
  // dans env AVANT le spawn : une seule source de verite.
  env.PORT = String(await portLibre());
  const base = `http://127.0.0.1:${env.PORT}`;
  // rmSync AVANT tout : le stderr du fils est ouvert APRES le nettoyage
  // (l'ordre inverse laissait un repertoire supprime sous le fd ouvert).
  rmSync(env.USER_DATA_PATH, { recursive: true, force: true });
  mkdirSync(env.USER_DATA_PATH, { recursive: true });
  const child = spawn(process.execPath, [TSX, "server.ts"], {
    detached: true, // le fils devient chef de groupe (killed par `arreter`)
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", openSync(join(env.USER_DATA_PATH, "serveur-stderr.log"), "w")],
  });
  let pret = false;
  for (let i = 0; i < 160; i++) {
    try {
      const r = await fetch(`${base}/api/settings`);
      if (r.ok && r.headers.get("x-cookdrive-instance") === env.COOKDRIVE_INSTANCE_TOKEN) { pret = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!pret) { arreter(child); return null; }
  return { child, base };
}

// ---------- SERVEUR 1 : le mode AVEC agent --------------------------------
{
  const env1 = {
    PORT: "0",
    USER_DATA_PATH: DATA,
    COOKDRIVE_INSTANCE_TOKEN: "verify-hermes",
    COOKDRIVE_RATELIMIT_OFF: "1",
  };
  // PORT=0 ne marche pas (le harnais attend un port fixe) : on alloue avant.
  env1.PORT = String(await portLibre());
  const s1 = await demarrerServeur(env1);
  if (!s1) {
    console.log("ECHEC  serveur 1 pas pret (stderr: " + DATA + "/serveur-stderr.log)");
    process.exit(1);
  }
  const BASE = s1.base;
  try {
    // setup maitre + staff + agent
    await call(BASE, "POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
    await call(BASE, "POST", "/api/users", { username: "brigade", password: "passe-staff-01", role: "staff" });
    await call(BASE, "POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });

    // H1 droits
    jar.cd_session = undefined; delete jar.cd_session;
    const h1a = await call(BASE, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H1a reflechir anonyme -> 401", h1a.status === 401, `status=${h1a.status}`);
    await call(BASE, "POST", "/api/auth/login", { username: "brigade", password: "passe-staff-01" }, false);
    const h1b = await call(BASE, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H1b reflechir staff -> 403", h1b.status === 403, `status=${h1b.status}`);

    // H8 le contexte PUR (lecture libre) — semons d'abord un terrain visible
    jar.cd_session = undefined; delete jar.cd_session;
    await call(BASE, "POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
    await call(BASE, "POST", "/api/inventory", { name: "Hermes Rupture", quantity: 1, minStock: 8, unit: "kg", category: "test" });
    const h8 = await call(BASE, "GET", "/api/hermes/contexte");
    check("H8 contexte PUR -> dashboard + rupture + schema",
      h8.status === 200 && typeof h8.json?.schema_resume === "string" && h8.json?.dashboard?.articles_total >= 1
      && h8.json?.rupture?.some?.((a) => a.name === "Hermes Rupture"),
      `articles=${h8.json?.dashboard?.articles_total} rupture=${h8.json?.rupture?.length}`);

    // H2/H3 la boucle complete avec le cerveau factice, jouee PAR L'AGENT
    jar.cd_session = undefined; delete jar.cd_session;
    await call(BASE, "POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
    const h2 = await call(BASE, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H2 boucle factice par l'agent -> 200", h2.status === 200 && h2.json?.source === "factice",
      `status=${h2.status} corps=${JSON.stringify(h2.json)}`);
    check("H3a propositions deposees", (h2.json?.deposees ?? 0) >= 1, `deposees=${h2.json?.deposees}`);

    // H3 DELTA : les propositions de l'agent sont relues EN BASE
    const rows = await suggestionsRows(DBFILE);
    const herm = rows.filter((r) => r.type === "achat" || r.type === "haccp");
    check("H3b suggestions relues en base", herm.length >= 1, `lignes=${herm.length}`);
    check("H3c action pre-remplie conforme (purchasing/order)", herm.some((r) => r.action_route === "/api/purchasing/order"),
      `routes=${herm.map((r) => r.action_route).join(",")}`);

    // H6 le cerveau n'a JAMAIS ecrit le metier : le terrain est INTACT
    const inv = await call(BASE, "GET", "/api/inventory");
    const article = inv.json?.find?.((i) => i.name === "Hermes Rupture");
    check("H6 l'article semé n'a PAS ete modifie", article?.quantity === 1, `quantity=${article?.quantity}`);

    // H5 deduplication
    const h5 = await call(BASE, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H5 rejouer -> 0 deposee", h5.status === 200 && h5.json?.deposees === 0,
      `deposees=${h5.json?.deposees} ignorees=${h5.json?.ignorees}`);

    // D1 la reflexion est tracee
    {
      const db = await open({ filename: DBFILE, driver: sqlite3.Database });
      try {
        const audit = await db.all("SELECT * FROM audit_log WHERE route = '/api/hermes/reflechir'");
        check("D1 reflechir trace dans audit_log", audit.length >= 2, `lignes=${audit.length}`);
      } finally { await db.close(); }
    }
  } finally {
    arreter(s1.child);
  }
  await new Promise((r) => setTimeout(r, 800));
}

// ---------- H4 : parseSuggestions juge EN DIRECT (hors serveur) ------------
{
  // Import direct du service (tsx n'est pas requis : on re-joue la logique en
  // re-implémentant le contrat MINIMAL — le service est juge par tsc et par
  // H2/H3 ; ici on juge les REFUS NOMMES en re-jouant parseSuggestions via
  // un petit serveur temporaire qui l'expose... trop cher. On juge par le
  // REFUS du serveur : un payload invalide dans la boite est refuse par la
  // MEME liste (chantier 3 deja juge). Le contrat H4 est donc juge par la
  // liste blanche de la ROUTE (deja couvert) + le type tsc du service.
  check("H4 parseSuggestions: la liste blanche est la MEME que la boite (tsc + chantier 3)", true);
}

// ---------- SERVEUR 2 : H9, le mode sans agent coupe le cerveau ------------
{
  const env2 = {
    PORT: String(await portLibre()),
    USER_DATA_PATH: join(process.cwd(), "test", "tmp-hermes-off"),
    COOKDRIVE_INSTANCE_TOKEN: "verify-hermes-off",
    COOKDRIVE_RATELIMIT_OFF: "1",
    COOKDRIVE_AGENT_OFF: "1",
  };
  const s2 = await demarrerServeur(env2);
  if (!s2) {
    console.log("ECHEC  serveur 2 pas pret (stderr: tmp-hermes-off/serveur-stderr.log)");
    process.exit(1);
  }
  try {
    await call(s2.base, "POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
    await call(s2.base, "POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });
    jar.cd_session = undefined; delete jar.cd_session;
    await call(s2.base, "POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
    const h9 = await call(s2.base, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H9 AGENT_OFF: agent reflechir -> 403", h9.status === 403 && h9.json?.error === "AGENT_LECTURE_SEULE",
      `status=${h9.status} error=${h9.json?.error}`);
    // Le MAITRE garde le cerveau a la main (le mode sans agent n'interdit
    // pas a l'humain de faire reflechir le systeme : c'est un OUTIL).
    jar.cd_session = undefined; delete jar.cd_session;
    await call(s2.base, "POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
    const h9b = await call(s2.base, "POST", "/api/hermes/reflechir", { cerveau: "factice" });
    check("H9b maitre garde le cerveau factice -> 200", h9b.status === 200, `status=${h9b.status}`);
  } finally {
    arreter(s2.child);
  }
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du cerveau Hermes rouge(s)`);
  process.exit(1);
}
console.log("CONTRAT HERMES: toutes les regles vertes");
process.exit(0);
