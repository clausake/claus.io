// Le couloir i18n pour scripts/mesurer-langues-formats.py (Tache 16).
//
// Python ne LIT pas les formats : il JUGe. La LECTURE est jouee par les
// VRAIS modules du produit (src/shared/i18n/*) dans le MEME contexte tsx.
// stdin : {"nombres":[["419,60","fr-FR"],…], "dates":[["05/09/2026","fr-FR"],…],
//          "motsCles":[["TVA 10,0 %","fr-FR","tva"],…]}
// stdout : {"nombres":[{brut,verdict,valeur,lectures?}], "dates":[…],
//           "motsCles":[{ligne,locale,champ,joue}], "locales":[{code,script_ocr,script_prouve}]}
// Toute faute part en stderr + rc=1 — le Python la NOMME.
import { readFileSync } from "node:fs";
import { resoudreLocale, LOCALES } from "../../src/shared/i18n/locales.js";
import { lireNombre } from "../../src/shared/i18n/nombre.js";
import { lireDate } from "../../src/shared/i18n/date.js";
import { contientMoteCle } from "../../src/shared/i18n/mots-cles.js";

const brut = readFileSync(0, "utf8");
const entree = JSON.parse(brut);

const nombres = (entree.nombres ?? []).map(([b, l]) => lireNombre(b, l ?? null));
const dates = (entree.dates ?? []).map(([b, l]) => lireDate(b, l ?? null));
const motsCles = (entree.motsCles ?? []).map(([ligne, locale, champ]) => ({
  ligne, locale, champ, joue: contientMoteCle(ligne, locale ?? null, champ),
}));
const locales = Object.values(LOCALES).map((l) => ({
  code: l.code, script_ocr: l.script_ocr, script_prouve: l.script_prouve,
}));

process.stdout.write(JSON.stringify({ nombres, dates, motsCles, locales, ressour: resoudreLocale(null).verdict }));
