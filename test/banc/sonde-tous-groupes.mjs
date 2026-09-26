// Sonde personelle: tous les fragments de la sortie brute du paquet PaddleOCR
// (la sonde-8 coupe a 12 groupes; la zone des totaux est aux groupes 12-20).
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
console.log("lines.length:", sortie.lines.length);
for (const [n, l] of sortie.lines.entries()) {
  const fragments = Array.isArray(l) ? l : [l];
  for (const f of fragments) {
    const t = String(f?.text ?? "");
    console.log(`groupe=${n + 1} text=${t} box=${JSON.stringify(f?.box ?? null)}`);
  }
}
