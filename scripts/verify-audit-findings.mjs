// Porte verify:audit-findings — juge les LIVRABLES de l'audit statique Cloudflare
// (run clausio-cf-quick-1, commit 7e66d4e) par les validateurs ZERO-DEPENDANCE du
// skill (copies dans scripts/audit-cf/). La porte ne juge PAS la justesse securite
// des candidats (c'est le travail du pentest dynamique) : elle garantit que le
// registre de couverture et le registre de candidats restent VALIDES et TRIES —
// toute edition a la main qui casse le schema, un tri, ou un fingerprint fait
// rougir la porte.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dossier = path.join(racine, "docs", "audit-cloudflare-2026-11-06");
const validateurs = [
  { nom: "ledger", script: "validate-coverage-ledger.cjs", cible: "coverage-ledger.json" },
  { nom: "findings", script: "validate-findings.cjs", cible: "findings.json" },
];
let rouge = false;
for (const v of validateurs) {
  const script = path.join(racine, "scripts", "audit-cf", v.script);
  const cible = path.join(dossier, v.cible);
  const r = spawnSync(process.execPath, [script, cible], { encoding: "utf8" });
  const sortie = (r.stdout || "") + (r.stderr || "");
  const pass = /PASS/.test(sortie) && r.status === 0;
  console.log(`[audit-findings] ${v.nom}: ${pass ? "PASS" : "ROUGE"} — ${sortie.trim().split("\n").pop()}`);
  if (!pass) rouge = true;
}
if (rouge) {
  console.error("verify:audit-findings ROUGE : livrables d'audit invalides (schema, tri ou fingerprint casse)");
  process.exit(1);
}
console.log("verify:audit-findings VERT : ledger 13 unites + 6 candidats valides");
