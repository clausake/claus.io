// Sondes 12: la piece SANS le trait noir (facture-sans-trait.png). Le det du
// paquet rend les rows APRES le trait (TVA y=753, TTC y=793) mais PAS la row
// AVANT (Total HT y~700). Hypothese: le trait noir bloque le det. Je relance le
// paquet sur la piece SANS trait noir pour voir si la row HT est rendue.
import fs from "node:fs";
import path from "node:path";

const BANC = path.resolve("test/banc");
const M = path.resolve("resources/ocr/modeles");
const PIECE = path.join(BANC, "facture-sans-trait.png");

const { ocr } = await import("ppu-paddle-ocr");

const sortie = await ocr(PIECE, {
  model: {
    detection: M + "/det.onnx",
    recognition: M + "/rec.onnx",
    charactersDictionary: M + "/dict.txt",
  },
  processing: { engine: "canvas-native" },
  flatten: false,
});

console.log("cles:", Object.keys(sortie).join(","));
console.log("lines.length:", Array.isArray(sortie.lines) ? sortie.lines.length : "absent");
const text = String(sortie.text ?? "");
console.log("HT_PROUVE:", text.includes("Total HT"));
console.log("419_PROUVE:", text.includes("419"));
fs.writeFileSync(path.join(BANC, "sonde-12-dump.json"), JSON.stringify(sortie, null, 1));
console.log("DUMP ECRIT: sonde-12-dump.json");
