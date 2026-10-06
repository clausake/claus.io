// La porte de l'assistant de premier demarrage (Sprint 15, Tache 10).
//
// Le VRAI serveur est lance (spawn tsx, port libre, jeton d'instance verifie
// a /health — la voie mesuree des portes 9/8). L'epreuve est jouee par le
// LECTEUR FABRIQUE (COOKDRIVE_EPREUVE_LECTEUR) : la porte ne joue jamais le
// vrai moteur Paddle — les poids ne sont pas sous git et la course dependrait
// de l'infrastructure d'autrui (la regle des portes vivantes, tache 8).
// L'outil a main `test/banc/outil-epreuve-reelle.mjs` joue le moteur reel.
//
// Neuf verdicts ecrits d'avance :
//  1. etat initial : epreuve_acquise=false (rien n'est herite) ;
//  2. consigner AVANT l'epreuve = 412 EPREUVE_NON_ACQUISE (la regle cardinale) ;
//  3. MORSURE muet (:test=muet) = EPREUVE_MUETTE, jamais un 200 lu comme un vert ;
//  4. l'epreuve complete sur lignes fabriquees = reussi, score 7/7 ;
//  5. consigner apres l'epreuve = 200 + install_termine_le + fournisseur_choisi ;
//  6. MORSURE forget (:test=forget) = consigner rougit EPREUVE_NON_ACQUISE —
//     pas de certificat herite d'un processus d'avant ;
//  7. fournisseur vide = 412 FOURNISSEUR_ABSENT ;
//  8. une ligne retiree = le champ est NOMME dans manquants, reussi=false ;
//  9. les attendus du banc sont SEPT (la piece scellee 876842cba13f) — si le
//     banc changeait de forme, la porte rougit, elle ne suit pas.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-assistant");
const LECTEUR = join(process.cwd(), "test", "banc", "lecteur-fabrique-assistant.mjs");
const FICHIER_CONSIGNE = join(OUT, "lignes.json");

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

const portLibre = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
});

// Les lignes que « le moteur » rendra : les sept attendus du banc, rendus
// tels quels (le juge de l'etat les atteint par egalite normalisee).
const attendus = JSON.parse(
  (await import("node:fs")).readFileSync(
    join(process.cwd(), "test", "banc", "facture-synthetique.attendus.json"), "utf8"));
const TOUTES = Object.values(attendus).map(String);

const TOKEN = "assistant-" + process.pid;

async function lancerServeur(port) {
  const data = join(OUT, "udata");
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  // La voie fabriquee est POSEE a la naissance du serveur : la porte ne peut
  // jamais basculer sur le moteur reel par oubli d'env.
  writeFileSync(FICHIER_CONSIGNE, JSON.stringify({ lignes: TOUTES }));
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, USER_DATA_PATH: data, NODE_ENV: "production",
           PORT: String(port), COOKDRIVE_INSTANCE_TOKEN: TOKEN,
           COOKDRIVE_EPREUVE_LECTEUR: LECTEUR,
           COOKDRIVE_EPREUVE_FICHIER: FICHIER_CONSIGNE,
           // Sonde metier : la gate session est jugee ACTIVE par verify:auth
           // seul (convention harnais) — ici on juge le contrat assistant.
           COOKDRIVE_AUTH_OFF: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = { buf: "" };
  child.stdout.on("data", (d) => (log.buf += d.toString()));
  child.stderr.on("data", (d) => (log.buf += d.toString()));
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

const json = (r) => r.json();
const get = (p) => fetch(BASE + p).then(json);
const post = (p, corps) => fetch(BASE + p, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(corps ?? {}),
});

