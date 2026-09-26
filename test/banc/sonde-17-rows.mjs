// Sondes 17: les ROWS exactes du banc (10 rows). Le det rend la row PREMIERE
// du crop SEULEMENT. Je mesure chaque row exacte pour trancher si le det rend
// la row SEULEMENT quand le crop couvre EXACTEMENT la row.
import fs from "node:fs";
import path from "node:path";

const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const ROWS = [
  "/home/clausake/.hermes/cache/scratch/row-1b.png",
  "/home/clausake/.hermes/cache/scratch/row-2.png",
  "/home/clausake/.hermes/cache/scratch/row-3.png",
  "/home/clausake/.hermes/cache/scratch/row-4.png",
  "/home/clausake/.hermes/cache/scratch/row-5.png",
  "/home/clausake/.hermes/cache/scratch/row-6.png",
  "/home/clausake/.hermes/cache/scratch/row-7.png",
  "/home/clausake/.hermes/cache/scratch/row-8.png",
  "/home/clausake/.hermes/cache/scratch/row-9.png",
  "/home/clausake/.hermes/cache/scratch/row-10.png",
];
const SORTIES = [];
for (const Z of ROWS) {
  const sortie = await ocr(Z, {
    model: {
      detection: M + "/det.onnx",
      recognition: M + "/rec.onnx",
      charactersDictionary: M + "/dict.txt",
    },
    processing: { engine: "canvas-native" },
    flatten: false,
  });
  const text = String(sortie.text ?? "").replace(/\n/g, " | ");
  console.log("ROW:", path.basename(Z), "lines:", (sortie.lines ?? []).length, "text:", text.slice(0, 260));
  SORTIES.push(sortie);
}
fs.writeFileSync("/home/clausake/.hermes/cache/scratch/sonde-17-rows-dump.json", JSON.stringify(SORTIES, null, 1));
console.log("DUMP ECRIT");
