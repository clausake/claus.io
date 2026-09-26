// Sondes 13: les zones. Le det du paquet rend la row HT seulement sur le crop
// y=700..830 (le crop d'une row seule). Le det rend les rows APRES (TVA, TTC,
// Compte, Arrete) et la row AVANT (Rue des Martyrs) mais PAS la row HT quand le
// crop couvre plusieurs rows. Le det saute la row HT quand le crop couvre
// plusieurs rows. Hypothese: le det rend UNE row par crop (une row seule).
// On mesure chaque zone seule (le det rend UNE row par zone).
import fs from "node:fs";
import path from "node:path";

const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const ZONES = [
  "/home/clausake/.hermes/cache/scratch/zone-700-830.png",
];

for (const Z of ZONES) {
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
  console.log("ZONE:", path.basename(Z), "HT:", text.includes("Total HT"), "419:", text.includes("419"), "lines:", sortie.lines.length);
}
