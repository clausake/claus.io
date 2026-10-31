// Porte de SECURITE : la barriere npm-audit. Elle rougit si une dependance a une
// vulnerabilite CRITICAL.
//
// Pourquoi cette porte existe : le 31/10 le constat T1.3 (fait 7) mesure que la
// CI GitHub n'a AUCUN job de securite (grep "npm audit" .github/workflows/ci.yml
// = 0) alors que la doctrine du depot (AGENTS.md §7) decrit un « seuil CRITICAL ».
// Sans garde automatise, une critique introduite demain passe en silence.
//
// Determinisme (la morsure, verify:audit-barriere-mord, doit rougir SANS réseau) :
//   - par defaut, la porte lit le rapport que npm audit ecrit lui-meme dans le
//     depot (--audit-report, artefact de CI) ; si absent, elle lance `npm audit
//     --json` (seule voie reseau, et uniquement ici, pas dans la morsure) ;
//   - avec --rapport <chemin>, elle LIT un fichier JSON au format `npm audit
//     --json` et ne touche JAMAIS le réseau. C'est ce mode que la morsure exerce
//     avec une critique factice.
//
// Seuils : CRITICAL = bloquant (rc=1). HIGH/MODERATE = consignees mais non
// bloquantes (rc=0) : le depot porte des high dev-only/non-montables consignees
// (docs/audit-2026-10-02.md §5) ; un rouge high permanent n'est plus un signal
// (doctrine CI §8 « Barriere npm-audit au seuil CRITICAL »).
//
// Lancement : node scripts/verify-audit-barriere.mjs [--rapport <chemin>]

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function lireRapport() {
  const chemin = parseArg("--rapport");
  if (chemin) {
    if (!existsSync(chemin)) {
      return { erreur: `RAPPORT_ABSENT ${chemin} (la morsure doit passer un fichier JSON existant)` };
    }
    try {
      return { json: JSON.parse(readFileSync(chemin, "utf8")), source: chemin };
    } catch (e) {
      return { erreur: `RAPPORT_ILLEGAL ${chemin} : ${e.message}` };
    }
  }
  // Voie reseau : le rapport reel du depot.
  const r = spawnSync("npm", ["audit", "--json"], { cwd: BASE, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  // npm audit rend rc!=0 quand il y a des vulnérabilités ; ce n'est PAS une erreur
  // de la porte : on juge le JSON, pas le rc.
  try {
    return { json: JSON.parse(r.stdout), source: "npm audit --json" };
  } catch (e) {
    return { erreur: `SORTIE_NPM_AUDIT_ILLEGAL : ${e.message} (stdout=${(r.stdout || "").slice(0, 120)})` };
  }
}

function main() {
  const { json, source, erreur } = lireRapport();
  if (erreur) {
    console.log("ECHEC " + erreur);
    return 2;
  }
  const meta = json?.metadata?.vulnerabilities || {};
  const critiques = [];
  for (const [paquet, v] of Object.entries(json?.vulnerabilities || {})) {
    if (v && v.severity === "critical") {
      critiques.push(`${paquet}@? via ${(v.via || []).map((x) => (typeof x === "string" ? x : x.title)).join(";").slice(0, 60)}`);
    }
  }
  console.log(`npm-audit (${source}) : critical=${meta.critical ?? "?"} high=${meta.high ?? "?"} moderate=${meta.moderate ?? "?"}`);
  if (critiques.length > 0) {
    console.log(`ECHEC (b) barriere CRITICAL — ${critiques.length} dependance(s) critique(s) :`);
    for (const c of critiques) console.log("   ", c);
    console.log("Monter la dependance ou poser un override corrige (cf. AGENTS.md §7).");
    return 1;
  }
  // Coherence metadata vs liste : un rapport qui annonce des critiques sans les
  // nommer est un rapport truque — la porte refuse de le croire.
  if ((meta.critical ?? 0) > 0) {
    console.log("ECHEC (b) metadata annonce critical>0 mais AUCUNE dependance critique nommee (rapport incoherent).");
    return 1;
  }
  console.log("OK — aucune dependance critique (barriere CRITICAL respectee).");
  return 0;
}

process.exit(main());
