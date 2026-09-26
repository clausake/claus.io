// Le couloir de lecture pour scripts/juge-ocr.py (Tache 11).
//
// Python ne lit pas l'OCR : il JUGE. La LECTURE est jouee par le VRAI moteur
// (paddle.ts, @napi-rs/canvas) dans le MEME contexte tsx que le produit. Ce
// module lit une piece, rend les LIGNES brutes + la duree du moteur, et
// c'est le Python qui compte (taux d'erreur de caractere par distance
// d'edition, champs atteints par lignes, percentiles de temps).
//
// usage : npx tsx test/banc/couloir-juge-ocr.mjs <image> [moteur=paddle]
// rend sur stdout : {"lignes":[...],"moteur":"paddle","duree_ms":N}
// Toute faute (poids absents, piece absente) part en stderr + rc=1 — le
// Python la NOMME, il ne la compte pas comme « 0 champ atteint ».
import path from "node:path";
import { fileURLToPath } from "node:url";

const [,, image, moteur = "paddle"] = process.argv;
if (!image) { console.error("usage: couloir-juge-ocr.mjs <image> [moteur]"); process.exit(2); }
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  const O = await import(path.join(RACINE, "src/shared/ocr.js"));
  const lu = await O.lireTexte(path.resolve(image), { moteur });
  process.stdout.write(JSON.stringify({ lignes: lu.lignes, moteur: lu.moteur, duree_ms: lu.duree_ms }));
} catch (e) {
  console.error("LECTURE_ECHEC:", String(e?.message ?? e));
  process.exit(1);
}
