// Chantier B (document 1.0.6, 11/11) — UNE IMAGE CORROMPUE NE DOIT PAS
// DESCENDRE LE SERVEUR, et la route doit nommer la raison du refus.
//
// Le defaut mesure : un PNG au CRC d'IHDR faux envoye sur une route d'upload
// faisait partir le worker tesseract en uncaughtException depuis un
// process.nextTick — le processus Node entier mourait (mesure : rc 77). Un
// chef qui poste la mauvaise photo perdait donc TOUTE l'application, pas
// seulement son envoi. Les trois voies d'entree image sont jouees ici, au
// MEME geste (multipart, `upload.single("file")`) :
//   POST /api/analyze-menu           (menu.ts:37)
//   POST /api/documents/upload       (documents.ts:496)
//   POST /api/recipes/scan           (recipes.ts:401)
//
// Ce qui est juge ici, et rien d'autre :
//   1. les trois routes REFUSENT l'entree corrompue — jamais un 200 qui
//      ferait croire a une extraction reussie ;
//   2. LE PROCESSUS SURVIT aux trois envois (le defaut du document : c'est le
//      point qui rend ce spec rouge quand le garde ocr-image.ts disparait) ;
//   3. la raison remontee est NOMMEE (contrat C38-bis, llm.ts:93 : « le
//      message du serveur est le seul qui explique POURQUOI ») — un 500 mu
//      laisserait le chef sans explication et le defaut reviendrait incognito ;
//   4. le service est INTACT apres les attaques (sante + une route metier).
//
// Ce que le test NE pretend PAS : il n'exige pas qu'une entree invalide
// devienne un 400. Une image refusee par le garde remonte en LlmInjoignable,
// que les routes rendent en 500 AVEC la raison (menu.ts:187, documents.ts:611).
//
//  CE QUE CE SPEC NE PEUT PAS ATTEINDRE (consigne du 11/11, a ne pas perdre) :
//  la voie exacte du crash est le repli Tesseract de llm.ts:224, et il n'est
//  declenche que si le SDK ollama LEVE une erreur portant « Failed to load
//  image » (llm.ts:119). Or le SDK RESOUT n'importe quel JSON 200 (mesure du
//  11/11 : {error:"Failed to load image"} rendu en 200 -> RESOLU, jamais leve).
//  Un faux amont ne peut donc pas faire lever le SDK : avec ce harnais, AUCUNE
//  route HTTP n'atteint ce repli. Le juger ici serait un CAPTEUR DECORATIF.
//  LA VOIE DU REPLI EST JOUEE AILLEURS, a l'appel DIRECT du moteur :
//  scripts/probe-ocr-corrompu.ts (morsure mesuree rc 77 : sans la verification
//  des CRC, le processus meurt) et test/unit/ocr-image.test.ts, qui verifient
//  l'un et l'autre que le garde est BRANCHE avant recognize.
//
// Lancement : npx playwright test test/e2e/ocr-corrompu.spec.ts --reporter=line

