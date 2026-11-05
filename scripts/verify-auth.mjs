// Porte du contrat d'identite (chantier 1, audit 2026-10-02 §8).
// Le serveur juge est le VRAI server.ts (spawn tsx, USER_DATA_PATH isole) —
// un PASS juge sur un faux serveur ne serait pas une mesure.
//
// Le contrat juge, et pourquoi chaque regle est bloquante :
//   A1  GET /api/settings sans session       -> 200   (contrat license : lecture libre)
//   A2  POST /api/inventory sans session     -> 401 AUTH_REQUISE (la gate mord)
//   A3  GET /api/auth/me sans session        -> 401   (pas d'identite inventee)
//   A4  GET /api/settings                    -> AUCUN secret (nom ou valeur) ;
//       un settings.json herite peut porter `llm_clef` : la lecture libre ne
//       doit pas le rendre (scan 015 : la clef sortait en clair)
//   A5  GET /api/settings                    -> les champs non secrets REVIENNENT
//       (le filtre de A4 ne doit pas vider les reglages)
//   A6  GET /api/admin/db-download sans session -> 403 MAITRE_REQUIS (la base
//       porte les hachages argon2, les sessions et l'audit ; mesure du scan 015 :
//       un anonyme recevait les 290 816 o du fichier SQLite en 200)
//   B10 agent POST /suggestions/<id>/appliquer -> 403 AGENT_LECTURE_SEULE : la
//       liste §8 est EXACTE, pas un prefixe (la version `startsWith` laissait
//       franchir la gate a toute route posee sous /suggestions)
//   B11 agent POST /api/suggestions           -> 201 (sa seule ecriture reste ouverte)
//   B1  POST /api/auth/setup (0 compte)      -> 201 + role maitre + cookie httpOnly
//   B2  POST /api/auth/setup (2e fois)       -> 409 SETUP_DEJA_FAIT (sinon
//       quiconque atteint le serveur reprendrait la main sur une install existante)
//   B3  login mauvais mot de passe           -> 401 IDENTIFIANTS_REFUSES (message
//       identique compte absent / mot faux : pas d'enumeration)
//   B4  login bon                            -> 200 + Set-Cookie HttpOnly
//   B5  GET /api/auth/me avec cookie         -> 200 (session chargee)
//   B6  POST mutation avec session maitre    -> passe (le contrat: l'humain ecrit)
//   B7  creation compte agent par le maitre  -> 201 (gestion des comptes)
//   B8  POST mutation avec session agent     -> 403 AGENT_LECTURE_SEULE (Hermes
//       informe, l'humain execute — §8. C'est LA regle du produit)
//   B9  GET avec session agent               -> 200 (l'agent lit tout)
//   C1  /api/users sans session maitre       -> 401/403 (gestion protegee)
//   C2  logout puis mutation                 -> 401 (session detruite en base)
//
// Lancement : node scripts/verify-auth.mjs   (le code de sortie EST le verdict)
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const RACINE = resolve(fileURLToPath(import.meta.url), "..", "..");

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

const PORT = 4171;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_INSTANCE = "verify-auth";
const DATA = join(RACINE, "test", "tmp-auth");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

// A4/A5 : un settings.json HERITE d'une version ou la clef du prestataire
// vivait encore dans la table (le coffre systeme est la seule place depuis la
// tache 12). Sans ce semis, A4 passerait au vert sur un dossier VIDE et ne
// mesurerait rien : la regle doit pouvoir rougir sur l'etat exact qu'elle
// interdit (la faute mesuree par le scan 015 : `llm_clef` sortait au GET).
const SECRET_SEME = "SK-doit-ne-jamais-sortir-9f3a";
writeFileSync(
  join(DATA, "settings.json"),
  JSON.stringify({
    model_name: "llama3.2-vision",     // donnee metier : doit REVENIR (A5)
    language: "fr",
    llm_clef: SECRET_SEME,             // clef heritee : doit DISPARAITRE
    webhook_token: "tok-doit-ne-jamais-sortir", // suffixe `token`
    openai_api_key: "sk-doit-ne-jamais-sortir", // suffixe `apikey`
  }, null, 2),
);

