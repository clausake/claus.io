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
//   U1 40 ecritures sequentielles sur la planification : aucune refusee
//   U2 40 ecritures en PARALLELE : aucune refusee (la fenetre du defaut)
//   U3 les 80 lignes sont RELUES en base (pas seulement « 200 »)
//   U4 les 80 ids sont DISTINCTS
//   U5 chaque id rendu par une reponse se retrouve en base (parite)
//   U6 la rafale a bien touche la milliseconde partagee (sinon la porte n'a pas
//      exerce le defaut : terrain insuffisant, PAS un vert)
//   U7 meme contrat sur les fournisseurs (l'autre route a cle nue)
//
// Lancement: node scripts/probe-ids-uniques.mjs
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-ids-uniques");
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
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
// detached: tsx CLI lance un FILS node qui porte le serveur. Tuer le CLI seul
// laisserait le fils vivant : c'est exactement le fantome que la porte
// verify:garde-fantomes traque. On tue le GROUPE.
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
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
const idsPar = [];
let refusPar = 0;
const envois = [];
for (let i = 0; i < 40; i++) {
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
verdict("U3_relu_en_base", lignes.length === 80, `lignes=${lignes.length} attendu=80`);

const tousIds = [...idsPlanning, ...idsPar];
const distincts = new Set(tousIds);
verdict("U4_ids_distincts", distincts.size === 80, `distincts=${distincts.size} attendu=80 (recus=${tousIds.length})`);

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
const envoisSup = [];
const idsSup = [];
let refusSup = 0;
for (let i = 0; i < 20; i++) {
  envoisSup.push(poster("/api/suppliers", { name: "Fournisseur rafale " + i }).then((r) => {
    if (r.code === 200 && r.corps && r.corps.id) idsSup.push(String(r.corps.id));
    else refusSup += 1;
  }));
}
await Promise.all(envoisSup);
const supRelus = await (await fetch(`${BASE}/api/suppliers`)).json().catch(() => []);
const idsSupBase = new Set((Array.isArray(supRelus) ? supRelus : []).map((s) => String(s.id)));
const supAbsents = idsSup.filter((id) => !idsSupBase.has(id));
verdict("U7_fournisseurs", refusSup === 0 && new Set(idsSup).size === 20 && supAbsents.length === 0,
  `refus=${refusSup} distincts=${new Set(idsSup).size} absents_en_base=${supAbsents.length}`);

tuer();
console.log(`GATES_IDS=${TOTAL} ROUGES=${ROUGES.length}`);
if (ROUGES.length) console.log("LISTE_ROUGES " + ROUGES.join("|"));
process.exit(ROUGES.length ? 1 : 0);
