// Les types de la couche fournisseur (Sprint 15, Tache 1).
//
// Une seule surface de commande pour tout fournisseur de LLM, local ou en ligne.
// Le reste du produit ne parle JAMAIS a un fournisseur directement: il passe par
// cette interface, ce qui rend le choix de l'utilisateur (llamacpp / ollama /
// un prestataire en ligne) reglable sans toucher aux appels.

/** Le reglage d'un fournisseur de la liste blanche (scelle, non modifiable). */
export interface FournisseurBlanc {
  /** Nom rendu a l'ecran (jamais une clef secrete). */
  readonly nom: string;
  /** Domaine exact verifie le 25/09 (`GET <base>/v1/models` -> 401 = vivant). */
  readonly domaine: string;
  /** Base de l'URL, HTTPS seulement, sans clef dedans. */
  readonly urlBase: string;
  /** Comment la voie d'inventaire se comporte (mesuree, pas presumee). */
  readonly inventaire: InventaireModeles;
}

/** Trois etats LICITES, mesures du 25/09 — un 404 n'est PAS une panne. */
export type InventaireModeles =
  /** L'inventaire repond (200): on peut s'y fier pour choisir un modele. */
  | "public"
  /** 401: le routeur est vivant, la clef est attendue. Etat NORMAL sans clef. */
  | "clef-requise"
  /** 404: le fournisseur ne publie pas son inventaire. LICITE, non une panne. */
  | "non-public"
  /** Inconnu: la sonde n'a pas pu conclure (capteur mort sur cette voie). */
  | "inconnu";

/** Ce qu'on demande a un fournisseur: une generation, pas un texte "vu". */
export interface RequeteGeneration {
  readonly prompt: string;
  readonly systeme?: string;
  /** Images en base64 (la voie que l'API OpenAI ne porte pas uniformement). */
  readonly images?: string[];
  readonly temperature?: number;
  readonly max_tokens?: number;
  /** Force la sortie JSON quand l'extraction l'exige (anti-hallucination). */
  readonly format?: "json" | "texte";
}

/** Ce que le fournisseur rend. `source` n'est jamais muet (voir Tache 4). */
export interface ReponseGeneration {
  readonly texte: string;
  /** Le fournisseur QUI a repondu, et non celui qu'on avait choisi. */
  readonly source: string;
  /** Le repli a-t-il joue ? Rendu explicite, jamais devine. */
  readonly repli: boolean;
  /** Le modele qui a parle (nom rendu, pas un label). */
  readonly modele: string;
}

export interface Modele {
  readonly nom: string;
  readonly taille_params?: string;
}

/** L'etat de sante d'une sonde: une generation reelle, pas un ping. */
export interface Sonde {
  readonly vivant: boolean;
  readonly defaut?:
    | "MODELES_ABSENTS"
    | "GENERATION_MUETTE"
    | "DELAI_DEPASSE"
    | "CLEF_ABSENTE"
    | "HORS_LISTE_BLANCHE";
  readonly duree_ms: number;
}

/** La surface de commande unique. Trois methodes, et pas une de plus. */
export interface FournisseurLLM {
  readonly nom: string;
  generer(requete: RequeteGeneration): Promise<ReponseGeneration>;
  listerModeles(): Promise<Modele[]>;
  /** Une generation de 8 tokens, JAMAIS un `GET /v1/models` (Tache 5). */
  sonde(): Promise<Sonde>;
}

/** Les clefs de reglage ajoutees a AppSettings (Tache 1, etape 2).
 *  Aucune ne porte un secret en clair: la clef vit dans le coffre, pas ici. */
export interface ReglageFournisseur {
  /** Le moteur principal: `ollama` est le defaut (decide du 25/09). */
  // Chantier 11 : "vllm" (et tout serveur local OpenAI-compatible) rejoint
  // la liste — le nom "llamacpp" reste accepté pour les réglages existants.
  // "sans" (15/10) : la voie sans IA choisie au premier démarrage — l'app est
  // complète en saisie manuelle, `generer()` refuse avec IA_DESACTIVEE.
  llm_choix?: "llamacpp" | "ollama" | "vllm" | "openai" | "mistral" | "anthropic"
              | "cohere" | "deepseek" | "sans";
  llm_url?: string;
  llm_modele?: string;
  /** Le secours en ligne, en dernier recours seulement. */
  llm_secours?: string;
  ocr_moteur?: "paddle" | "tesseract";
  /** La locale DECLAREE de la piece (Tache 16): jamais inferee du contenu. */
  locale_piece?: string;
}

/** La faute levee quand un hors-liste veut generer (Tache 4). */
export class FournisseurInconnu extends Error {
  constructor(readonly domaine: string) {
    super(`fournisseur hors liste blanche: ${domaine || "(vide)"}`);
    this.name = "FournisseurInconnu";
  }
}
