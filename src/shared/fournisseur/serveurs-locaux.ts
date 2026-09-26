// Le moteur de recherche de l'IA locale (Sprint 15, Tache 8).
//
// LE PARTI DECLARE DU CONTRAT (tache 8 point 2) : on n'embarque PAS un binaire
// de 100 Mo dans l'installeur. Le livrable livre le MOTEUR DE RECHERCHE : il
// detecte les serveurs deja installes sur les ports d'usage par
// `GET <base>/v1/models`, et les rend au menu des Reglages (Tache 9).
// L'utilisateur installe a son choix le moteur de son choix ; l'assistant
// (Tache 10) l'y conduit par une epreuve jugee.
//
// MESURE DE L'EXISTANT sur ce poste (26/09, `command -v`) : llama-server,
// llama-cli, llama-bench, exllama-server, vllm-server ABSENTS ; Ollama present
// (/usr/local/bin/ollama) et SES MODELES VIDES (`ollama list` ne rend que
// l'en-tete). Le detecteur est donc ecrit pour un poste ou RIEN ne repond —
// c'est l'etat normal d'installation, pas une exception.
//
// JAMAIS UN TABLEAU DE BORD MUET (tache 8 point 4) : si aucun serveur n'est
// trouve, le produit rend MESSAGE_AUCUN_MOTEUR — les trois voies de recours,
// nommees. Un appelant qui ignore le resultat vide n'a pas fini sa tache :
// il doit rendre le message.

import type { Modele } from "./types.js";

/** Les trois emplacements mesures du contrat : Ollama 11434, llama.cpp 8080
 *  et 1234 (le second est le port d'usage de llama-server en deployment
 *  multi-modeles). Un serveur hors de ces ports n'est PAS devine. */
export const PORTS_USAGE = [
  { port: 11434, moteur: "ollama" as const },
  { port: 8080, moteur: "llamacpp" as const },
  { port: 1234, moteur: "llamacpp" as const },
];

export interface ServeurLocal {
  readonly moteur: "ollama" | "llamacpp";
  readonly port: number;
  readonly urlBase: string;
  /** L'inventaire rendu par GET /v1/models. Vide si le serveur ne publie
   *  pas son inventaire (404 = etat LICITE, mesure du 25/09, pas une panne). */
  readonly modeles: Modele[];
}

/** La voie de sortie reelle, INJECTABLE au test (la regle du transport injecte,
 *  tache 4 : un test unitaire ne touche JAMAIS le reseau). */
export type FetchModeles = (url: string, delaiMs: number) =>
  Promise<{ status: number; json(): Promise<unknown> }>;

/** Le delai par defaut : un serveur local qui ne repond pas en 1,5 s n'est
 *  pas « lent », il n'est pas la. Mesure : un port libre refuse en ~0 ms,
 *  un serveur vivant repond en ~5 ms. 1,5 s couvre un demarrage a froid. */
export const DELAI_SONDE_MS = 1500;

/** La voie reelle (celle du produit). Les tests n'y ont pas droit. */
const fetchReel: FetchModeles = (url, delaiMs) =>
  fetch(url, { signal: AbortSignal.timeout(delaiMs) });

/** La forme de reponse de GET /v1/models est LUE sans rien presumer (la lecon
 *  du spike OCR : un champ presume est un champ qui casse). OpenAI-compatible
 *  rend `{data:[{id|model:"..."}]}` ; on accepte `data` OU `models`, et `id`
 *  OU `model`. Toute autre forme rend un inventaire VIDE, jamais une erreur. */
export function modelesDeLaReponse(corps: unknown): Modele[] {
  const c = corps as Record<string, unknown> | null;
  const brut = Array.isArray(c?.["data"]) ? c!["data"]
             : Array.isArray(c?.["models"]) ? c!["models"]
             : null;
  if (brut === null) return [];
  const rendus: Modele[] = [];
  for (const m of brut) {
    const nom = typeof m === "string" ? m
      : typeof (m as Record<string, unknown>)?.["id"] === "string"
        ? String((m as Record<string, unknown>)["id"])
        : typeof (m as Record<string, unknown>)?.["model"] === "string"
          ? String((m as Record<string, unknown>)["model"])
          : null;
    if (nom !== null && nom.trim() !== "") rendus.push({ nom });
  }
  return rendus;
}

/** Sonde les trois ports d'usage et rend CEUX QUI ONT REPONDU. Un port qui
 *  refuse, meurt ou rend un corps inintelligible n'est PAS un serveur : il
 *  n'apparait pas. Un 404 EST un serveur (inventaire non public). */
export async function detecterServeursLocaux(
  fetchModeles: FetchModeles = fetchReel,
  delaiMs: number = DELAI_SONDE_MS,
): Promise<ServeurLocal[]> {
  const trouves: ServeurLocal[] = [];
  for (const { port, moteur } of PORTS_USAGE) {
    const urlBase = `http://127.0.0.1:${port}`;
    try {
      const r = await fetchModeles(`${urlBase}/v1/models`, delaiMs);
      if (r.status === 404) {
        // Etat LICITE mesure (inventaire non public) : le serveur est vivant.
        trouves.push({ moteur, port, urlBase, modeles: [] });
        continue;
      }
      if (r.status < 200 || r.status >= 300) continue; // pas un serveur
      let corps: unknown = null;
      try { corps = await r.json(); } catch { continue; } // corps pourri ≠ serveur
      trouves.push({ moteur, port, urlBase, modeles: modelesDeLaReponse(corps) });
    } catch {
      // refuse / meurt / delai depasse : absent. Pas une panne du produit.
      continue;
    }
  }
  return trouves;
}

/** Le message rendu quand la liste est VIDE (tache 8 point 4). Nomme les
 *  TROIS voies de recours — jamais un tableau muet. C'est une constante du
 *  produit (les Reglages et l'assistant la rendent telle quelle ; les cinq
 *  langues suivront a la tache 9 via TRANSLATIONS). */
export const MESSAGE_AUCUN_MOTEUR: string =
  "AUCUN_MOTEUR_TROUVE — aucun serveur d'IA locale n'a repondu sur les "
  + "ports d'usage (11434, 8080, 1234). Trois voies de recours :\n"
  + "1. llama.cpp : installez `llama-server` et lancez-le sur le port 8080 "
  + "ou 1234 avec votre modele.\n"
  + "2. Ollama : installez `ollama`, puis `ollama pull <modele>` et "
  + "`ollama serve` (port 11434).\n"
  + "3. Service en ligne : Choisissez un fournisseur de la liste blanche "
  + "dans les Reglages (clef requise, stockee dans le trousseau).";

/** La voie du produit : detecte, et REND le message quand rien n'est trouve.
 *  Les Reglages (tache 9) et l'assistant (tache 10) appellent CETTE fonction,
 *  jamais `detecterServeursLocaux` directement — c'est ici que le tableau
 *  muet est interdit. */
export async function etatMoteurLocal(fetchModeles?: FetchModeles):
  Promise<{ serveurs: ServeurLocal[]; message: string | null }> {
  const serveurs = await detecterServeursLocaux(fetchModeles);
  return serveurs.length === 0
    ? { serveurs: [], message: MESSAGE_AUCUN_MOTEUR }
    : { serveurs, message: null };
}
