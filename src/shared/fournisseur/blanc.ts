// La liste blanche des fournisseurs en ligne (Sprint 15, Tache 4).
//
// Decis du 25/09 par le maitre d'ouvrage: une URL n'est PAS un champ libre.
// Un fournisseur doit etre NOMMEMENT connu et VERIFIE avant qu'on lui confie
// les donnees du restaurant. Une URL hors liste est refusee a l'enregistrement.
//
// L'epreuve de recevabilite a ete JOUEE le 25/09 (`GET <base>/v1/models` sans
// clef): 401 pour les cinq retenus. Le 401 est l'etat ATTENDU d'un endpoint qui
// attend une clef: il dit « routeur vivant ». Le 404 de Groq dit « inventaire des
// modeles non public » — ce n'est pas une panne, mais cela rend la voie
// d'inventaire INVÉRIFIABLE, donc le fournisseur n'est pas retenu aujour'hui.

import type { FournisseurBlanc } from "./types.js";

export const FOURNISSEURS_BLANCS: readonly FournisseurBlanc[] = [
  { nom: "OpenAI",    domaine: "openai.com",
    urlBase: "https://api.openai.com",        inventaire: "clef-requise" },
  { nom: "Mistral",   domaine: "mistral.ai",
    urlBase: "https://api.mistral.ai",        inventaire: "clef-requise" },
  { nom: "Anthropic", domaine: "anthropic.com",
    urlBase: "https://api.anthropic.com",     inventaire: "clef-requise" },
  { nom: "Cohere",    domaine: "cohere.com",
    urlBase: "https://api.cohere.com",        inventaire: "clef-requise" },
  { nom: "DeepSeek",  domaine: "deepseek.com",
    urlBase: "https://api.deepseek.com",      inventaire: "clef-requise" },
];

/** Le nom d'un domaine, nu, tel qu'il est ecrit dans la liste. */
function domaineNu(brut: string): string {
  return brut.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** UN SEUL juge d'admission, utilise par l'enregistrement ET par la generation.
 *  Comparaison par EGALITE EXACTE du domaine: une URL de type
 *  `openai.com.evil.com` doit echouer (elle a ete mesuree au test). */
export function estBlanc(entree: string): boolean {
  const d = domaineNu(entree ?? "");
  if (d === "") return false;
  return FOURNISSEURS_BLANCS.some((f) => f.domaine === d);
}

/** La recherche dans la liste, pour le reglage (nom + base + etat verifie). */
export function chercheFournisseur(entree: string): FournisseurBlanc | undefined {
  const d = domaineNu(entree ?? "");
  return FOURNISSEURS_BLANCS.find((f) => f.domaine === d);
}
