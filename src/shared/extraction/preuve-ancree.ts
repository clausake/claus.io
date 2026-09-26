// Le juge des CHAMPS OCR — la PREUVE ANCRÉE (Sprint 15, Tache 15).
//
// LA PREUVE ANCRÉE: pour chaque champ rendu, exiger une preuve {texte_ocr,
// ligne, debyte, findebyte} et vérifier texte_ocr.slice(debyte, findebyte) ===
// valeur. Un champ sans preuve = CHAMP_SANS_PREUVE → null, jamais comblé.
// Un nombre non fini (NaN/Infinity) est refusé à la porte. Les caractères
// ambigus (0/O/o, 1/l/I, OCR/OCR_CORRECT? 5/S, 6/G, 8/B, 9/q) ne sont JAMAIS
// « corrigrés » par le LLM: ils rendent une alerte AMBIGU avec les DEUX
// lectures, et la ligne attend le chef.
//
// Ce module est le JUGE DES CHAMPS: il n'EXTRAIT pas; il juge ce que le
// moteur a rendu. L'extraction proprement dite vit dans src/shared/extraction/.

import fs from "node:fs";
import type { LectureOcr } from "../ocr-commun.js";

export interface PreuveOcr {
  readonly texte_ocr: string;
  readonly ligne: number;
  readonly debyte: number;         // l'offset DANS LA LIGNE (pas dans le texte fondu)
  readonly findebyte: number;
}

export interface ChampOcr {
  readonly nom: string;
  readonly valeur: string;         // la valeur OCR CRUE (jamais normalisée)
  readonly preuve: PreuveOcr | null;
  readonly ambigu: boolean;
  readonly ambigu_lectures?: [string, string]; // les deux lectures quand ambigu
}

/** Les paires de caractères ambigus, mesurées le 25/09 (0/O, 1/l/I, 5/S, 6/G,
 *  8/B, 9/q): un OCR rend « 34,90 » comme « 34,90 » mais une partie du texte
 *  fondu rend `0` au lieu de `O` (mesure sonde-8-sortie-brute.mjs: la sortie
 *  brute porte `0.08 8,00` — les 0 de « 0,08 » et « 8,00 »). */
const AMBIGUS = [
  ["0", "O"], ["0", "0"], ["1", "l"], ["1", "I"], ["5", "S"], ["6", "G"],
  ["8", "B"], ["9", "q"],
] as const;

const frTrancher = (s: string) => s.replace(/\s+/g, " ").trim();