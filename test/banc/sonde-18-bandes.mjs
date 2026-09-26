// Sonde 18: le moteur doit segmenter lui-meme. Je coupe la piece du banc en
// bandes de luminance (comme probe-bandes.py) et je joue ocr() sur CHAQUE
// bande + padding. Attendu: la bande 713..734 rend "Total HT" + "419,60"
// (la row que la pleine page perdoit).
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const BANC = path.resolve("test/banc/facture-synthetique.png");
const M = path.resolve("resources/ocr/modeles");
const { ocr } = await import("ppu-paddle-ocr");

const BANDES = [
  [51,78],[94,116],[127,143],[158,177],[212,231],[254,270],[284,300],
  [314,333],[371,390],[420,439],[452,471],[484,503],[516,535],[548,567],
  [580,599],[612,631],[644,663],[713,734],[755,776],[797,818],[838,856],
  [872,890],[903,920],
];

const img = await loadImage(BANC);
const W = img.width;
let trouve = 0;
const rendu = [];
for (let i = 0; i < BANDES.length; i++) {
  const [d, f] = BANDES[i];
  const pad = 13;
  const y0 = Math.max(0, d - pad), y1 = Math.min(img.height, f + pad);
  const cv = createCanvas(W, y1 - y0);
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, y0, W, y1 - y0, 0, 0, W, y1 - y0);
  const sortie = await ocr(cv, {
    model: {
      detection: M + "/det.onnx",
      recognition: M + "/rec.onnx",
      charactersDictionary: M + "/dict.txt",
    },
    processing: { engine: "canvas-native" },
    flatten: false,
  });
  const frags = [];
  for (const g of (sortie.lines ?? [])) {
    const arr = Array.isArray(g) ? g : [g];
    for (const fr of arr) frags.push(String(fr?.text ?? ""));
  }
  rendu.push({ bande: [d, f], frags });
  const joint = frags.join(" ");
  if (joint.includes("419,60")) { trouve++; console.log("BANDE", d, f, "=> 419,60 TROUVE:", JSON.stringify(frags)); }
}
console.log("bandes:", BANDES.length, "419,60 trouves:", trouve);
// juger les 7 attendus
const ATT = ["FOURNITURES GASTRONOMIQUES DU SUD-EST","12/09/2026","F-2026-000847","412 857 339 00066","419,60","41,96","461,56"];
const toutes = rendu.flatMap(r => r.frags);
const cle = (s) => s.replace(/\s+/g," ").trim();
const trous = ATT.filter(a => !toutes.some(l => cle(l) === cle(a) || cle(l).includes(cle(a))));
console.log("ATTENDUS:", ATT.length - trous.length + "/" + ATT.length, trous.length ? "MANQUES=" + trous.join(",") : "complets");
