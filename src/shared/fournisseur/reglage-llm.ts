// Le reglage LLM visible et son juge de verdict (Sprint 15, Tache 9).
//
// Le panneau « Intelligence » des Reglages (SettingsView.tsx) construit ses
// cibles et lit ses verdicts ICI — des fonctions pures, jouables au test
// unitaire sans reseau (la regle du transport injecte, tache 4). La route
// /api/llm/tester ne fait que jouer la sonde de la tache 5 sur la cible
// construite ici : le bouton « Tester » rejoue L'OUTIL VRAI, pas un cousin.
//
// Les regles blanches (decide du 25/09, rappel tache 4) :
//   - « en ligne » n'est PAS un champ URL libre : la base vient de la liste
//     blanche, l'URL saisie ne peut que la CONFIRMER, jamais la remplacer ;
//   - la clef d'API ne passe JAMAIS par ici : elle vient du seul environment
//     (la sonde la lit), elle n'est ni construite, ni lue, ni rendue.

import { FOURNISSEURS_BLANCS, chercheFournisseur } from "./blanc.js";

/** Les boutons du panneau, et ce que chacun ecrit dans `llm_choix` :
 *  `llamacpp`, `ollama`, ou le NOM en minuscules du fournisseur de la liste
 *  blanche (les valeurs de `ReglageFournisseur.llm_choix`, decide tache 1 —
 *  « en ligne » n'est pas une valeur libre, c'est un fournisseur NOMME). */
export type ChoixLlm = "llamacpp" | "ollama";

export interface ReglageLlmBrut {
  llm_choix?: string;
  llm_url?: string;
  llm_modele?: string;
}

export interface CibleSonde {
  /** Le nom rendu a l'ecran (jamais une clef). */
  readonly nom: string;
  readonly style: "openai" | "ollama";
  readonly base: string;
  readonly modele: string | null;
}

export const DEFAUT_OLLAMA = "http://127.0.0.1:11434";

export type ConstructionCible =
  | { readonly cible: CibleSonde }
  | { readonly defaut: string };

/** Du reglage lu a la cible de la sonde. Une cible qu'on ne peut pas
 *  construire est un DEFAUT NOMME, jamais une supposition : mieux vaut
 *  « CHOIX_ABSENT » dans le verdict qu'un appel a l'URL vide. */
export function cibleDuReglage(r: ReglageLlmBrut): ConstructionCible {
  const choix = (r.llm_choix ?? "").trim();
  const modele = (r.llm_modele ?? "").trim() || null;
  if (choix === "ollama") {
    const base = (r.llm_url ?? "").trim() || DEFAUT_OLLAMA;
    return { cible: { nom: "reglage", style: "ollama", base, modele } };
  }
  if (choix === "llamacpp") {
    const base = (r.llm_url ?? "").trim();
    // llama.cpp ne publie rien d'auto-detectable ici : sans URL, rien a sonder.
    if (base === "") return { defaut: "URL_ABSENTE" };
    return { cible: { nom: "reglage", style: "openai", base, modele } };
  }
  // « en ligne » : `llm_choix` est le NOM du fournisseur de la liste blanche
  // (openai | mistral | anthropic | cohere | deepseek, les valeurs du contrat).
  const blanc = FOURNISSEURS_BLANCS.find(
    (f) => f.nom.toLowerCase() === choix || f.domaine === choix
        || nomDeDomaine(f.domaine) === choix);
  if (blanc === undefined) {
    return { defaut: choix === "" ? "CHOIX_ABSENT" : "HORS_LISTE_BLANCHE" };
  }
  // L'URL saisie ne peut que confirmer la base blanche (la decision du
  // 25/09). Une URL differente est refusee NOMMEEMENT, pas ignoree.
  const urlSaisie = (r.llm_url ?? "").trim().replace(/\/+$/, "");
  if (urlSaisie !== "" && urlSaisie.toLowerCase() !== blanc.urlBase.toLowerCase()) {
    return { defaut: "URL_HORS_LISTE" };
  }
  return { cible: { nom: "reglage", style: "openai", base: blanc.urlBase, modele } };
}

/** `mistral.ai` -> `mistral` (le nom bas est l'usage de ReglageFournisseur). */
function nomDeDomaine(domaine: string): string {
  return domaine.split(".")[0];
}

/** L'argument de ligne de commande de la sonde pour cette cible (le format
 *  `nom|style|base[|modele]` mesure dans scripts/sonde-fournisseur.mjs). */
export function argvDeCible(c: CibleSonde): string[] {
  const morceaux = [c.nom, c.style, c.base];
  if (c.modele !== null && c.modele !== "") morceaux.push(c.modele);
  return [`--cible=${morceaux.join("|")}`];
}

/** Une ligne de cible rendue par la sonde :
 *  `SONDE VERT cible=X ... [defaut=D] [modele=M] [duree_ms=D]` */
export interface VerdictCible {
  readonly cible: string;
  readonly vivant: boolean;
  readonly defaut?: string;
  readonly modele?: string;
  readonly duree_ms?: number;
}

export interface VerdictSonde {
  readonly vivant: boolean;
  readonly cibles: VerdictCible[];
}

/** La sortie brute de la sonde, lue sans rien presumer : chaque ligne
 *  `SONDE VERT|ROUGE ...` devient un verdict nomme. Aucune ligne = verdict
 *  ROUGE (une sonde muette n'est pas une sonde verte — la regle des capteurs). */
export function parseSortieSonde(sortie: string): VerdictSonde {
  const cibles: VerdictCible[] = [];
  for (const ligne of sortie.split("\n")) {
    const m = /^SONDE (VERT|ROUGE) (.*)$/.exec(ligne.trim());
    if (m === null) continue;
    const vivant = m[1] === "VERT";
    const champs: Record<string, string> = {};
    for (const jeton of m[2].split(" ")) {
      const i = jeton.indexOf("=");
      if (i > 0) champs[jeton.slice(0, i)] = jeton.slice(i + 1);
    }
    const duree = Number(champs["duree_ms"]);
    cibles.push({
      cible: champs["cible"] ?? "?",
      vivant,
      ...(champs["defaut"] !== undefined ? { defaut: champs["defaut"] } : {}),
      ...(champs["modele"] !== undefined ? { modele: champs["modele"] } : {}),
      ...(Number.isFinite(duree) ? { duree_ms: duree } : {}),
    });
  }
  return { vivant: cibles.length > 0 && cibles.every((c) => c.vivant), cibles };
}

/** Les fournisseurs que le panneau peut proposer (nu, sans clef). */
export function fournisseursProposables(): Array<{ nom: string; domaine: string }> {
  return FOURNISSEURS_BLANCS.map((f) => ({ nom: f.nom, domaine: f.domaine }));
}

// L'index du module est la porte d'entree (la faute mesuree du 25/09 : une
// re-exportation oubliee rend l'appelant undefined en silence).
void chercheFournisseur;
