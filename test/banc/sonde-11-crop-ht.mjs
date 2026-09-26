// Sondes 11: le crop isolé (zone y=680..800, la row Total HT). Le paquet rend
// des boites y=753 (TVA), y=793 (TTC) — aucune boite HT. On trancher si le HT
// row est DETECTE mais non reconnu, ou pas detecte du tout, en relancant le
// paquet sur le crop isolé (le crop porte le HT row — mesuré par vision_analyze).
import fs from "node:fs";
import path from "node:path";

const BANC = path.resolve("test/banc");
const M = path.resolve("resources/ocr/modeles");
const CROP = "/home/clausake/.hermes/cache/scratch/crop-ht-seule.png";

const { ocr } = await import("ppu-paddle-ocr");

const sortie = await ocr(CROP, {
  model: {
    detection: M + "/det.onnx",
    recognition: M + "/rec.onnx",
    charactersDictionary: M + "/dict.txt",
  },
  processing: { engine: "canvas-native" },
  flatten: false,
});

console.log("CROP:", "cles:", Object.keys(sortie).join(","));
console.log("text:", JSON.stringify(sortie.text ?? "").slice(0, 400));
console.log("lines.length:", Array.isArray(sortie.lines) ? sortie.lines.length : "absent");
for (const g of (sortie.lines ?? [])) {
  console.log("GROUPE:", JSON.stringify(g).slice(0, 400));
}
