// Porte des agents GH-600 : outils MCP + orchestration + evaluations.
// Tout tourne EN PROCESSUS, avec un stockage isole (test/tmp-agents/<pid>) et
// le cerveau FACTICE : aucun LLM, aucun reseau, aucune cle. La porte juge des
// SORTIES, pas des intentions, et rougit sur la premiere faute.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const OUT = path.join(process.cwd(), "test", "tmp-agents", String(process.pid));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
process.env.USER_DATA_PATH = OUT;
process.env.COOKDRIVE_AGENT_OFF = "0";
delete process.env.COOKDRIVE_MCP_OUTILS;
delete process.env.COOKDRIVE_HERMES_FACTICE;

const { initDatabase } = await import("../src/db/init.js");
const { allowList, appelerOutil } = await import("../src/services/outils/index.js");
const { orchestrer, reprendre, lireRun } = await import("../src/services/orchestration/index.js");
const { evaluerTous } = await import("../src/services/evals/index.js");
const { cerveauFactice } = await import("../src/services/hermes.js");

let fautes = 0;
function verifier(label: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!condition) fautes++;
}

const { db } = await initDatabase();
await db.run(
  "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["agent-porte-1", "Farine", 2, 10, "kg", "disponible", "matiere"],
);

// 1. Evaluations : les cas d'ores sontvert au vert, score parfait.
const evals = evaluerTous();
verifier("evals: 5 cas dorés au vert", evals.total === 5 && evals.reussis === 5,
  `reussis=${evals.reussis}/${evals.total} score=${evals.score_moyen.toFixed(2)}`);

// 2. Allow-list : match exact, sans prefixe permissif.
const autorises = allowList();
verifier("allow-list: 5 outils par defaut", autorises.size === 5, [...autorises].join(","));
process.env.COOKDRIVE_MCP_OUTILS = "etat_inventaire";
verifier("allow-list: restriction explicite", allowList().size === 1 && allowList().has("etat_inventaire"));
const refuse = await appelerOutil(db, "proposer_action", { titre: "x" }, allowList());
verifier("outil non autorisé refuse NOMMENT", refuse.ok === false && refuse.erreur === "OUTIL_NON_AUTORISE", String(refuse.erreur));
delete process.env.COOKDRIVE_MCP_OUTILS;

const inconnu = await appelerOutil(db, "supprimer_inventory", {});
verifier("outil inconnu refuse NOMMENT", inconnu.ok === false && inconnu.erreur === "OUTIL_INCONNU", String(inconnu.erreur));

const lecture = await appelerOutil(db, "etat_inventaire", { limite: 3 });
verifier("outil lecture: inventaire rendu", lecture.ok === true && Array.isArray(lecture.donnees),
  `lignes=${Array.isArray(lecture.donnees) ? lecture.donnees.length : "n/a"}`);

// 3. La SEULE ecriture est la boite : le metier ne bouge pas.
const inventaireAvant = (await db.get("SELECT COUNT(*) AS n FROM inventory") as { n: number }).n;
const proposition = await appelerOutil(db, "proposer_action", {
  type: "achat", priorite: "haute", titre: "Porte: proposition directe",
  explication: "controle de la voie d'ecriture", action_route: "/api/purchasing/order",
  action_payload: { items: [] },
});
const inventaireApres = (await db.get("SELECT COUNT(*) AS n FROM inventory") as { n: number }).n;
verifier("proposition déposée dans suggestions", proposition.ok === true && Boolean((proposition.donnees as { id?: string })?.id));
verifier("AUCUNE écriture métier par un outil", inventaireAvant === inventaireApres,
  `${inventaireAvant} -> ${inventaireApres}`);
const routeFausse = await appelerOutil(db, "proposer_action", {
  type: "general", titre: "escalade", action_route: "/api/admin/users",
});
verifier("route inventée refusée à la création", routeFausse.ok === false && routeFausse.erreur === "ROUTE_INCONNUE", String(routeFausse.erreur));

