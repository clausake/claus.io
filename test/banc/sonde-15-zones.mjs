// Sondes 15: la piece coupe en ZONES (header/table/totals/compte). Le det du
// paquet rend la row HT SEULEMENT sur le crop y=700..830 (la zone totals seule).
// Le moteur doit couper la piece en zones avant det, puis assembler par ordre y.
import fs from "node:fs";
import path from "node:path";

const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const SCRATCH = "/home/clausake/.hermes/cache/scratch";
const ZONES = ["zone-1.png", "zone-2.png", "zone-3.png", "zone-4.png"];
const SORTIES = [];
for (const Z of ZONES) {
  const chemin = path.join(SCRATCH, Z);
  const sortie = await ocr(chemin, {
    model: {
      detection: M + "/det.onnx",
      recognition: M + "/rec.onnx",
      charactersDictionary: M + "/dict.txt",
    },
    processing: { engine: "canvas-native" },
    flatten: false,
  });
  const text = String(sortie.text ?? "");
  console.log("ZONE:", Z, "HT:", text.includes("Total HT"), "419:", text.includes("419"), "lines:", (sortie.lines ?? []).length);
  SORTIES.push(sortie);
}
fs.writeFileSync(path.join(SCRATCH, "sonde-15-zones-dump.json"), JSON.stringify(SORTIES, null, 1));
console.log("DUMP ECRIT: sonde-15-zones-dump.json");
