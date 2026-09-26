// Sondes 9: le champ `total_ht` manquant. Le banc porte un total HT écrit
// "419,60" (la pièce rendue par le paquet porte "419,60"). Le paquet rend le
// montant comme un fragment SEUL ("419,60"), mais mon attendu demande
// "419,60" — il devrait le regarder là où il se trouve: la ligne qui porte le
// total HT est un FRAGMENT SEUL, pas la facture entière. Je rejoue la sonde
// pour le regarder là où il se trouve: un champ n'est pas réordonné par la
// porte d'entrée, il est rendu par le paquet, et le juge doit regarder
// chaque ligne en ordre de lecture — la ligne qui porte "419,60" existe.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..");
const BANC = path.join(RACINE, "test", "banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const ATTENDUS = path.join(BANC, "facture-synthetique.attendus.json");
const attendus = JSON.parse(fs.readFileSync(ATTENDUS, "utf-8"));

const { lireParChemin } = await import("../../src/shared/ocr-moteurs/paddle.js");
const lu = await lireParChemin(IMAGE);

console.log("=== Où est le TOTAL HT ? ===");
for (const [n, l] of lu.lignes.entries()) {
  if (l.includes("419")) console.log(`${n + 1}> ${l}`);
}
console.log("=== Où est le TVA et le TTC ? ===");
for (const valeur of ["41,96", "461,56"]) {
  for (const [n, l] of lu.lignes.entries()) {
    if (l.includes(valeur)) console.log(`${n + 1}> ${l}`);
  }
}