// 4. Orchestration 3 roles, artifacts durables, reprise sans rejouer.
const avantRun = (await db.get("SELECT COUNT(*) AS n FROM suggestions") as { n: number }).n;
const run = await orchestrer(db, cerveauFactice());
verifier("run terminé (3 roles)", run.statut === "termine" && run.etapes.length === 3,
  `statut=${run.statut} etapes=${run.etapes.length}`);
verifier("propositions déposées par le verificateur", run.propositions.length >= 1,
  `propositions=${run.propositions.length}`);
const handoffs = await db.all("SELECT COUNT(*) AS n FROM agent_handoffs WHERE run_id = ?", [run.run_id]) as { n: number }[];
verifier("handoffs inspectables en SQLite", handoffs[0]?.n === 3, `handoffs=${handoffs[0]?.n}`);
const relu = await lireRun(db, run.run_id);
verifier("run relu depuis ses artifacts", relu?.statut === "termine" && (relu?.propositions.length ?? 0) >= 1);
const apresRun = (await db.get("SELECT COUNT(*) AS n FROM suggestions") as { n: number }).n;
const reprise = await reprendre(db, run.run_id, cerveauFactice());
const apresReprise = (await db.get("SELECT COUNT(*) AS n FROM suggestions") as { n: number }).n;
verifier("reprise: aucune réécriture", reprise?.statut === "termine" && apresReprise === apresRun,
  `${avantRun} -> ${apresRun} -> ${apresReprise}`);

// 5. Conflits : deux propositions NON conformes pour la meme route sont
//    nommees, et une seule est deposee.
const conflictuel = await orchestrer(db, async () => JSON.stringify({ suggestions: [
  { type: "achat", titre: "Conflit A", explication: "a", action_route: "/api/suppliers", action_payload: { a: 1 } },
  { type: "achat", titre: "Conflit B", explication: "b", action_route: "/api/suppliers", action_payload: { b: 2 } },
] }));
verifier("contradiction détectée et nommée",
  conflictuel.conflits.some((c) => c.startsWith("contradiction:")),
  conflictuel.conflits.join(","));
verifier("une seule proposition retenue sur conflit", conflictuel.propositions.length === 1,
  `retenues=${conflictuel.propositions.length}`);

// 6. Mode sans agent : la voie de proposition disparait.
process.env.COOKDRIVE_AGENT_OFF = "1";
verifier("AGENT_OFF retire proposer_action", !allowList().has("proposer_action"));
const sansAgent = await appelerOutil(db, "proposer_action", { titre: "x", action_route: "/api/suppliers" });
verifier("AGENT_OFF: proposition refusée", sansAgent.ok === false && sansAgent.erreur === "OUTIL_NON_AUTORISE");
process.env.COOKDRIVE_AGENT_OFF = "0";

// 7. Transport MCP stdio : le vrai binaire parle au MEME registre.
const stdio = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
  const enfant = spawn("npx", ["tsx", "mcp-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, USER_DATA_PATH: OUT, COOKDRIVE_AGENT_OFF: "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let sortie = "";
  const timer = setTimeout(() => { enfant.kill(); resolve({ ok: false, detail: "timeout" }); }, 30000);
  enfant.stdout.on("data", (b: Buffer) => {
    sortie += b.toString();
    if (sortie.includes('"id":2')) {
      clearTimeout(timer);
      enfant.kill();
      try {
        const lignes = sortie.split("\n").filter(Boolean).map((l) => JSON.parse(l));
        const init = lignes.find((l) => l.id === 1);
        const liste = lignes.find((l) => l.id === 2);
        resolve({
          ok: init?.result?.serverInfo?.name === "clausio-local" &&
              Array.isArray(liste?.result?.tools) && liste.result.tools.length >= 5,
          detail: `outils=${liste?.result?.tools?.length ?? "n/a"}`,
        });
      } catch (e) {
        resolve({ ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }
  });
  enfant.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  enfant.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
});
verifier("serveur MCP stdio: initialize + tools/list", stdio.ok, stdio.detail);

await db.close();
console.log(`\nVERDICT verify:agents — ${fautes === 0 ? "VERT" : `ROUGE (${fautes} faute(s))`}`);
process.exit(fautes === 0 ? 0 : 1);
