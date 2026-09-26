// Sondes 8: la sortie brute du paquet PaddleOCR avant ma passe d'assemble.
// Le juge rendoit 6/7 parce que la passe d'assemble (lignes retirees vuides +
// blancs normalises) FOND le texte. Le juge du contrat veut des LIGNES —
// la sortie du paquet porte-t-elle des lignes, ou un bloc fondu ?

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ocr } from "ppu-paddle-ocr";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..");
const BANC = path.join(RACINE, "test", "banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const M = path.join(RACINE, "resources", "ocr", "modeles");

const sortie = await ocr(IMAGE, {
  model: {
    detection: M + "/det.onnx",
    recognition: M + "/rec.onnx",
    charactersDictionary: M + "/dict.txt",
  },
  processing: { engine: "canvas-native" },
  flatten: false,
});

console.log("=== SORTIE BRUTE (sans ma passe d'assemble) ===");
console.log("cles de la sortie:", Object.keys(sortie));
if (Array.isArray(sortie.lines)) {
  console.log("lines.length:", sortie.lines.length);
  for (const l of sortie.lines.slice(0, 12)) {
    console.log("  ", JSON.stringify(l).slice(0, 240));
  }
} else {
  console.log("lines n'est pas un tableau");
}
