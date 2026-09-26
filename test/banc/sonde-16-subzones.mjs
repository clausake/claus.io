// Sondes 16: les SUB-ZONES du header (zone-1a: y=50..170, zone-1b: y=170..310).
// Le det de la zone 1 rend Telephone ABSENT. Je mesure le det par SUB-ZONE pour
// trancher si Telephone est rendu quand le crop commence SUR Telephone.
import fs from "node:fs";
import path from "node:path";

const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const SUBZONES = [
  "/home/clausake/.hermes/cache/scratch/row-ht.png",
  "/home/clausake/.hermes/cache/scratch/row-tva.png",
  "/home/clausake/.hermes/cache/scratch/row-ttc.png",
];
const SORTIES = [];
for (const Z of SUBZONES) {
  const sortie = await ocr(Z, {
    model: {
      detection: M + "/det.onnx",
      recognition: M + "/rec.onnx",
      charactersDictionary: M + "/dict.txt",
    },
    processing: { engine: "canvas-native" },
    flatten: false,
  });
  const text = String(sortie.text ?? "");
  console.log("SUBZONE:", path.basename(Z), "tel:", text.includes("Telephone"), "lines:", (sortie.lines ?? []).length, "text:", text.slice(0, 200));
  SORTIES.push(sortie);
}
fs.writeFileSync("/home/clausake/.hermes/cache/scratch/sonde-16-subzones-dump.json", JSON.stringify(SORTIES, null, 1));
console.log("DUMP ECRIT");
