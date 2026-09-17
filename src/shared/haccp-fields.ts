// Source UNIQUE des regles de forme du domaine HACCP (releves de temperature,
// lots de traçabilitee, nettoyages, actions correctives, capteurs IoT).
//
// POURQUOI CE MODULE EXISTE. Le domaine HACCP est le seul du produit qui porte
// une OBLIGATION REGLEMENTAIRE (regl. (CE) n°852/2004 art. 5 : l'exploitant doit
// pouvoir presenter les releves et les actions correctives). Ses routes
// d'ecriture etaient les dernieres du depot a ne pas passer par un contrat :
// elles acceptoient un texte dans la colonne REAL `temperature`, un lot trace a
// 0 kg, une clef d'article inexistante. Et ce qui rendait le defaut invisible :
// les VOIES DE LECTURE de ces tables sont des JOIN internes (`batches` ->
// `inventory`, `production_records` -> `recipes`), donc une ligne dont la clef
// ne joint rien ne rend pas une erreur : elle DISPARAIT de l'ecran du chef, qui
// croit avoir enregistre.
//
// Comme dans src/shared/inventory-fields.ts, une borne recopiee dans trois
// fichiers se perime en silence (lecon des BUDGETS de audit-perf.mjs) : les
// bornes et les enums vivent ICI et sont lus par CHAQUE porte d'ecriture de la
// table. Les TROIS portes de `batches` (POST /api/haccp/batches, POST
// /api/haccp/scan, POST /api/documents/upload) lisent les memes regles.
//
// ⚠ SUR LES ENUMS. Ils se jugent contre ce que les EMETTEURS REELS y deposent,
// non contre l'UI : `entry_type` et `sensor_mode` ne sont jamais envoyes par
// l'ecran (relus a l'octet), ils sont poses par les littéraux SQL des routes et
// par les DEFAULT de la migration. Omettre une valeur que le produit ecrit
// lui-même produirait un 400 sur une saisie legitime du chef — un 400
// impeccable qui casse le client (la lecon du 'active' de l'inventaire).
import { randomBytes } from "crypto";
import { lireNombre, lireTexte, estNombreExploitable, COLONNE_TEXTE_MAX } from "./inventory-fields.js";

export { lireNombre, lireTexte, estNombreExploitable, COLONNE_TEXTE_MAX };

// Une releve de temperature de cuisine professionnelle. La plage est celle des
// equipements que le produit sait nommer (congelateur -25, cellule de choc,
// four/sonot de cuisson) avec une marge : elle est ASSEZ large pour n'exclure
// aucun equipement reel et ASSEZ etroite pour refuser ce qui n'est pas une
// releve (un numero de teléphone colle dans le champ, un texte convertible).
export const TEMPERATURE_MIN = -60;
export const TEMPERATURE_MAX = 120;

// Meme principe pour la temperature a reception d'un lot: c'est la mesure qui
// prouve la chaine du froid, un nombre absurde rend la preuve fausse.
export const RECEPTION_TEMP_MIN = -40;
export const RECEPTION_TEMP_MAX = 90;

export const QUANTITE_LOT_MAX = 1_000_000;

// Les enums, saisis sur les EMETTEURS (selects de l'UI + litteraux SQL +
// DEFAULT de la migration), releves par scripts/probe-emuns-haccp.py :
//   type           : les <option> de Haccp.tsx + le DEFAULT 'ambient'
//   equipment_type : les <option> + le DEFAULT 'Froid'
//   entry_type     : les litteraux SQL des DEUX voies d'INSERT (la releve du
//                    chef est 'manuel', l'ingestion IoT est 'iot')
//   sensor_mode    : le litteral SQL 'online' et le DEFAULT de la migration
// 'offline' n'existe NULLE PART dans le source: l'omettre n'est donc pas une
// dette, et l'inclure sans emetteur serit une porte ouverte vers une valeur que
// personne ne produit ni ne lit.
export const TYPES_CAPTEUR = ["ambient", "probe", "blast_chiller"] as const;
export const TYPES_EQUIPEMENT = ["Froid", "Chaud", "Refroidissement"] as const;
export const TYPES_ENTREE = ["manuel", "iot"] as const;
export const MODES_CAPTEUR = ["online"] as const;

export type TypeCapteur = (typeof TYPES_CAPTEUR)[number];
export type TypeEquipement = (typeof TYPES_EQUIPEMENT)[number];
export type TypeEntree = (typeof TYPES_ENTREE)[number];

// Une clef de capteur: le produit les cree lui-même avec Math.random(), qui
// n'est PAS un generateur cryptographique. La clef protege l'ingestion d'une
// releve falsifiee (une releve de 4 °C ecrite a la main sur un congélateur a 21
// °C est une piece d'audit fausse), donc elle vient de crypto.randomBytes.
// 32 octets -> 43 caracteres base64url, bien au-dessus du minimum de 22 chars /
// 128 bits.
export const LONGUEUR_TOKEN_MIN = 22;

// Un identifiant de capteur saisi par le chef: borne basse = ce qui reste
// lisible dans un tableau, borne haute = ce qui tient dans une URL de webhook.
export const ID_CAPTEUR_MIN = 3;
export const ID_CAPTEUR_MAX = 80;