import { test, expect } from "@playwright/test";
import { ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import { createServer as createHttpServer, Server } from "http";
import { arreterServeur, demarrerServeur } from "../../scripts/harnais-serveur.cjs";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-ocr-corrompu");
let server: ChildProcess;
let serverLog = "";

async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

/** Le PNG du defaut : VRAIE signature, CRC d'IHDR faux. Fabrique ici — pas un
 *  fixture lu — pour que le juge reste le serveur et non nous. Le corps est
 *  complete par un IDAT et un IEND aux CRC CALCULES : seul l'IHDR est faux.
 *  C'est la distinction qui rend le test probant — un fichier tronque est
 *  refuse par le lecteur de fichiers (la route repond 400 sans jamais atteindre
 *  le moteur), alors qu'un fichier COMPLETE et mal forme est celui qui partait
 *  en uncaughtException depuis le worker. */
function pngCrcFaux(): Buffer {
  const table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (b: Buffer, d: number, f: number): number => {
    let c = 0xffffffff;
    for (let i = d; i < f; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, donnees: Buffer): Buffer => {
    const t = Buffer.concat([Buffer.from(type, "latin1"), donnees]);
    const entete = Buffer.alloc(4);
    entete.writeUInt32BE(donnees.length, 0);
    const queue = Buffer.alloc(4);
    queue.writeUInt32BE(crc(t, 0, t.length), 0);
    return Buffer.concat([entete, t, queue]);
  };

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // truecolor
  const corps = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0]); // 2 lignes, filtre 0
  const iend = Buffer.alloc(0);

  // UnChunk d'IHDR au CRC FAUX (0xdeadbeef), le reste aux CRC corrects.
  const enteteIhdr = Buffer.alloc(4);
  enteteIhdr.writeUInt32BE(ihdr.length, 0);
  const crcFaux = Buffer.alloc(4);
  crcFaux.writeUInt32BE(0xdeadbeef, 0);
  return Buffer.concat([
    signature,
    enteteIhdr,
    Buffer.from("IHDR", "latin1"),
    ihdr,
    crcFaux,
    chunk("IDAT", corps),
    chunk("IEND", iend),
  ]);
}

/** La voie du crash mesure est le repli Tesseract de llm.ts, et il n'est joue
 *  que si le serveur Ollama repond « Failed to load image » (llm.ts:119). Une
 *  machine de CI sans Ollama tombe sur « generation muette » et le repli n'est
 *  jamais atteint : la mesure passerait a cote du defaut sans le voir. On pose
 *  donc un faux Ollama SUR CETTE PORTE SEULE (jamais sur une route reelle),
 *  qui repond exactement « Failed to load image » : le repli est FORCE, la
 *  voie du crash est jouee. */
let fauxOllama: Server;
let portOllama = 0;

/** Le faux amont qui joue le role d'Ollama.
 *
 *  ⚠ Il ne peut PAS declencher le repli Tesseract : le SDK `ollama` RESOUT
 *  n'importe quel JSON 200 (mesure du 11/11 : {error:"Failed to load image"}
 *  rendu en 200 -> RESOLU, jamais leve). C'est donc une REPONSE VIDE qui fait
 *  « !oRes.response » (llm.ts:110) et leve « generation muette ». Le but de ce
 *  faux amont est ailleurs : FIXER le comportement de la voie IA (refus nomme,
 *  deterministe, sans dependre d'un Ollama reel absent des couloirs) pour que
 *  les trois routes soient jouees dans un etat connu. */
async function demarrerFauxOllama(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createHttpServer((req, res) => {
      let corps = "";
      req.on("data", (d) => (corps += String(d)));
      req.on("end", () => {
        void corps;
        res.writeHead(200, { "content-type": "application/json" });
        // Repense vide : « !oRes.response » (llm.ts:110) leve « generation
        // muette », que les routes rendent en 500 AVEC la raison (C38-bis).
        res.end(JSON.stringify({ response: "", error: "generation muette" }));
      });
    });
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      resolve(p);
    });
    fauxOllama = srv;
  });
}

async function vivant(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
    return r.status === 200;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  portOllama = await demarrerFauxOllama();
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Le reglage d'instance : le faux Ollama ci-dessus comme amont. Ollama est
  // l'amont PAR DEFAUT (llm.ts:88, choix « ollama » quand llm_choix est absent),
  // donc aucune consignation n'est necessaire ici. Le fichier est settings.json
  // (src/services/settings.ts:74), relu a chaque appel par documents.ts:498.
  fs.writeFileSync(
    path.join(DATA_DIR, "settings.json"),
    JSON.stringify({ ollama_url: `http://127.0.0.1:${portOllama}`, model_name: "juge-factice" }),
  );
  server = demarrerServeur({
    racine: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: `ocr-corrompu-${PORT}`,
      // Les routes d'upload sont jugees ici, pas l'identite : la gate est
      // coupees par le harnais (meme contrat que les specs metiers).
      COOKDRIVE_AUTH_OFF: "1",
      COOKDRIVE_RATELIMIT_OFF: "1",
    },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => (serverLog += String(d)));
  server.stderr?.on("data", (d) => (serverLog += String(d)));
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (await vivant()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("serveur pas pret:\n" + serverLog.slice(-2500));
});

