// Sondes 10: la SORTIE BRUTE du paquet, DUMPED TO FILE (pas un print tronque).
// Trancher par OCTETS: lire le fichier dump, jamais le print.
import fs from "node:fs";
import path from "node:path";

const BANC = path.resolve("test/banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const M = path.resolve("resources/ocr/modeles");

const { ocr } = await import("ppu-paddle-ocr");

const sortie = await ocr(IMAGE, {
  model: {
    detection: M + "/det.onnx",
    recognition: M + "/rec.onnx",
    charactersDictionary: M + "/dict.txt",
  },
  processing: { engine: "canvas-native" },
  flatten: false,
});

const fichier = path.join(BANC, "sortie-brute-dump.json");
fs.writeFileSync(fichier, JSON.stringify(sortie, null, 1));
console.log("DUMP ECRIT:", fichier, "octets:", fs.statSync(fichier).size);
console.log("cles:", Object.keys(sortie).join(","));
console.log("text.length:", String(sortie.text ?? "").length);
console.log("lines.length:", Array.isArray(sortie.lines) ? sortie.lines.length : "absent");
