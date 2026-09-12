import { jsonrepair } from "jsonrepair";

// Résultat d'un parse JSON LLM (objet arbitraire).
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Réponse LLM arbitraire (objets avec champs dynamiques selon le prompt).
export type LlmResponse = Record<string, unknown>;

// Shape attendu des réponses d'extraction de documents (factures, labels HACCP,
// fiches techniques). Les LLM répondent en JSON avec ces champs.
export interface ExtractedDocumentData {
  source_image_url?: string;
  product?: string;
  lot?: string;
  dlc?: string;
  allergens?: string[];
  type?: string;
  supplier?: string;
  date?: string;
  total_amount?: number;
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// Parse du JSON renforcé : si le JSON brut est invalide, on tente une réparation
// via jsonrepair avant de jeter l'erreur.
export function safeJsonParse(text: string): JsonValue {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      const repaired = jsonrepair(text);
      console.log("[JSONREPAIR] Repaired malformed JSON from LLM.");
      return JSON.parse(repaired);
    } catch (e2) {
      throw e;
    }
  }
}

// Convertisseur de prix fournisseur → prix par référence inventaire.
export function backendGetCostModifier(unit?: string) {
  const u = (unit || "").toLowerCase().trim();
  if (u === "g" || u === "ml") return 0.001;
  if (u === "cl") return 0.01;
  if (u === "mg") return 0.000001;
  return 1;
}

/**
 * Les unites que le convertisseur de prix sait reellement convertir.
 *
 * backendGetCostModifier renvoie **1 pour n'importe quelle chaine qu'il ne
 * connait pas**. C'est le defaut le plus tranquille de la chaine: `calculatePricePerRef
 * (1000, "kaz", "kg")` rend 1000, exactement comme si l'unite avoit ete "kg"
 * (mesure: S3_CALC_INCONNU=1000 pour S3_CALC_KG=1000). Un prix par "casier" se
 * confronte donc a un prix au "kilogramme" et la comparaison de fournisseurs
 * designe un gagnant sur une comparaison SANS SENS.
 *
 * On ne ferme PAS un enum: la saisie reelle du cuisinier vient d'une facture
 * ("bouteille", "pce", "sachet"), et une liste autorisee rejetterait le client
 * avec un 400 impeccable. On rend seulement l'inconvertible **NON MUET**: ce
 * helper repond a la question que le convertisseur refusait de poser.
 */
export const FAMILLES_MASSIQUE = ["kg", "g", "mg"];
export const FAMILLES_VOLUME = ["l", "cl", "ml"];
export const UNITES_CONNUES = [...FAMILLES_MASSIQUE, ...FAMILLES_VOLUME];

const normaliser = (u: string) => (u || "").toLowerCase().trim();

export function familleDe(unit: string): "masse" | "volume" | "autre" {
  const u = normaliser(unit);
  if (FAMILLES_MASSIQUE.includes(u)) return "masse";
  if (FAMILLES_VOLUME.includes(u)) return "volume";
  return "autre";
}

/**
 * Vrai seulement si comparer ces deux unites est DEFENDABLE: la meme unite, ou
 * deux unites de la mme famille (ou l'on connait le rapport exact). Le reste
 * renvoie false, et le routeur ecrit alors un `null` que l'ecran peut marquer
 * « non comparable » au lieu d'aligner un nombre invente.
 */
export function estConvertible(supplierUnit: string, inventoryUnit: string): boolean {
  const su = normaliser(supplierUnit);
  const iu = normaliser(inventoryUnit);
  if (su === "" || iu === "") return false;
  if (su === iu) return true;
  const f1 = familleDe(su);
  const f2 = familleDe(iu);
  return f1 !== "autre" && f1 === f2;
}