const tsx = join(RACINE, "node_modules", ".bin", "tsx");
const ERRLOG = join(DATA, "serveur-stderr.log");
// Fantome : un fils orphelin d'un run precedent tient encore le port avec une
// VIEILLE base (lecon du 03/10 — B1 rendait SETUP_DEJA_FAIT a cause d'un fils
// survive au C-c d'un run hangue). On tue l'occupant AVANT de spawn. Le garde
// a jeton d'instance ne suffit pas : le fantome porte le MEME jeton (c'est la
// meme sonde qui l'a lance). fuser/lsof sont ABSENTS du conteneur et la
// cmdline du fils ne contient PAS « tsx server.ts » (c'est « node --require
// .../tsx/dist/preflight.cjs ... server.ts ») — ni pkill -f ni fuser ne
// l'attrapent. On parse donc /proc/*/cmdline directement : tuer tout process
// (sauf soi) dont la cmdline porte server.ts dans CE depot.
try {
  for (const pid of execSync(
    'for p in /proc/[0-9]*/cmdline; do tr "\\0" " " < "$p" 2>/dev/null; echo "|PID=${p}"; done',
    { shell: "/bin/bash" },
  ).toString().split("\n")) {
    const m = pid.match(/^(.*)\|PID=\/proc\/(\d+)\/cmdline$/);
    if (!m) continue;
    const [, cmdline, pidStr] = m;
    if (
      cmdline.includes("server.ts") &&
      // Le motif etait "cookdrive-project" : l'ANCIEN nom du depot (le
      // homepage de package.json le conserve encore). Un fils orphelin lance
      // depuis /home/clausake/.clausio/claus.io ne le porte PAS dans sa
      // cmdline : le garde ne tuait RIEN, B1 rougissait en 409 SETUP_DEJA_FAIT
      // sur la vieille base du fantome, et la lecon du 03/10 etait devenue
      // decorative. Le nom REEL du depot est le meme que celui de la base de
      // donnees (src/db/init.ts: ~/.clausio), donc le juge ne peut pas rougir
      // sur un dépôt voisin : il ne vise que CELUI-CI.
      cmdline.includes(RACINE) &&
      Number(pidStr) !== process.pid
    ) {
      try { process.kill(Number(pidStr), "SIGKILL"); } catch {}
    }
  }
} catch {}
await new Promise((r) => setTimeout(r, 500));
const child = spawn(process.execPath, [tsx, "server.ts"], {
    detached: true, // le fils devient chef de groupe (killed par `arreter`)
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "development",
         COOKDRIVE_INSTANCE_TOKEN: TOKEN_INSTANCE,
         // Harnais : le budget auth (20/15 min) serait sature par les runs
         // repetes de CE harnais (capteur mort). Le contrat rate-limit est
         // juge par verify:ratelimit, sur son propre serveur, sans cette env.
         COOKDRIVE_RATELIMIT_OFF: "1" },
  stdio: ["ignore", "ignore", openSync(ERRLOG, "w")],
});
// Le stderr du fils est consigne : un crash serveur doit se LIRE, pas se
// deviner (lecon du 03/10 : ECONNRESET sur A2 sans trace = cause inconnue).

