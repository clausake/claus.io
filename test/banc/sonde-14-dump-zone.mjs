// Sondes 14: le crop y=700..830 (la zone totals). Je dump la sortie du paquet
// sur ce crop pour trancher le fragment 419, 60 vs 419,60.
import fs from "node:fs";
import path from "node:path";

const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const sortie = await ocr("/home/clausake/.hermes/cache/scratch/zone-700-830.png", {
  model: {
    detection: M + "/det.onnx",
    recognition: M + "/rec.onnx",
    charactersDictionary: M + "/dict.txt",
  },
  processing: { engine: "canvas-native" },
  flatten: false,
});

fs.writeFileSync("/home/clausake/.hermes/cache/scratch/zone-700-830-dump.json", JSON.stringify(sortie, null, 1));
console.log("DUMP ECRIT");
