// Porte: la voie d'import en bloc de l'auditeur, jouee sur UN SERVEUR REEL.
//
// POURQUOI CETTE PORTE EXISTE. L'UI (src/components/InventoryAudit.tsx:156)
// poste { items } a /api/inventory/bulk. Cette route n'existait pas: la sonde
// brute rendoit `POST /api/inventory/bulk -> 404` avec `corps: null`, et
// l'UI affichait neanmoins « ingredients importes ». Le chef validait un CSV de
// vingt lignes sans qu'aucune ne soit entree en base. Consigne dans
// docs/audit-2026-09-20.md C3.
//
// POURQUOI UNE PORTE et non une simple sonde. La version precedente de ce
// fichier rendoit rc=0 QUE LA ROUTE REponde ou non: elle disoit « je me suis
// jouee », jamais « le contrat est tenu ». La brancher telle quelle dans le
// lot aurait cree une porte verte qui ne juge rien (la famille du defaut
// `verify:forecast` du Sprint 10). Ici chaque verdict est NOMME et le code de
// sortie est le verdict: 0 = les huit verdicts sont tenus.
//
// LES VERDICTS (chacun est une ligne du contrat, pas une forme de plus):
//   B1 le POST d'un lot valide rend 200
//   B2 le compte-rendu `importes` est le nombre de lignes ENVOYEES, pas un
//      nombre recite depuis le corps de la requete
//   B3 les lignes sont RELUES en base (GET /api/inventory les montre toutes)
//   B4 une ligne fautive refuse le LOT ENTIER, nomme index:champ, et AUCUNE
//      ligne n'entre en base (le compte de la base ne bouge pas)
//   B5 un lot vide est refuse, nomme
//   B6 `items` absent ou non-tableau est refuse, nomme (pas un 500)
//   B7 une clef deja prise dans la BASE est refusee par 409 nomme, et le lot
//      n'est pas ecrit
//   B8 le statut absent est DERIVE des quantites par la regle de l'UI (le
//      badge de l'auditeur), et non une valeur recitee
//
// Lancement: node scripts/probe-inventory-bulk.mjs
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-inventory-bulk");
const TOKEN = "inventory-bulk";

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
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
  stdio: "pipe",
});
server.on("error", () => {
  console.log("SERVEUR IMPOSSIBLE a demarrer (tsx absent ?)");
  process.exit(9);
});

const deadline = Date.now() + 45000;
let pret = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
    if (r.ok) {
      console.log("INSTANCE ETRANGERE sur le port:", r.headers.get("x-cookdrive-instance"));
      process.exit(9);
    }
  } catch { /* pas encore */ }
  await new Promise((r2) => setTimeout(r2, 300));
}
if (!pret) {
  console.log("SERVEUR PAS PRET sur " + BASE + " (infrastructure, pas un verdict)");
  server.kill();
  process.exit(9);
}

