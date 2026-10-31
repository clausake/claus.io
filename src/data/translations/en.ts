// T3.2 : EN assemblé de deux parties (aucun fichier >800). Ordre et clés
// identiques à la version monolithique (spread de EN_A puis EN_B).
import { EN_A } from "./en_a";
import { EN_B } from "./en_b";
export const EN_TRANSLATIONS: Record<string, string> = {
  ...EN_A,
  ...EN_B,
};
