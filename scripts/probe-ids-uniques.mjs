// Porte: les cles primaires fabriquees par le serveur sont UNIQUES SOUS RAFALE.
//
// POURQUOI CETTE PORTE EXISTE (defaut mesure le 30/10). Cinq routes ecrivaient
// leur cle primaire avec `Date.now().toString()` : POST /api/menu-planning,
// POST /api/suppliers, POST /api/suppliers/purchasing-document,
// /api/documents (creation et brouillon d'upload) et POST /api/inventory.
// Deux ecritures tombant dans la MEME milliseconde produisent la MEME cle; la
// contrainte saute; la route repond 500 « Failed to save to planning » et la
// ligne du chef est perdue. Ce n'est pas une lecture : c'est COMPTE.
//
//   POST /api/menu-planning, 40 ecritures SEQUENTIELLES -> ok=37 ko=3
//   POST /api/menu-planning, 40 ecritures EN PARALLELE -> ok=7  ko=33
//   apres le remede (src/shared/util.ts nouvelId)     -> ok=80 ko=0, 80 ids
//
// Le hasard ne suffit pas a masquer la faute: un identifiant tire au hasard
// peut encore collisionner et, surtout, la collision serait SILENCIEUSE. La
// sequence est la seule forme qui donne l'unicite par construction.
//
// LES VERDICTS (rc 0 = tous tenus, rc 9 = la porte ne s'est pas jouee) :
//   U0 20 000 appels SYNCHRONES au generateur : tous distincts (verdict
//      deterministe : sous l'horloge nue ils tombent dans une ou deux
//      millisecondes et rendent des ids IDENTIQUES — c'est ce verdict qui
//      nomme M1 sur toute machine, sans dependre du planning reseau)
//   U1 40 ecritures sequentielles sur la planification : aucune refusee
//   U2 200 ecritures en PARALLELE : aucune refusee (la fenetre du defaut)
//   U3 les 240 lignes sont RELUES en base (pas seulement « 200 »)
//   U4 les 240 ids sont DISTINCTS
//   U5 chaque id rendu par une reponse se retrouve en base (parite)
//   U6 la rafale a bien touche la milliseconde partagee (sinon la porte n'a pas
//      exerce le defaut : terrain insuffisant, PAS un vert)
//   U7 meme contrat sur les fournisseurs (l'autre route a cle nue, 100 envois)
//
// Lancement: node scripts/probe-ids-uniques.mjs
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "net";
import { fileURLToPath } from "node:url";

// La racine du depot, DERIVEE du fichier lui-meme : un nom en dur
// (« cookdrive-project » = l ancien nom, ou « .clausio/claus.io » = le
// chemin de MA machine) ne figure dans la cmdline d aucun fils sur un
// autre poste — mesure le 30/10 : la CI GitHub (depot dans
// /home/runner/work/claus.io/claus.io) ne voyait AUCUN fils et ma porte
// verify:garde-fantomes rougissait « la porte serait decorative ».
// `process.cwd()` lui ne DERIVE rien : il rend le chemin de LANCE, pas de
// fichier — mesure le 30/10 : `probe-ids-uniques.mjs` lance depuis
// /tmp/opencode/runner-sim (la CI) rendait DATA_DIR et tsxBin ABSENTS et
// exit 9 « SERVEUR PAS PRET (infrastructure) », la ou le MEME probe lance
// depuis the racine rendait GATES_IDS=7 ROUGES=0.
const RACINE = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const DATA_DIR = path.join(RACINE, "test", "tmp-probe-ids-uniques");
const TOKEN = "ids-uniques";

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

const ROUGES = [];
let TOTAL = 0;
function verdict(nom, ok, detail) {
  TOTAL += 1;
  console.log("VERDICT " + nom + " " + (ok ? "OK" : "ROUGE") + " " + detail);
  if (!ok) ROUGES.push(nom);
}

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
const tsxBin = path.join(RACINE, "node_modules", ".bin", "tsx");

// ── U0 : le generateur, en SYNCHRONE (verdict deterministe) ─────────────────
// 20 000 appels dans la MEME boucle : sous l'horloge nue ils tombent dans une
// ou deux millisecondes et rendent des ids IDENTIQUES ; sous la sequence, tous
// sont distincts PAR CONSTRUCTION. Ce verdict ne depend ni du planning reseau
// ni de la vitesse de la machine (contrairement a U1/U2/U6) : il nomme M1 a
// coup sur, y compris sur un runner ou la rafale parallele est trop etalee
// pour collisionner. Mesure du 30/10 sur la CI GitHub : la morsure M1 rougissait
// sans nommer U2 (la porte avait pourtant juge le defaut ailleurs).
const N_APPELS = 20000;
const codeGen =
  "import { nouvelId } from './src/shared/util.ts';" +
  "const s = new Set();" +
  `for (let i = 0; i < ${N_APPELS}; i++) s.add(nouvelId());` +
  "console.log('DISTINCTS=' + s.size);";
const gen = spawnSync(process.execPath, [tsxBin, "-e", codeGen], {
  cwd: RACINE,
  encoding: "utf8",
  timeout: 60000,
});
const sortieGen = (gen.stdout || "") + (gen.stderr || "");
const mGen = /DISTINCTS=(\d+)/.exec(sortieGen);
verdict("U0_generateur_sync", mGen !== null && Number(mGen[1]) === N_APPELS,
  `distincts=${mGen ? mGen[1] : "?"} attendu=${N_APPELS}`);

// detached: tsx CLI lance un FILS node qui porte le serveur. Tuer le CLI seul
// laisserait le fils vivant : c'est exactement le fantome que la porte
// verify:garde-fantomes traque. On tue le GROUPE.
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: RACINE,
  detached: true,
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", COOKDRIVE_RATELIMIT_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
  stdio: "ignore",
});
server.on("error", () => {
  console.log("SERVEUR IMPOSSIBLE a demarrer (tsx absent ?)");
  process.exit(9);
});