/**
 * Lecture d'un booleen qui ne se DEVINE pas par truthiness.
 *
 * L'ancien code faisait `is_verified_from_invoice ? 1 : 0`. Or la chaine
 * "false" est VRAIE en JavaScript: un <input type="hidden">, une forme HTML ou
 * un client qui serialise mal transformait donc un prix NON verife en prix
 * VERIFIE, et ce badge est exactement ce sur quoi le chef decide de faire
 * confiance au tarif relev sur facture. Le mot vide, null et undefined sont
 * "absent" (donc 0) et ne sont pas une faute; tout ce qui n'est ni un booleen ni
 * une de ces chaines est refuse (et le routeur nomme le champ).
 */
export function lireBooleen(valeur: unknown): number | typeof REJETE_BOOLEAN {
  if (valeur === undefined || valeur === null || valeur === "") return 0;
  if (typeof valeur === "boolean") return valeur ? 1 : 0;
  if (typeof valeur === "number") return valeur !== 0 ? 1 : 0;
  if (typeof valeur === "string") {
    const v = valeur.trim().toLowerCase();
    if (["true", "1", "oui", "yes", "vrai"].includes(v)) return 1;
    if (["false", "0", "non", "no", "faux"].includes(v)) return 0;
  }
  return REJETE_BOOLEAN;
}

export const REJETE_BOOLEAN = Symbol("booleen-rejete");

/**
 * LE NOMBRE DE PRIX EST UN SEUL TYPE, ET IL A TROIS PORTES.
 *
 * Une regle metier jugee par la voie d'ecriture unitaire (POST /api/supplier-prices)
 * n'est pas la regle du produit si deux autres portes ecrivent la MEME colonne
 * sans elle: src/routes/documents.ts:199-215 (la validation de FACTURE) fait
 * `Number(item.unit_price)` SANS AUCUN CONTROLE et force `is_verified_from_invoice
 * = 1`. Mesure par scripts/probe-documents-validate-contract.mjs:
 *   D1_PRIX_STOCK=-12 D1_BADGE_VERIFIE=1
 * soit un prix NEGATIF certifie « releve sur facture » — la forme la plus chere
 * du defaut, parce que ce badge est exactement ce sur quoi le chef DECIDE de
 * croire un tarif. (Un credit n'est pas un prix: il remporte de plus la
 * comparaison au meilleur prix a chaque fois.)
 *
 * Le texte non numerique, lui, faisait MEURIR la validation en 500
 * (D3_VALIDE_CODE=500): node-sqlite3 JETTE sur un binding NaN, et l'operateur
 * voyait « Validation failed » sans savoir quelle ligne corriger.
 *
 * Donc: une SEULE predicat, partagee par les trois portes. `null` = « ce
 * n'est pas un nombre de prix » (l'appelant nomme la ligne fautive), et le 0
 * LEGITIME (« ce produit est offert », saisi comme un nombre) reste ACCEPTÉ —
 * il ne doit pas etre confondu avec le residu d'un parse rate, qui est lui un
 * `null` et non un 0.
 */
export const PRIX_MAX = 1_000_000;

export function prixOuNul(brut: unknown): number | null {
  let n: number;
  if (typeof brut === "number") n = brut;
  else if (typeof brut === "string" && brut.trim() !== "") n = Number(brut.trim());
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > PRIX_MAX) return null;
  return n;
}

export function calculatePricePerRef(rawPrice: number, supplierUnit: string, inventoryUnit: string) {
  const su = (supplierUnit || "").toLowerCase().trim();
  const iu = (inventoryUnit || "").toLowerCase().trim();
  if (su === iu) return rawPrice;
  const supplierMod = backendGetCostModifier(su);
  const inventoryMod = backendGetCostModifier(iu);
  return rawPrice * (inventoryMod / supplierMod);
}

export interface OllamaUrlSettings {
  ollama_url?: string;
}

export function getOllamaHost(s: OllamaUrlSettings | null) {
  if (s && s.ollama_url) {
    try {
      const url = new URL(s.ollama_url);
      return `${url.protocol}//${url.host}`;
    } catch (e) {
      return s.ollama_url!.replace(/\/api\/generate\/?$/, "").replace(/\/api\/?$/, "");
    }
  }
  return "http://localhost:11434";
}
