// Mordant de la porte agents : on injecte des DEFAUTS et on exige que la
// porte rougisse. Un mordant qui reste vert ne prouve rien — c'est un faux
// vert, exactement ce que AGENTS.md (depot) interdit de consigner.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const OUT = path.join(process.cwd(), "test", "tmp-agents-mord", String(process.pid));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
process.env.USER_DATA_PATH = OUT;
process.env.COOKDRIVE_AGENT_OFF = "0";
delete process.env.COOKDRIVE_MCP_OUTILS;

const { initDatabase } = await import("../src/db/init.js");
const { evaluerTous, CAS_DORES } = await import("../src/services/evals/index.js");
const { orchestrer } = await import("../src/services/orchestration/index.js");
const { appelerOutil } = await import("../src/services/outils/index.js");

let fautes = 0;
function exigeRouge(label: string, conditionRouge: boolean, detail = ""): void {
  console.log(`${conditionRouge ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!conditionRouge) fautes++;
}

const { db } = await initDatabase();

// 1. Un attendu CORROMPU doit faire tomber le harnais d'evals.
const corrompus = CAS_DORES.map((cas, i) => i === 0
  ? { ...cas, attendu: { ...cas.attendu, routes: ["/api/admin/users"] } }
  : cas);
const evalCorrompue = evaluerTous(corrompus);
exigeRouge("evals: attendu corrompu = ROUGE",
  evalCorrompue.reussis < evalCorrompue.total && evalCorrompue.score_moyen < 1,
  `reussis=${evalCorrompue.reussis}/${evalCorrompue.total}`);

// 2. Un cerveau qui invente une route doit etre REFUSE, pas depose.
const avant = (await db.get("SELECT COUNT(*) AS n FROM suggestions") as { n: number }).n;
const run = await orchestrer(db, async () => JSON.stringify({ suggestions: [
  { type: "general", titre: "Escalade mordant", explication: "hors liste",
    action_route: "/api/admin/users", action_payload: null },
] }));
const apres = (await db.get("SELECT COUNT(*) AS n FROM suggestions") as { n: number }).n;
// parseSuggestions refuse la route AVANT le verificateur : le refus est dans
// `refusees` (et non dans `conflits`). C'est le bon comportement — l'essentiel
// est qu'aucune suggestion n'ait ete deposee.
exigeRouge("orchestration: route inventée = refus NOMME",
  run.refusees.some((r) => r.includes("route_inconnue")) && apres === avant,
  `refusees=${run.refusees.join(",")} suggestions=${avant}->${apres}`);

// 3. Un outil hors registre reste refuse meme avec une allow-list vide.
const horsRegistre = await appelerOutil(db, "ecrire_inventory", {}, new Set());
exigeRouge("registre: outil hors liste = refus", horsRegistre.ok === false && horsRegistre.erreur === "OUTIL_INCONNU");

// 4. Une proposition avec payload TABLEAU doit etre refusee (pas un objet).
const payloadTrap = await appelerOutil(db, "proposer_action", {
  type: "stock", titre: "payload piège", action_route: "/api/inventory", action_payload: [1, 2],
});
exigeRouge("validation: payload non-objet = refus", payloadTrap.ok === false && payloadTrap.erreur === "PAYLOAD_INVALIDE");

await db.close();
console.log(`\nVERDICT verify:agents-mord — ${fautes === 0 ? "VERT (mordant prouvé)" : `ROUGE (${fautes} faute(s))`}`);
process.exit(fautes === 0 ? 0 : 1);
