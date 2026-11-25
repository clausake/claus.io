// Porte HTTP des agents GH-600 : le VRAI serveur est Lance, sur un port libre
// et un stockage isole, et les routes /api/mcp/* + /api/orchestration/* sont
// appelees pour de vrai. Le cerveau factice rend la boucle deterministe.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { cheminTsx } = require("./harnais-serveur.cjs") as { cheminTsx: (r: string) => string };

const OUT = path.join(process.cwd(), "test", "tmp-agents-http", String(process.pid));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const portLibre = () => new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => resolve(p));
  });
});

const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
const JETON = "agents-http-" + process.pid;
const serveur = spawn(process.execPath, [cheminTsx(process.cwd()), "server.ts"], {
  cwd: process.cwd(),
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    USER_DATA_PATH: OUT,
    COOKDRIVE_INSTANCE_TOKEN: JETON,
    COOKDRIVE_AUTH_OFF: "1",
    COOKDRIVE_HERMES_FACTICE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let journal = "";
serveur.stdout?.on("data", (b: Buffer) => { journal += b.toString(); });
serveur.stderr?.on("data", (b: Buffer) => { journal += b.toString(); });

function arreter(): void {
  try {
    if (process.platform === "win32") serveur.kill();
    else if (serveur.pid) process.kill(-serveur.pid, "SIGTERM");
  } catch { /* deja arrete */ }
}
process.on("exit", arreter);

let prete = false;
for (let i = 0; i < 100 && !prete; i++) {
  await new Promise((r) => setTimeout(r, 100));
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    prete = r.ok;
  } catch { /* pas encore ouvert */ }
}

let fautes = 0;
function verifier(label: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!condition) fautes++;
}
async function appeler(chemin: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(15000),
  });
  const texte = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(texte) as Record<string, unknown>; } catch { /* texte brut */ }
  return { statut: r.status, json, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}

if (!prete) {
  console.log("FAUTE  serveur non pret\n" + journal.slice(-2000));
  arreter();
  process.exit(1);
}

// Lecture libre : les deux catalogues sont montes et repondent.
const outils = await appeler("/api/mcp/outils");
verifier("GET /api/mcp/outils = 200", outils.statut === 200 && Array.isArray(outils.json.outils),
  `outils=${Array.isArray(outils.json.outils) ? (outils.json.outils as unknown[]).length : "n/a"}`);
const serveurs = await appeler("/api/mcp/serveurs");
verifier("GET /api/mcp/serveurs = 200", serveurs.statut === 200);

// Ecriture sans identite : refus NOMME (pas un 200 muet).
const anonyme = await appeler("/api/mcp/appel", { outil: "etat_inventaire", arguments: {} });
verifier("POST sans session = 401", anonyme.statut === 401, String(anonyme.json.error));

// Session maitre reelle (setup pose le cookie httpOnly).
const setup = await appeler("/api/auth/setup", { username: "maitre-agents", password: "passe-agents-2026" });
const cookie = setup.cookie;
verifier("setup maitre", [200, 201].includes(setup.statut) && Boolean(cookie), `statut=${setup.statut}`);

const appel = await appeler("/api/mcp/appel", { outil: "etat_inventaire", arguments: { limite: 5 } }, cookie);
verifier("POST /api/mcp/appel (maitre) = 200", appel.statut === 200 && appel.json.ok === true);
const inconnu = await appeler("/api/mcp/appel", { outil: "supprimer_inventory", arguments: {} }, cookie);
verifier("outil inconnu par HTTP = 400", inconnu.statut === 400 && inconnu.json.erreur === "OUTIL_INCONNU");

// Orchestration : run -> lecture des artifacts -> reprise sans rejouer.
const run = await appeler("/api/orchestration/run", { cerveau: "factice" }, cookie);
verifier("POST /api/orchestration/run = 201", run.statut === 201 && run.json.statut === "termine",
  `statut=${run.statut}`);
const runId = String(run.json.run_id ?? "");
const liste = await appeler("/api/orchestration/runs");
verifier("GET /api/orchestration/runs = 200", liste.statut === 200 && Array.isArray(liste.json.runs));
const detail = await appeler(`/api/orchestration/runs/${runId}`);
verifier("GET run/:id rend les etapes", detail.statut === 200 &&
  Array.isArray((detail.json.run as { etapes?: unknown[] } | undefined)?.etapes));
const reprise = await appeler("/api/orchestration/reprendre", { run_id: runId }, cookie);
verifier("POST reprise = 201 sans reexecuter", reprise.statut === 201 && reprise.json.statut === "termine");

arreter();
console.log(`\nVERDICT verify:agents-http — ${fautes === 0 ? "VERT" : `ROUGE (${fautes} faute(s))`}`);
process.exit(fautes === 0 ? 0 : 1);
