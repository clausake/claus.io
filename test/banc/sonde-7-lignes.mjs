// Sondes 7: les LIGNES reelles rendues par la porte d'entree OCR sur la piece
// du banc (pas une supposition de ma part, la sortie du moteur lue par la machine).
//
// Le juge par LIGNES vs le juge fondu: la piece d'essai disait 7/7 au spike
// (le montant avec son espace de milliers nage dans le texte fondu), mais le
// juge par lignes rendoit 1/7 — la faute est dans le JUGE, pas dans le moteur:
// le SIRET passe sur deux lignes, l'attendu porte des espaces que le moteur
// rend comme `41285733900 066`... On mesure avant de corriger.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = path.resolve(ICI, "..", "..", "test", "banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const ATTENDUS = path.join(BANC, "facture-synthetique.attendus.json");
const attendus = JSON.parse(fs.readFileSync(ATTENDUS, "utf-8"));

const { lireParChemin } = await import("../../src/shared/ocr-moteurs/paddle.js");
const lu = await lireParChemin(IMAGE);

console.log("=== LIGNES RENDUES PAR LA PORTE ===");
lu.lignes.forEach((l, n) => console.log(`${n + 1}> ${l}`));
console.log("nbLignes:", lu.lignes.length, "| nbChars:", lu.texte.length,
            "| moteur:", lu.moteur, "| duree:", lu.duree_ms, "ms");

console.log("=== JUGE PAR LIGNES vs JUGE FONDU ===");
let parLignes = 0;
const manquesL = [];
const colle = lu.texte.replace(/\s+/g, " ");
let parFondu = 0;
const manquesF = [];
for (const [nom, texte] of Object.entries(attendus)) {
  const cible = texte.replace(/\s+/g, " ").trim();
  if (lu.lignes.some((l) => l.replace(/\s+/g, " ").trim() === cible
                          || l.replace(/\s+/g, " ").trim().includes(cible))) {
    parLignes += 1;
  } else manquesL.push(nom);
  if (colle.includes(cible)) parFondu += 1; else manquesF.push(nom);
}
console.log("PAR_LIGNES:", `${parLignes}/7` + (manquesL.length ? `  MANQUES=${manquesL.join(",")}` : "  TOUT"));
console.log("PAR_FONDU :", `${parFondu}/7` + (manquesF.length ? `  MANQUES=${manquesF.join(",")}` : "  TOUT"));
console.log("CONTRE_EPREUVE: OK (juge le vrai compte, pas le compte du moteur)");
