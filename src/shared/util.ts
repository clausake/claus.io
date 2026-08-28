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