/** Le 400 du contrat: une liste de champs NOMMES, jamais un message vague. Le
 *  chef corrige la saisie visee; un 400 non nomme le fait revenir sur le
 *  formulaire entier. */
export type Rejet = { refused: string[]; error: string };

export function estRejete(champs: string[], motif?: string): false | Rejet {
  if (champs.length === 0) return false;
  return {
    refused: champs,
    error: motif
      ? `Saisie refusee (${champs.join(", ")}): ${motif}`
      : `Saisie refusee: ${champs.join(", ")}`,
  };
}

/** Un nombre de RELEVE. A la difference d'un nombre de saisie courant, `null`
 *  est ici un CAS DISTINCT et refuse: l'UI fait `parseFloat(champ)` et
 *  `JSON.stringify(NaN)` rend `null`, donc un champ de saisie laisse BLANC
 *  arrive au serveur comme `null`. Le traiter comme « absent » (et lui donner un
 *  defaut) ferait disparaitre une releve obligatoire du registre — exactement le
 *  defaut des KPI figes a 0 du Sprint 6. */
export function nombreDeReleve(
  brut: unknown,
  min: number,
  max: number,
): number | undefined {
  if (brut === null || brut === undefined) return undefined;
  const n = lireNombre(brut);
  return estNombreExploitable(n, min, max) ? n : undefined;
}

/** Une clef ETRANGERE. La regle est ici plus forte qu'ailleurs parce que la
 *  voie de LECTURE de ces tables est une JOIN interne: une clef qui ne joint
 *  rien produit une ligne QUE LE CHEF NE REVOIT JAMAIS, sans aucune erreur
 *  serveur (les FOREIGN KEY du schema sont decoratives: init.ts ne declenche
 *  aucun `PRAGMA foreign_keys`, verifie par sonde — un orphelin est ACCEPTE).
 *  Rend `undefined` pour que la route nomme le champ dans son 400. */
export function clefEtrangere(brut: unknown, maxLen = ID_CAPTEUR_MAX): string | undefined {
  const propre = lireTexte(brut, maxLen);
  if (propre === undefined) return undefined;
  // 'UNKNOWN'/'Inconnu' sont les valeurs que les voies OCR de l'app deposaient
  // quand la reconnaissance ne trouvait rien: elles passoint en base et la
  // JOIN les faisait disparaitre. Elles ne sont donc PAS acceptables ici.
  if (/^(unknown|inconnu|inconnue|null|undefined|0)$/i.test(propre)) return undefined;
  return propre;
}

/** Une date ISO complete (la colonne est un TEXT compare lexicographiquement:
 *  un '31/12/2025' ne se trie pas et ne se filtre pas, et le tableau de bord
 *  du chef le rend vide sans erreur). */
export function dateISO(brut: unknown): string | undefined {
  if (typeof brut !== "string") return undefined;
  const propre = brut.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(propre)) {
    return undefined;
  }
  return Number.isNaN(Date.parse(propre)) ? undefined : propre;
}

/** Une clef d'enum jugee contre les emetteurs. `null` (donc une saisie que
 *  l'UI n'a pas pu serialiser) est refuse; une ABSENCE recoit le defaut que la
 *  migration declare, jamais un `undefined` envoye au binding. */
export function clefEnum<T extends readonly string[]>(
  brut: unknown,
  allowed: T,
  defaut: T[number] | undefined,
): T[number] | undefined {
  if (brut === undefined) return defaut;
  if (typeof brut !== "string") return undefined;
  const propre = brut.trim();
  if (propre === "") return defaut;
  return (allowed as readonly string[]).includes(propre) ? (propre as T[number]) : undefined;
}

/** Une clef de webhook generee par le SERVEUR. Jamais un Math.random(): la clef
 *  est la seule preuve qu'une releve vient du capteur et non d'un poste du
 *  reseau, et `Math.random` est un PRNG previsible. 32 octets -> 43 caracteres
 *  base64url (au-dessus du minimum de 22 chars / 128 bits). */
export function newToken(): string {
  return randomBytes(32).toString("base64url").replace(/[=_-]/g, "").slice(0, 43);
}

export const COLONNE_TEXTE_HACCP_MAX = COLONNE_TEXTE_MAX;

/** Identifiant genere par le serveur (colonnes `id TEXT PRIMARY KEY` SANS
 *  auto-incrementation). Le domaine enregistroit ses ids avec Math.random():
 *  pour une clef de webhook c'etait le defaut (PRNG previsible), pour un id de
 *  ligne c'est surtout une collision possible a l'usage. base64url sans
 *  remplissage, 12 caracteres ~ 72 bits. */
export function nouvelId(): string {
  return randomBytes(12).toString("base64url").replace(/[=_-]/g, "").slice(0, 12);
}

/** L'horodatage canonical des registres (ISO 8601 UTC). La colonne est un TEXT
 *  compare lexicographiquement par les SELECT: un autre format casse l'ordre
 *  sans erreur serveur. */
export function maintenantISO(): string {
  return new Date().toISOString();
}
