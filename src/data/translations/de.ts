// T3.2 : DE assemblé de deux parties (aucun fichier >800). Ordre et clés
// identiques à la version monolithique (spread de DE_A puis DE_B).
import { DE_A } from "./de_a";
import { DE_B } from "./de_b";
export const DE_TRANSLATIONS: Record<string, string> = {
  ...DE_A,
  ...DE_B,
};
