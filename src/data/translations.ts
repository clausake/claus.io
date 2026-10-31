// Traductions UI (fr/es/de/it/en) — extraite de App.tsx (Phase 2).
// T3.2 : le corps (3929 lignes) est extrait UN MODULE PAR LANGUE (extraction
// pure, byte-exact). Ce fichier n'assemble plus que les cinq modules ; le
// comportement (clés, valeurs, ordre) est identique à la version monolithique.
import { FR_TRANSLATIONS } from "./translations/fr";
import { EN_TRANSLATIONS } from "./translations/en";
import { DE_TRANSLATIONS } from "./translations/de";
import { ES_TRANSLATIONS } from "./translations/es";
import { IT_TRANSLATIONS } from "./translations/it";
export const TRANSLATIONS: Record<string, Record<string, string>> = {
  fr: FR_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  de: DE_TRANSLATIONS,
  es: ES_TRANSLATIONS,
  it: IT_TRANSLATIONS,
};
