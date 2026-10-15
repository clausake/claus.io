// L'assistant de premier demarrage (Sprint 15, Tache 10) — le noyau juge.
//
// La regle cardinale du sprint, rappelee ici parce que c'est ELLE qui decide
// du design : « le moteur OCR determine, le cerveau LLM ne fait que ranger ».
// L'epreuve du demarrage est donc jugee par l'OCR SEUL, sur la piece du banc
// (test/banc/facture-synthetique.png, scelle 876842cba13f, source de verite de
// toutes les gardes). Aucun LLM n'y participe : un LLM qui « complete » un
// champ manquant transforme une defaillance d'installation en faux succes.
//
// LA VOIE REELLE est injectee (la lecon des portes vivantes, tache 8) : la
// route lui passe le VRAI moteur Paddle ; le banc lui passe un lecteur
// fabrique via COOKDRIVE_EPREUVE_LECTEUR (chemin d'un module .mjs exportant
// `lire()`). Sans injectee, la porte jugerait l'etat d'infrastructure d'autrui
// — et l'OCR complet sur 18 bandes trainerait la course des portes.
//
// L'etat machine est strict : SANS epreuve reussie, le demarrage n'est pas
// acquis (contrat, etape 3) — `consignerDemarrage` refuse et NOMME le refus.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { updateSettings } from "./settings.js";

export interface AttenteEpreuve {
  readonly champ: string;
  readonly texte: string;
}

export interface VerdictEpreuve {
  readonly reussi: boolean;
  readonly score: string;          // `n/N` — jamais un pourcentage arrondi
  readonly manquants: string[];    // les CHAMPS nommes, jamais un total nu
  readonly defaut?: string;        // EPREUVE_MUETTE | EPREUVE_IMPROUVABLE | PIECE_ABSENTE
  readonly detail?: string;
}

/** Ou vivent la piece et ses attendus. Emballe : resourcesPath (Electron,
 *  via extraResources) ; dev : le banc lui-meme, sous git. */
export function cheminPiece(nom: string): string {
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath;
  const candidats = rp
    ? [path.join(rp, "assistant", nom), path.join(process.cwd(), "test", "banc", nom)]
    : [path.join(process.cwd(), "test", "banc", nom), path.join("resources", "assistant", nom)];
  for (const c of candidats) if (fs.existsSync(c)) return c;
  return candidats[0]; // le premier, pour que la faute nommee cite un chemin honnete
}

export function attendusEpreuve(): AttenteEpreuve[] {
  const p = cheminPiece("facture-synthetique.attendus.json");
  const brut = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
  return Object.entries(brut).map(([champ, texte]) => ({ champ, texte }));
}

/** Le juge par LIGNES SEPAREES (la retractation 1 du contrat : le juge fondu
 *  rendoit 6/7 sur une piece lue 7/7 — le SIRET passe sur deux lignes). Une
 *  ligne attendue est ATTEINTE si une ligne rendue, normalisee en espaces
 *  simples, lui est EGALE ou la CONTIENT. Le texte vide n'est jamais « la
 *  piece est vide » : c'est une epreuve MUETTE, un defaut. */
export function jugerEpreuve(lignes: readonly string[],
                             attendus: readonly AttenteEpreuve[]): VerdictEpreuve {
  const norme = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
  const rendues = lignes.map(norme).filter((l) => l !== "");
  if (rendues.length === 0) {
    return { reussi: false, score: `0/${attendus.length}`, manquants: attendus.map((a) => a.champ),
             defaut: "EPREUVE_MUETTE" };
  }
  const manquants: string[] = [];
  for (const a of attendus) {
    const cible = norme(a.texte);
    if (!rendues.some((l) => l === cible || l.includes(cible))) manquants.push(a.champ);
  }
  const atteint = attendus.length - manquants.length;
  return { reussi: manquants.length === 0, score: `${atteint}/${attendus.length}`, manquants };
}

// ————— L'etat machine du demarrage (par processus serveur, persiste en settings).

export interface EtatAssistant {
  readonly install_termine_le: string | null;
  readonly fournisseur_choisi: string | null;
  readonly epreuve_acquise: boolean;
}

/** L'epreuve reussie du processus courant. Volontairement EN MEMOIRE : une
 *  eprouve qui « reussirait » d'un redemarrage a l'autre sans relire la piece
 *  serait un certificat herite, pas une preuve du jour. */
let epreuveDuJour: { le: string; score: string } | null = null;

export function etatAssistant(): EtatAssistant {
  const s = settingsStoreAssistant();
  return {
    install_termine_le: (s.install_termine_le as string | undefined) ?? null,
    fournisseur_choisi: (s.fournisseur_choisi as string | undefined) ?? null,
    epreuve_acquise: epreuveDuJour !== null,
  };
}