const tuer = () => { try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch {} } };

const deadline = Date.now() + 45000;
let pret = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
    if (r.ok) { console.log("INSTANCE ETRANGERE sur le port:", r.headers.get("x-cookdrive-instance")); tuer(); process.exit(9); }
  } catch { /* pas encore */ }
  await new Promise((r2) => setTimeout(r2, 300));
}
if (!pret) { console.log("SERVEUR PAS PRET sur " + BASE + " (infrastructure, pas un verdict)"); tuer(); process.exit(9); }

const poster = async (route, corps) => {
  const r = await fetch(BASE + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  let j = null;
  try { j = await r.json(); } catch { /* corps non JSON */ }
  return { code: r.status, corps: j };
};

const jour = (decal) => {
  const d = new Date(Date.now() + decal * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── U1 : sequentiel ─────────────────────────────────────────────────────────
const idsPlanning = [];
let refusSeq = 0;
let exempleRefus = "";
for (let i = 0; i < 40; i++) {
  const r = await poster("/api/menu-planning", { date: jour(i + 1), meal_type: "LUNCH", title: "Rafale seq " + i });
  if (r.code === 200 && r.corps && r.corps.id) idsPlanning.push(String(r.corps.id));
  else { refusSeq += 1; if (!exempleRefus) exempleRefus = r.code + " " + JSON.stringify(r.corps).slice(0, 90); }
}
verdict("U1_sequentiel", refusSeq === 0, `refus=${refusSeq}` + (exempleRefus ? " exemple=" + exempleRefus : ""));

// ── U2 : en PARALLELE (la fenetre du defaut) ────────────────────────────────
// 200 envois, pas 40 : sous l'horloge nue, 40 requetes peuvent s'etaler sur
// plus d'une milliseconde sur une machine rapide et ne JAMAIS collisionner
// (mesure du 30/10 sur la CI). 200 rend la fenetre quasi certaine.
const idsPar = [];
let refusPar = 0;
const envois = [];
for (let i = 0; i < 200; i++) {
  envois.push(poster("/api/menu-planning", { date: jour(1000 + i), meal_type: "DINNER", title: "Rafale par " + i }).then((r) => {
    if (r.code === 200 && r.corps && r.corps.id) idsPar.push(String(r.corps.id));
    else refusPar += 1;
  }));
}
await Promise.all(envois);
verdict("U2_parallele", refusPar === 0, `refus=${refusPar}`);

// ── U3/U4/U5 : la base, pas les codes HTTP ─────────────────────────────────
const relu = await (await fetch(`${BASE}/api/menu-planning`)).json().catch(() => []);
const lignes = Array.isArray(relu) ? relu : [];
const idsBase = new Set(lignes.map((l) => String(l.id)));
verdict("U3_relu_en_base", lignes.length === 240, `lignes=${lignes.length} attendu=240`);

const tousIds = [...idsPlanning, ...idsPar];
const distincts = new Set(tousIds);
verdict("U4_ids_distincts", distincts.size === 240, `distincts=${distincts.size} attendu=240 (recus=${tousIds.length})`);

const absents = tousIds.filter((id) => !idsBase.has(id));
verdict("U5_parite_reponse_base", absents.length === 0, `absents=${absents.length}` + (absents.length ? " ex=" + absents[0] : ""));

// ── U6 : la rafale a-t-elle VRAIMENT touche la milliseconde partagee ? ──────
// Les ids sont `<horodatage>` ou `<horodatage>-<rang>`. Compter les prefixes
// partages dit si deux ecritures sont tombees dans la meme ms ; sans cela, la
// porte n'aurait pas exerce le defaut et un vert ne prouverait rien.
const prefixes = tousIds.map((id) => id.split("-")[0]);
const parPrefixe = new Map();
for (const p of prefixes) parPrefixe.set(p, (parPrefixe.get(p) || 0) + 1);
const collisionsEvitees = [...parPrefixe.values()].filter((n) => n > 1).length;
verdict("U6_fenetre_exercee", collisionsEvitees > 0,
  `millisecondes partagees=${collisionsEvitees} (sans elles, la porte n'aurait pas juge le defaut)`);

// ── U7 : l'autre route a cle nue ───────────────────────────────────────────
// 100 envois (pas 20) : meme raison que U2 — une fenetre trop etroite peut
// laisser passer M3 sans collision sur une machine rapide.
const envoisSup = [];
const idsSup = [];
let refusSup = 0;
for (let i = 0; i < 100; i++) {
  envoisSup.push(poster("/api/suppliers", { name: "Fournisseur rafale " + i }).then((r) => {
    if (r.code === 200 && r.corps && r.corps.id) idsSup.push(String(r.corps.id));
    else refusSup += 1;
  }));
}
await Promise.all(envoisSup);
const supRelus = await (await fetch(`${BASE}/api/suppliers`)).json().catch(() => []);
const idsSupBase = new Set((Array.isArray(supRelus) ? supRelus : []).map((s) => String(s.id)));
const supAbsents = idsSup.filter((id) => !idsSupBase.has(id));
verdict("U7_fournisseurs", refusSup === 0 && new Set(idsSup).size === 100 && supAbsents.length === 0,
  `refus=${refusSup} distincts=${new Set(idsSup).size} absents_en_base=${supAbsents.length}`);

tuer();
console.log(`GATES_IDS=${TOTAL} ROUGES=${ROUGES.length}`);
if (ROUGES.length) console.log("LISTE_ROUGES " + ROUGES.join("|"));
process.exit(ROUGES.length ? 1 : 0);
