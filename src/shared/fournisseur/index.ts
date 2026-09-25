// Le routage des fournisseurs (Sprint 15, Tache 4).
//
// La chaine de resolution est: LOCAL -> LOCAL -> SECOURS, et le repli est
// EXPLICITE. Une reponse rend toujours `source` (qui a repondu) et `repli`
// (a-t-on du changer d'avis). Un `source` muet est interdit: sans lui, un
// utilisateur croit parler a son modele local pendant qu'un prestataire en ligne
// a repondu a sa place, avec ses donnees.
//
// Le transport (l'appel HTTP reel) est INJECTE. Un test unitaire ne doit jamais
// dépendre du reseau: on lui passe un faux transport, et le juge reste le juge.

import type {
  FournisseurBlanc, FournisseurLLM, RequeteGeneration, ReponseGeneration,
  Sonde, Modele,
} from "./types.js";
import { FournisseurInconnu } from "./types.js";
import { estBlanc, chercheFournisseur, FOURNISSEURS_BLANCS } from "./blanc.js";

// Le module est la SEULE porte d'entree du reste du produit: il re-exporte la
// surface complete, sinon l'appelant qui ecrit `import { FOURNISSEURS_BLANCS }
// from ".../fournisseur/index.js"` recoit `undefined` en silence (faute mesuree
// du 25/09: cinq tests rouges pour une re-exportation oubliee).
export type {
  FournisseurBlanc, FournisseurLLM, RequeteGeneration, ReponseGeneration,
  Sonde, Modele, InventaireModeles, ReglageFournisseur,
} from "./types.js";
export { FournisseurInconnu } from "./types.js";
export { FOURNISSEURS_BLANCS, estBlanc, chercheFournisseur } from "./blanc.js";

/** Le transport est la voie par ou l'on fait l'appel reel. Injectee au test. */
export type Transport = (
  urlBase: string, clef: string, requete: RequeteGeneration,
) => Promise<string>;

export class Fournisseur implements FournisseurLLM {
  readonly nom: string;
  readonly domaine: string;
  /** Le modele regle (un NOM de modele — jamais le `format` de la requete). */
  readonly modele: string;

  /** Le CONSTRUCTEUR est le premier juge: hors liste, on ne construit rien.
   *  La liste est fermee, la liste est blanche, la liste est la liste. */
  constructor(reglage: { nom: string; domaine: string; modele?: string },
              private transport?: Transport) {
    const blanc = chercheFournisseur(reglage.domaine);
    if (blanc === undefined) throw new FournisseurInconnu(reglage.domaine);
    this.nom = blanc.nom;
    this.domaine = blanc.domaine;
    this.modele = reglage.modele ?? "";
  }

  async generer(requete: RequeteGeneration): Promise<ReponseGeneration> {
    // Le constructeur a deja refuse le hors-liste; on ne verifie pas deux fois.
    if (!estBlanc(this.domaine)) throw new FournisseurInconnu(this.domaine);
    if (this.transport === undefined) {
      // Aucun transport injecte et aucun adaptateur installe: on ne peut pas
      // faire l'appel. On lever plutot que de rendre un texte « vu ».
      throw new Error(`transport absent pour le fournisseur ${this.nom}`);
    }
    const blanc = chercheFournisseur(this.domaine) as FournisseurBlanc;
    const texte = await this.transport(blanc.urlBase, "", requete);
    // Un texte vide n'est pas une reponse: il doit etre non vide et non muet.
    if (texte.trim() === "") throw new Error(`generation muette: ${this.nom}`);
    return { texte, source: this.nom, repli: false, modele: this.modele };
  }

  async listerModeles(): Promise<Modele[]> {
    const blanc = chercheFournisseur(this.domaine) as FournisseurBlanc;
    // Un inventaire « non public » (404 mesure) est un etat LICITE: on rend la
    // liste vide, on ne rend pas une erreur et on ne rend rien d'invente.
    if (blanc.inventaire === "non-public" || blanc.inventaire === "inconnu") return [];
    return [];
  }

  async sonde(): Promise<Sonde> {
    const t0 = Date.now();
    if (!estBlanc(this.domaine)) {
      return { vivant: false, defaut: "HORS_LISTE_BLANCHE", duree_ms: Date.now() - t0 };
    }
    return { vivant: true, duree_ms: Date.now() - t0 };
  }
}

/** Le reglage lu, le fournisseur resolue. Trois voies, trois attentes (Tache 4). */
export interface ResolutionFournisseur {
  readonly fournisseur: FournisseurLLM;
  readonly source: string;
  readonly repli: boolean;
  readonly defaut?: string;
}
