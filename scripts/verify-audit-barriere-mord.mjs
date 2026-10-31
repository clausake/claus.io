// Morsure de la barriere npm-audit (verify:audit-barriere) : elle prouve que la
// barriere PEUT rougir, SANS dependre du réseau.
//
// Pourquoi : une barriere qui ne peut pas rougir n'est pas une mesure. Le 31/10
// (T1.3) la CI n'a aucun job de securite ; poser `npm audit --audit-level=critical`
// sans prouver qu'il rougit sur une critique, c'est repeter l'erreur du garde-fou
// inline (AGENTS.md §2 « une sortie vide n'est pas une reponse »).
//
// Preuve TRIPLE, aucune ne touche le réseau (sauf M3 qui est le chemin reel) :
//   M1 ROUGE FACTICE : un rapport `npm audit --json` avec UNE critique factice
//      passe par --rapport -> la porte DOIT rendre rc!=0 (ECHEC (b)).
//   M2 VERT REALISTE : le MEMME rapport SANS la critique factice -> rc=0.
//      (M1+M2 prouvent que c'est BIEN la critique qui rougit, pas le script.)
//   M3 CHEMIN REEL : la porte appelee sans --rapport (elle lance npm audit lui-
//      meme) rend rc=0 sur le depot actuel (critical=0, mesure docs/audit §5).
//
// Lancement : node scripts/verify-audit-barriere-mord.mjs

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTE = join(BASE, "scripts", "verify-audit-barriere.mjs");

function rapport(factice) {
  // Fragment au format `npm audit --json`. metadata.vulnerabilities DOIT etre
  // coherent avec la liste des dependances, sinon la porte (garde d'incoherence)
  // rougit pour la raison « metadata annonce ... sans les nommer » — ce qui
  // prouverait quand meme que la porte lit, mais fausserait le libelle.
  const vulns = { express: { severity: "moderate", isDirect: true, via: ["provable"] } };
  let critical = 0;
  if (factice) {
    vulns["factice-critique"] = { severity: "critical", isDirect: false, via: ["execution arbitraire (factice)"] };
    critical = 1;
  }
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: vulns,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical, total: 1 + critical } },
  });
}

function lancer(args) {
  return spawnSync("node", [PORTE, ...args], { cwd: BASE, encoding: "utf8" });
}

let ecarts = 0;
const dir = mkdtempSync(join(tmpdir(), "audit-mord-"));
try {
  // M1 : critique factice -> la porte DOIT rougir.
  const rouge = join(dir, "avec-critique.json");
  writeFileSync(rouge, rapport(true));
  const r1 = lancer(["--rapport", rouge]);
  if (r1.status === 0) { console.log("M1 ECHEC — une critique factice ne rougit PAS la barriere (barriere muette)."); ecarts++; }
  else { console.log(`M1 OK — critique factice rougit la barriere (rc=${r1.status}).`); }

  // M2 : meme rapport sans critique -> vert.
  const vert = join(dir, "sans-critique.json");
  writeFileSync(vert, rapport(false));
  const r2 = lancer(["--rapport", vert]);
  if (r2.status !== 0) { console.log(`M2 ECHEC — un rapport sans critique rougit (rc=${r2.status}) : la porte rougit pour autre chose que la critique.`); ecarts++; }
  else { console.log("M2 OK — rapport sans critique = vert (la barriere ne rougit QUE sur le critique)."); }

  // M3 : chemin reel (npm audit dans le depot actuel, critical=0).
  const r3 = lancer([]);
  if (r3.status !== 0) { console.log(`M3 ECHEC — le depot reel rougit la barriere (rc=${r3.status}) : critique introduite OU npm audit indisponible.`); ecarts++; }
  else { console.log("M3 OK — depot reel vert sous la barriere (critical=0)."); }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (ecarts > 0) { console.log(`MORSURE: ${ecarts} ECHEC(S)`); process.exit(1); }
console.log("MORSURE: TOUT PASS");
process.exit(0);
