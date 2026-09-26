// Le juge de la route du juge LLM (Sprint 15, Tache 9).
//
// Pourquoi ce fichier et pas un test unitaire de plus : `reglage-llm.test.ts`
// juge les FONCTIONS PURES avec des chaines ecrites d'avance. Il ne prouve
// pas que LA ROUTE les joue. Ce juge lance le VRAI serveur (spawn tsx, la
// voie mesuree de scripts/probe-ready-parity.mjs), regle les reglages LLM par
// la vraie API, et joue /api/llm/tester pour de vrai. Un harnais qui ne joue
// que ses propres chaines est vert quoi qu'il arrive.
//
// Les verdicts sont ecrits d'avance, y compris LA MORSURE : /api/llm/tester
// doit rendre vivant:false sur ?test=muet (une sonde muette n'est pas verte).
// Et l'anti-mensonge : un fournisseur HORS LISTE doit rendre un defaut nomme,
// jamais une generation vers l'inconnu.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-reglage-llm");

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

const portLibre = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});

const TOKEN = "reglage-llm-" + process.pid;

async function lancerServeur(port) {
  const data = join(OUT, "udata");
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, USER_DATA_PATH: data, NODE_ENV: "production",
           PORT: String(port), COOKDRIVE_INSTANCE_TOKEN: TOKEN },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = { buf: "" };
  child.stdout.on("data", (d) => (log.buf += d.toString()));
  child.stderr.on("data", (d) => (log.buf += d.toString()));
  // ATTENTE ACTIVE : le serveur est la quand /health repond 200 ET rend le
  // MEME jeton d'instance que celui qu'on a fourni — pas un somme a l'aveugle,
  // et pas n'importe quelle instance heritee du port.
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 45_000) throw new Error("serveur pas pret:\n" + log.buf);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.status === 200 && r.headers.get("x-cookdrive-instance") === TOKEN) return child;
    } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const port = await portLibre();
const BASE = `http://127.0.0.1:${port}`;
const child = await lancerServeur(port);
const arreter = () => new Promise((r) => { child.once("close", r); child.kill("SIGTERM"); });

try {
  // 1. /api/llm/detecter rend une forme LICITE et nommee. Sur ce poste, la
  //    mesure de la tache 8 (outil-etat-moteur) trouve ollama@11434 ; mais la
  //    route peut aussi ne rien trouver selon l'etat du poste — dans les DEUX
  //    cas le contrat tient : serveurs[] + message (null ou AUCUN_MOTEUR_TROUVE),
  //    JAMAIS un muet.
  const d = await (await fetch(`${BASE}/api/llm/detecter`)).json();
  check("detecter: la forme est {serveurs[], message}",
    Array.isArray(d.serveurs) && (d.message === null || d.message === "AUCUN_MOTEUR_TROUVE"),
    JSON.stringify(d).slice(0, 120));

  // 2. Pas de reglage LLM -> le verdict est un defaut NOMME (CHOIX_ABSENT),
  //    jamais `vivant:true` par defaut, jamais une exception.
  const v0 = await (await fetch(`${BASE}/api/llm/tester`)).json();
  check("tester sans reglage: vivant=false + defaut nomme",
    v0.vivant === false && typeof v0.defaut === "string" && v0.defaut !== "",
    JSON.stringify(v0).slice(0, 140));

  // 3. LA MORSURE : un reglage dont la cible EST constructionsible (ollama
  //    @11434, vivant sur ce poste — mesure 15.c) mais la sortie forcee muette
  //    doit rendre vivant:false. Si la route rendait vivant:true sur une sortie
  //    vide, c'est un capteur mort : FAUTE, pas un succes.
  const regle = await (await fetch(`${BASE}/api/settings`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ llm_choix: "ollama" }),
  })).json();
  check("regler llm_choix=ollama est accepte", regle.status === "success",
    JSON.stringify(regle).slice(0, 80));
  const vMuet = await (await fetch(`${BASE}/api/llm/tester?test=muet`)).json();
  check("MORSURE muet: vivant=false malgre la cible", vMuet.vivant === false,
    JSON.stringify(vMuet).slice(0, 140));

  // 4. La voie nominale sur ce poste : ollama@11434 EST vivant (mesure 15.c),
  //    donc le verdict nominal est VERT avec un modele (ou MODELES_ABSENTS —
  //    les deux sont des verdicts NOMMES, le muet ne I'est jamais).
  const vNom = await (await fetch(`${BASE}/api/llm/tester`)).json();
  check("tester nominal: un verdict nomme (vivant ou defaut)",
    vNom.vivant === true || (vNom.vivant === false && typeof vNom.defaut === "string"),
    JSON.stringify(vNom).slice(0, 160));

  // 5. HORS LISTE : le reglage est stocke tel quel (le POST ne juge pas —
  //    c'est la cible qui rougit), et /tester nomme HORS_LISTE_BLANCHE.
  const hors = await (await fetch(`${BASE}/api/settings`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ llm_choix: "groq" }),
  })).json();
  check("POST hors-liste: accepte au stockage (la cible rougira, pas la saisie)",
    hors.status === "success");
  const vHors = await (await fetch(`${BASE}/api/llm/tester`)).json();
  check("tester hors-liste: defaut HORS_LISTE_BLANCHE (aucun appel hors liste)",
    vHors.vivant === false && vHors.defaut === "HORS_LISTE_BLANCHE",
    JSON.stringify(vHors).slice(0, 140));

  // 6. La clef NE PASSE JAMAIS par le corps : un champ clef_api doit disparaitre.
  await fetch(`${BASE}/api/settings`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ llm_choix: "ollama", clef_api: "sk-secret-injecte" }),
  });
  const relu = await (await fetch(`${BASE}/api/settings`)).json();
  check("anti-fuite: clef_api n'est pas ecrite dans les reglages",
    relu.clef_api === undefined && relu.llm_choix === "ollama",
    "clef_api=" + JSON.stringify(relu.clef_api));
} finally {
  await arreter();
}

console.log(fail === 0 ? "\nJUGE REGLAGE LLM: tout vert"
                       : `\nJUGE REGLAGE LLM: ${fail} FAUTE(S)`);
process.exit(fail === 0 ? 0 : 1);