// Indirection pour le test : le service lit les reglages par la store du
// service settings, et ecrit par updateSettings — jamais par un fs direct.
import { settingsStore } from "./settings.js";
function settingsStoreAssistant() { return settingsStore.value; }

/** Le lecteur reel : le moteur Paddle sur la piece du banc. */
async function lirePiece(): Promise<string[]> {
  const piece = cheminPiece("facture-synthetique.png");
  if (!fs.existsSync(piece)) throw new Error(`PIECE_ABSENTE: ${piece}`);
  const { lireTexte } = await import("../shared/ocr.js");
  const lu = await lireTexte(piece, { moteur: "paddle" });
  return lu.lignes;
}

/** La voie injectee par le banc (deterministe, hors infrastructure d'autrui). */
async function lecteurFabrique(): Promise<(() => Promise<string[]>) | null> {
  const cible = process.env.COOKDRIVE_EPREUVE_LECTEUR;
  if (!cible || cible === "") return null;
  const absolu = path.isAbsolute(cible) ? cible : path.resolve(process.cwd(), cible);
  // L'URL file:// est la voie d'import ESM d'un chemin absolu (le chemin nu
  // leve « Unexpected token ':' » — mesure du 26/09 ; la faute etait une
  // annotation TS dans un .mjs du banc, pas le chargeur : un .mjs reste du JS).
  const mod = await import(pathToFileURL(absolu).href);
  if (typeof mod.lire !== "function") throw new Error(`LECTEUR_SANS_lire: ${cible}`);
  return () => mod.lire() as Promise<string[]>;
}

export async function jouerEpreuve(): Promise<VerdictEpreuve> {
  let lignes: string[];
  try {
    const fabrique = await lecteurFabrique();
    lignes = await (fabrique ?? lirePiece)();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.startsWith("PIECE_ABSENTE"))
      return { reussi: false, score: "0/0", manquants: [], defaut: "PIECE_ABSENTE", detail: msg };
    return { reussi: false, score: "0/0", manquants: [], defaut: "EPREUVE_IMPROUVABLE", detail: msg };
  }
  const v = jugerEpreuve(lignes, attendusEpreuve());
  if (v.reussi) epreuveDuJour = { le: new Date().toISOString(), score: v.score };
  return v;
}

/** Consigner le demarrage — SEULEMENT si l'epreuve est acquise dans CE
 *  processus (contrat : « Sans epreuve reussie, le demarrage n'est pas
 *  acquis »). Les noms de champs sont ceux du contrat, normalises :
 *  `install_termine_le` + `fournisseur_choisi` (le contrat porte la coquille
 *  « fourisseur_choisi », corrigee ici et consigne au journal — le document
 *  est plein de coquilles OCR, ses CHAMPS jugent, pas ses fautes de frappe). */
export function consignerDemarrage(fournisseur: string):
    { ok: true; etat: EtatAssistant } | { ok: false; defaut: string } {
  // L'entree d'abord, l'etat ensuite : une saisie invalide est invalide que
  // l'epreuve soit jouee ou non — rendre EPREUVE_NON_ACQUISE sur un champ
  // vide cacherait la vraie faute a l'opérateur.
  if (typeof fournisseur !== "string" || fournisseur.trim() === "")
    return { ok: false, defaut: "FOURNISSEUR_ABSENT" };
  // La voie « sans IA » (contrat produit : le logiciel est complet en saisie
  // manuelle) : on consigne un demarrage SANS intelligence equipee, donc
  // SANS epreuve — l'epreuve juge la lecture OCR, il n'y a rien a juger quand
  // on n'a pas de moteur. Le choix reste revocable dans les Reglages.
  if (fournisseur.trim().toLowerCase() === "sans") {
    updateSettings({
      install_termine_le: new Date().toISOString(),
      fournisseur_choisi: "sans",
      llm_choix: "sans",
    });
    return { ok: true, etat: etatAssistant() };
  }
  if (epreuveDuJour === null) return { ok: false, defaut: "EPREUVE_NON_ACQUISE" };
  updateSettings({
    install_termine_le: epreuveDuJour.le,
    fournisseur_choisi: fournisseur.trim(),
  });
  return { ok: true, etat: etatAssistant() };
}

/** La morsure de test : remise a zero de l'epreuve (le banc prouve que
 *  consigner sans jouer rougit). Exposee AUSSI par la route sous ?test=. */
export function reinitialiserEpreuve(): void { epreuveDuJour = null; }