test.afterAll(() => {
  if (server) arreterServeur(server);
  if (fauxOllama) fauxOllama.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("une image corrompue est refusee et le serveur survit", async () => {
  expect(await vivant(), "le serveur doit etre vivant avant le test").toBe(true);
  const casse = pngCrcFaux();

  // 1. analyze-menu : la route attend un MULTIPART (`upload.single("file")`,
  //    menu.ts:37). Les trois voies d'entree sont donc joues de facon identique,
  //    ce qui est le contrat : une entree invalide est refusee AVANT le moteur
  //    quel que soit le geste (menu, facture, fiche technique).
  const form1 = new FormData();
  form1.append("file", new Blob([new Uint8Array(casse)], { type: "image/png" }), "corrompu.png");
  const r1 = await fetch(`${BASE}/api/analyze-menu`, {
    method: "POST",
    body: form1,
    signal: AbortSignal.timeout(90_000),
  });
  const j1 = await r1.json().catch(() => ({}) as Record<string, unknown>);
  console.log(`analyze-menu ${r1.status} ${JSON.stringify(j1).slice(0, 140)}`);
  expect(r1.status, `analyze-menu doit REFUSER, rendu ${r1.status}`).toBeGreaterThanOrEqual(400);

  // 2. documents/upload : la voie multipart, le geste reel du chef.
  const form2 = new FormData();
  form2.append("file", new Blob([new Uint8Array(casse)], { type: "image/png" }), "corrompu.png");
  const r2 = await fetch(`${BASE}/api/documents/upload`, {
    method: "POST",
    body: form2,
    signal: AbortSignal.timeout(90_000),
  });
  const corps2 = await r2.text();
  console.log(`documents/upload ${r2.status} ${corps2.slice(0, 140)}`);
  expect(r2.status, `documents/upload doit REFUSER, rendu ${r2.status}`).toBeGreaterThanOrEqual(400);

  // 3. recipes/scan : la troisieme voie d'entree image.
  const form3 = new FormData();
  form3.append("file", new Blob([new Uint8Array(casse)], { type: "image/png" }), "corrompu.png");
  const r3 = await fetch(`${BASE}/api/recipes/scan`, {
    method: "POST",
    body: form3,
    signal: AbortSignal.timeout(90_000),
  });
  const corps3 = await r3.text();
  console.log(`recipes/scan ${r3.status} ${corps3.slice(0, 140)}`);
  expect(r3.status, `recipes/scan doit REFUSER, rendu ${r3.status}`).toBeGreaterThanOrEqual(400);

  // 4. LE CRITERE QUI COMPTE : le serveur a-t-il survécu aux trois envois ?
  //    Sans le garde ocr-image.ts il est mort ici (mesure : rc 77).
  expect(await vivant(), "le serveur doit SURVIVRE a trois images corrompues").toBe(true);

  // 5. LA RAISON EST NOMMEE (contrat C38-bis : llm.ts:93, « le message du
  //    serveur est le seul qui explique POURQUOI »). Une route qui rendrait un
  //    500 mu — ou pire un 200 — laisserait le chef sans explication, et le
  //    defaut serait de retour sans que personne ne le voie.
  const nommee = [corps2, corps3].every((c) => /LLM injoignable/.test(c));
  console.log(`raison nommee par les routes : ${nommee}`);
  expect(nommee, "les routes doivent nommer la raison du refus (jamais un 500 muet)").toBe(true);

  // 5. et le service est INTACT apres les attaques (sante + une route metier).
  const sante = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
  expect(sante.status, "la sante doit repondre 200 apres les attaques").toBe(200);
  const inventaire = await fetch(`${BASE}/api/articles`, { signal: AbortSignal.timeout(15_000) });
  expect(inventaire.status, "une route metier doit repondre apres les attaques").toBe(200);
  console.log(`service intact apres les attaques : health 200, articles ${inventaire.status}`);
});