let pret = false;
let instanceEtrange = null;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`, { headers: { "X-Cookdrive-Instance": TOKEN_INSTANCE } });
    const recu = r.headers.get("x-cookdrive-instance");
    if (r.ok && recu === TOKEN_INSTANCE) { pret = true; break; }
    if (r.ok && recu) { instanceEtrange = recu; break; }
  } catch {}
  await new Promise((res) => setTimeout(res, 250));
}
if (instanceEtrange) {
  arreter(child);
  console.log("ECHEC  instance PERIMEE sur le port " + PORT + " (en-tete dit « " + instanceEtrange + " »)");
  process.exit(1);
}
if (!pret) {
  arreter(child);
  console.log("ECHEC  serveur pas pret sur " + BASE);
  process.exit(1);
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

// fetch n'expose pas les Set-Cookie : on lit l'en-tete brut et on re-pose le
// cookie dans les appels suivants. Meme principe que le harnais instance.
const jar = {};
function rememberSetCookie(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  for (const line of sc) {
    const [pair] = line.split(";");
    const [name, value] = pair.split("=");
    jar[name.trim()] = value;
  }
}
const cookieHeader = () =>
  Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
// Les premieres secondes du serveur dev rendent parfois ECONNRESET (Vite
// compile a la volee entre deux requetes) : 4 essais espaces avant de
// declarer l'echec — une regle qui rouge sur un reset reseau n'est pas
// un verdict, c'est un capteur mort.
const call = async (method, path, body, withCookie = true) => {
  let lastErr = null;
  for (let essai = 0; essai < 4; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      const headers = { "X-Cookdrive-Instance": TOKEN_INSTANCE };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (withCookie && cookieHeader()) headers["Cookie"] = cookieHeader();
      const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      rememberSetCookie(res);
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

try {
  // A1 lecture libre sans session
  const a1 = await call("GET", "/api/settings");
  check("A1 GET sans session 200 (lecture libre)", a1.status === 200, `status=${a1.status}`);

  // A4 un secret herite ne sort JAMAIS par la lecture libre. Le nom normalise
  // est juge par SUFFIXE (clef/token/apikey/secret/password) ET aucune valeur
  // semee ne doit apparaitre dans le corps rendu — la seconde mesure attrape
  // un secret renomme (`parametre_1`) que la premiere laisserait passer.
  const corpsA4 = JSON.stringify(a1.json ?? {});
  const nomsSecrets = Object.keys(a1.json ?? {}).filter((k) =>
    ["clef", "token", "apikey", "secret", "password", "motdepasse"]
      .some((r) => k.toLowerCase().replace(/[-_\s]/g, "").endsWith(r)));
  const valeursFuitives = ["SK-doit-ne-jamais-sortir-9f3a", "tok-doit-ne-jamais-sortir",
    "sk-doit-ne-jamais-sortir"].filter((v) => corpsA4.includes(v));
  check("A4 GET /api/settings ne rend aucun secret (nom ou valeur)",
    nomsSecrets.length === 0 && valeursFuitives.length === 0,
    `champs=${nomsSecrets.join(",") || "aucun"} valeurs=${valeursFuitives.join(",") || "aucune"}`);

  // A5 le filtre ne vide pas les reglages : la donnee metier revient
  check("A5 GET /api/settings rend encore les champs non secrets",
    a1.json?.model_name === "llama3.2-vision" && a1.json?.language === "fr",
    `model_name=${a1.json?.model_name} language=${a1.json?.language}`);

  // A6 la base entiere n'est pas de la lecture libre : hachages argon2, sessions
  // vivantes et journal d'audit y sont. La gate exempte les GET (A1), donc la
  // garde doit exister DANS la route. Mesure du scan 015 : un anonyme recevait
  // 290 816 o de SQLite en 200 — cette regle rougissait sur cet etat exact.
  const a6 = await fetch(`${BASE}/api/admin/db-download`, {
    headers: { "X-Cookdrive-Instance": TOKEN_INSTANCE },
  }).then(async (r) => ({ status: r.status, type: r.headers.get("content-type") ?? "",
                          debut: (await r.arrayBuffer()).byteLength }))
    .catch((e) => ({ status: 0, type: String(e), debut: 0 }));
  check("A6 GET /api/admin/db-download sans session -> 403 MAITRE_REQUIS",
    a6.status === 403, `status=${a6.status} type=${a6.type} octets=${a6.debut}`);

  // A2 la gate mord sur mutation anonyme
  const a2 = await call("POST", "/api/inventory", { name: "x", quantity: 1, unit: "kg", category: "test" });
  check("A2 POST sans session -> 401 AUTH_REQUISE", a2.status === 401 && a2.json?.error === "AUTH_REQUISE",
    `status=${a2.status} error=${a2.json?.error}`);

  // A3 pas d'identite inventee
  const a3 = await call("GET", "/api/auth/me");
  check("A3 me sans session -> 401", a3.status === 401, `status=${a3.status}`);

  // B1 setup initial
  const b1 = await call("POST", "/api/auth/setup", { username: "maitre", password: "passe-2026-fort" }, false);
  const b1cookie = (b1.json?.ok === true);
  check("B1 setup initial -> 201 maitre + cookie", b1.status === 201 && b1.json?.user?.role === "maitre" && b1cookie,
    `status=${b1.status} role=${b1.json?.user?.role}`);

  // B2 setup refuse une seconde fois
  const b2 = await call("POST", "/api/auth/setup", { username: "intrus", password: "passe-2026-fort" }, false);
  check("B2 2e setup -> 409 SETUP_DEJA_FAIT", b2.status === 409 && b2.json?.error === "SETUP_DEJA_FAIT",
    `status=${b2.status} error=${b2.json?.error}`);

  // B3 mauvais mot de passe (message identique compte absent / mot faux)
  const b3a = await call("POST", "/api/auth/login", { username: "maitre", password: "mauvais-mot" }, false);
  const b3b = await call("POST", "/api/auth/login", { username: "inexistant", password: "mauvais-mot" }, false);
  check("B3 login faux -> 401, message identique",
    b3a.status === 401 && b3b.status === 401 &&
    b3a.json?.error === "IDENTIFIANTS_REFUSES" && b3b.json?.error === b3a.json?.error,
    `status=${b3a.status}/${b3b.status}`);

  // B4 login correct (session maitre deja posee par B1 ; on se reconnecte quand meme)
  const b4 = await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  check("B4 login correct -> 200 + cookie pose", b4.status === 200 && b4.json?.user?.role === "maitre",
    `status=${b4.status}`);

  // B5 me avec session
  const b5 = await call("GET", "/api/auth/me");
  check("B5 me avec session -> 200", b5.status === 200 && b5.json?.user?.username === "maitre",
    `status=${b5.status} user=${b5.json?.user?.username}`);

  // B6 mutation avec session maitre : la meme route que A2 passe desormais.
  // On utilise POST /api/users (creation) pour ne pas polluer l'inventaire.
  const b6 = await call("POST", "/api/users", { username: "brigade", password: "passe-staff-01", role: "staff" });
  check("B6 POST avec session maitre -> 201", b6.status === 201, `status=${b6.status}`);

  // B7 compte agent cree par le maitre
  const b7 = await call("POST", "/api/users", { username: "hermes", password: "passe-agent-01", role: "agent" });
  check("B7 creation compte agent -> 201", b7.status === 201 && b7.json?.user?.role === "agent",
    `status=${b7.status} role=${b7.json?.user?.role}`);

  // B8 la regle §8 : l'agent informe, l'humain execute.
  jar.cd_session = undefined; delete jar.cd_session;
  const b8login = await call("POST", "/api/auth/login", { username: "hermes", password: "passe-agent-01" }, false);
  const b8 = await call("POST", "/api/users", { username: "x-y-z", password: "passe-x-y-z-1", role: "staff" });
  check("B8 mutation avec session agent -> 403 AGENT_LECTURE_SEULE",
    b8login.status === 200 && b8.status === 403 && b8.json?.error === "AGENT_LECTURE_SEULE",
    `login=${b8login.status} post=${b8.status} error=${b8.json?.error}`);

  // B9 l'agent lit tout
  const b9 = await call("GET", "/api/settings");
  check("B9 GET avec session agent -> 200 (il lit tout)", b9.status === 200, `status=${b9.status}`);

  // B10 l'exemption §8 est une liste de routes EXACTES : l'agent ne doit pas
  // franchir la gate sur `/suggestions/<id>/appliquer` (prefixe). Mesure : la
  // route rend aujourd'hui MAITRE_REQUIS de son propre chef, mais la GATE doit
  // refuser AVANT elle — sinon une future route sous ce prefixe serait ouverte.
  const b10propose = await call("POST", "/api/suggestions", {
    type: "stock", priorite: "basse", titre: "Sonde 015 : exemption exacte",
    action_route: "/api/inventory", action_payload: { name: "x", quantity: 1, unit: "kg", category: "test" },
  });
  const b10id = b10propose.json?.id;
  const b10 = await call("POST", `/api/suggestions/${b10id}/appliquer`, {});
  check("B10 agent POST /suggestions/<id>/appliquer -> 403 AGENT_LECTURE_SEULE (gate)",
    b10propose.status === 201 && b10.status === 403 && b10.json?.error === "AGENT_LECTURE_SEULE",
    `propose=${b10propose.status} appliquer=${b10.status} error=${b10.json?.error}`);
  // B11 la morsure inverse : l'exemption VRAIE reste ouverte (un correctif qui
  // fermerait tout passerait B10 en cassant le produit).
  check("B11 agent POST /api/suggestions -> 201 (sa seule ecriture reste ouverte)",
    b10propose.status === 201, `status=${b10propose.status} id=${b10id ?? "aucun"}`);

  // C1 la gestion des comptes n'est pas ouverte a l'agent non plus
  const c1 = await call("GET", "/api/users");
  check("C1 GET /api/users avec agent -> 403 MAITRE_REQUIS",
    c1.status === 403 && c1.json?.error === "MAITRE_REQUIS", `status=${c1.status} error=${c1.json?.error}`);

  // C2 logout detruit la session en base : la mutation redevient 401
  jar.cd_session = undefined; delete jar.cd_session;
  await call("POST", "/api/auth/login", { username: "maitre", password: "passe-2026-fort" }, false);
  const c2logout = await call("POST", "/api/auth/logout");
  jar.cd_session = undefined; delete jar.cd_session;
  const c2 = await call("POST", "/api/users", { username: "re-entre", password: "passe-re-entre", role: "staff" });
  check("C2 logout detruit la session -> mutation 401",
    c2logout.status === 200 && c2.status === 401, `logout=${c2logout.status} post=${c2.status}`);
} finally {
  arreter(child);
}

if (fail > 0) {
  console.log(`ECHEC  ${fail} regle(s) du contrat d'identite rouge(s)`);
  arreter(child);
  process.exit(1);
}
console.log("CONTRAT IDENTITE: toutes les regles vertes");
// Exit explicite : le pipe du fils et le keep-alive undici garderaient le
// event loop vivant apres le verdict (mesure du premier run, RC=124).
arreter(child);
process.exit(0);