try {
  // 1. etat initial — rien n'est herite.
  const e0 = await get("/api/assistant/etat");
  check("1. etat initial: epreuve non acquise",
    e0.epreuve_acquise === false && e0.install_termine_le === null,
    JSON.stringify(e0).slice(0, 120));

  // 2. consigner sans epreuve = refuse NOMMEEMENT (412, pas un 200 complaisant).
  const c0 = await post("/api/assistant/consigner", { fournisseur: "ollama" });
  const c0j = await c0.json();
  check("2. consigner sans epreuve: 412 EPREUVE_NON_ACQUISE",
    c0.status === 412 && c0j.defaut === "EPREUVE_NON_ACQUISE", JSON.stringify(c0j).slice(0, 100));

  // 3. LA MORSURE muet : aucune ligne rendue = EPREUVE_MUETTE, jamais un vert.
  const vMuet = await get("/api/assistant/epreuve?test=muet");
  check("3. MORSURE muet: EPREUVE_MUETTE", vMuet.reussi === false && vMuet.defaut === "EPREUVE_MUETTE",
    JSON.stringify(vMuet).slice(0, 120));
  const e1 = await get("/api/assistant/etat");
  check("3b. un muet n'acquiert RIEN", e1.epreuve_acquise === false);

  // 4. l'epreuve complete (lignes fabriquees = les sept attendus du banc).
  const v4 = await get("/api/assistant/epreuve");
  check("4. epreuve complete: reussi 7/7",
    v4.reussi === true && v4.score === "7/7" && v4.manquants.length === 0,
    JSON.stringify(v4).slice(0, 120));

  // 5. consigner apres l'epreuve = les deux champs du contrat consigns.
  const c5 = await post("/api/assistant/consigner", { fournisseur: "ollama" });
  const c5j = await c5.json();
  check("5. consigner apres l'epreuve: 200 + les deux champs",
    c5.status === 200 && c5j.ok === true
    && typeof c5j.etat.install_termine_le === "string" && c5j.etat.fournisseur_choisi === "ollama",
    JSON.stringify(c5j).slice(0, 140));
  const relu = await get("/api/settings");
  check("5b. consignne en settings (la preuve est lisible par le produit)",
    relu.install_termine_le && relu.fournisseur_choisi === "ollama",
    JSON.stringify({ i: relu.install_termine_le, f: relu.fournisseur_choisi }).slice(0, 120));

  // 6. LA MORSURE forget : consigner rougit si on efface l'epreuve — un
  //    certificat herite ne peut pas exister.
  const c6 = await post("/api/assistant/consigner?test=forget", { fournisseur: "ollama" });
  const c6j = await c6.json();
  check("6. MORSURE forget: consigner rougit EPREUVE_NON_ACQUISE",
    c6.status === 412 && c6j.defaut === "EPREUVE_NON_ACQUISE", JSON.stringify(c6j).slice(0, 100));

  // 7. fournisseur vide = FOURNISSEUR_ABSENT (la faute d'entree nommee AVANT
  //    l'etat machine — on rejoue l'epreuve pour que ce soit le champ qui juge).
  await get("/api/assistant/epreuve");
  const c7 = await post("/api/assistant/consigner", { fournisseur: "   " });
  const c7j = await c7.json();
  check("7. fournisseur vide: 412 FOURNISSEUR_ABSENT",
    c7.status === 412 && c7j.defaut === "FOURNISSEUR_ABSENT", JSON.stringify(c7j).slice(0, 100));

  // 8. une ligne retiree du champ de lecture = le champ est NOMME, pas un total nu.
  writeFileSync(FICHIER_CONSIGNE, JSON.stringify({ lignes: TOUTES.filter((l) => l !== attendus.siret) }));
  const v8 = await get("/api/assistant/epreuve");
  check("8. siret retire: manquants=[siret], reussi=false",
    v8.reussi === false && v8.manquants.length === 1 && v8.manquants[0] === "siret" && v8.score === "6/7",
    JSON.stringify(v8).slice(0, 140));

  // 9. les attendus du banc sont sept (la piece scellee 876842cba13f).
  check("9. le banc porte sept attendus", Object.keys(attendus).length === 7,
    "=" + Object.keys(attendus).join(","));

  // 10. le COFFRE (tache 12, la clef) : une clef rangee ne RESSORT par nulle
  //     part — ni GET /api/clef, ni /api/settings, ni les fichiers settings.
  //     Le marqueur est ecrit d'avance ; le retrouver = une fuite = FAUTE.
  const MARQUEUR = "cle-factice-" + process.pid + "-NE-JAMAIS-RENDUE";
  const rp1 = await post("/api/clef", { fournisseur: "mistral", clef: MARQUEUR });
  const rp1j = await rp1.json();
  check("10a. ranger la clef: 200 + etat sans valeur",
    rp1.status === 200 && rp1j.presente === true
    && !JSON.stringify(rp1j).includes(MARQUEUR) && !("clef" in rp1j),
    JSON.stringify(rp1j).slice(0, 100));
  const etatC = await get("/api/clef?fournisseur=mistral");
  check("10b. GET /api/clef rend l'etat, JAMAIS la valeur",
    etatC.presente === true && !JSON.stringify(etatC).includes(MARQUEUR),
    JSON.stringify(etatC).slice(0, 100));
  const settingsC = await get("/api/settings");
  check("10c. la clef n'entre pas dans settings",
    !JSON.stringify(settingsC).includes(MARQUEUR), "(absente)");
  const brutCoffre = readFileSync(join(OUT, "udata", "coffre.json"), "utf8");
  const brutSettings = readFileSync(join(OUT, "udata", "settings.json"), "utf8");
  check("10d. la clef en clair n'est dans AUCUN fichier de la sauvegarde",
    !brutCoffre.includes(MARQUEUR) && !brutSettings.includes(MARQUEUR),
    "coffre=" + brutCoffre.length + "o settings=" + brutSettings.length + "o");
  const rv = await post("/api/clef", { fournisseur: "mistral", clef: "   " });
  check("10e. clef vide refusee NOMMEEMENT (le capteur ne peut pas dire vide=vert)",
    rv.status === 400 && (await rv.json()).defaut === "CLEF_VIDE");
} finally {
  await arreter();
}

console.log(fail === 0 ? "\nPORTE ASSISTANT: tout vert" : `\nPORTE ASSISTANT: ${fail} FAUTE(S)`);
process.exit(fail === 0 ? 0 : 1);