const jsonPost = async (url, corps) => {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    let j = null;
    try { j = await r.json(); } catch { /* corps non-json: un verdict le dira */ }
    return { code: r.status, corps: j };
  } catch (e) {
    console.log("REQUETTE IMPOSSIBLE sur " + url + ": " + e);
    process.exit(9);
  }
};
const ligneBase = async () => {
  try {
    const r = await fetch(`${BASE}/api/inventory`);
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
};

const LIGNE_VALIDE = (nom, extra) => ({
  name: nom,
  quantity: 4,
  minStock: 1,
  unit: "kg",
  category: "Sec",
  unit_price: 1.5,
  yield_percent: 100,
  ...extra,
});

// ---------------------------------------------------------------- B1 + B2 + B3
const avant = await ligneBase();
if (avant === null) {
  console.log("GET /api/inventory ne repond pas en liste: la porte ne peut pas juger");
  server.kill();
  process.exit(9);
}
const ENVOY = [LIGNE_VALIDE("Sonde Bulk Un"), LIGNE_VALIDE("Sonde Bulk Deux", { id: "bulk-deux" })];
const r1 = await jsonPost(`${BASE}/api/inventory/bulk`, { items: ENVOY });
verdict("B1_code", r1.code === 200, "attendu=200 obtenu=" + r1.code);
verdict(
  "B2_importes",
  r1.corps?.importes === ENVOY.length,
  "attendu=" + ENVOY.length + " obtenu=" + JSON.stringify(r1.corps?.importes),
);
const apres1 = await ligneBase();
const vus = ENVOY.map((e) => e.name).filter((n) => (apres1 || []).some((x) => x.name === n));
verdict("B3_relecture", apres1 !== null && vus.length === ENVOY.length,
  "relues=" + vus.length + "/" + ENVOY.length + " en_base=" + (apres1 || []).length);

// ---------------------------------------------------------------- B8 le statut derive
const sDeux = (apres1 || []).find((x) => x.name === "Sonde Bulk Deux");
// quantity=4, minStock=1 -> 4 > 1*1.5 -> "ok" par la regle de l'auditeur.
verdict("B8_statut_derive", sDeux?.status === "ok",
  "attendu=ok obtenu=" + JSON.stringify(sDeux?.status) + " (quantity=4 minStock=1)");

// ---------------------------------------------------------------- B4 lot fautive
const compteAvant4 = (await ligneBase())?.length ?? -1;
const r4 = await jsonPost(`${BASE}/api/inventory/bulk`, {
  items: [LIGNE_VALIDE("Sonde Bulk Quatre"), LIGNE_VALIDE("Sonde Bulk Cinq", { quantity: "beaucoup" })],
});
const refus4 = Array.isArray(r4.corps?.refused) ? r4.corps.refused : [];
// ⚠ Le nomame EST une regle, pas une presence: une entree "1:" (ligne nommee,
// champ oublie) prouve que la route refuse bien la ligne mais ne dit plus QUOI
// corriger au chef. L'attendu est l'entree complete "1:quantity".
const compteApres4 = (await ligneBase())?.length ?? -1;
verdict("B4_lot_refuse", r4.code === 400, "attendu=400 obtenu=" + r4.code);
verdict("B4_refuse_nomme", refus4.some((x) => String(x) === "1:quantity"),
  "attendu=1:quantity refused=" + JSON.stringify(refus4));
verdict("B4_rien_ecrit", compteAvant4 === compteApres4 && compteApres4 === avant.length + ENVOY.length,
  "avant=" + compteAvant4 + " apres=" + compteApres4 + " attendu=" + (avant.length + ENVOY.length));

// ---------------------------------------------------------------- B5 + B6
const r5 = await jsonPost(`${BASE}/api/inventory/bulk`, { items: [] });
verdict("B5_lot_vide_refuse", r5.code === 400 && Array.isArray(r5.corps?.refused) && r5.corps.refused.length > 0,
  "code=" + r5.code + " refused=" + JSON.stringify(r5.corps?.refused));
const r6 = await jsonPost(`${BASE}/api/inventory/bulk`, { items: "pas un tableau" });
verdict("B6_non_tableau_refuse", r6.code === 400 && Array.isArray(r6.corps?.refused) && r6.corps.refused.length > 0,
  "code=" + r6.code + " refused=" + JSON.stringify(r6.corps?.refused));
const r6b = await jsonPost(`${BASE}/api/inventory/bulk`, {});
verdict("B6_b_absent_refuse", r6b.code === 400 && r6b.code !== 500, "code=" + r6b.code);

// ---------------------------------------------------------------- B7 clef deja prise
const r7 = await jsonPost(`${BASE}/api/inventory/bulk`, {
  items: [LIGNE_VALIDE("Sonde Bulk Sept", { id: "bulk-deux" })],
});
const compteApres7 = (await ligneBase())?.length ?? -1;
verdict("B7_clef_prise_409", r7.code === 409, "attendu=409 obtenu=" + r7.code);
verdict("B7_rien_ecrit", compteApres7 === compteApres4, "avant=" + compteApres4 + " apres=" + compteApres7);

server.kill();
console.log("GATES_BULK=" + TOTAL + " ROUGES=" + ROUGES.length + (ROUGES.length ? " LISTE " + ROUGES.join("|") : ""));
process.exit(ROUGES.length ? 1 : 0);
