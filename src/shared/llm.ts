// Le POINT UNIQUE de generation LLM (chantier 11).
//
// Avant : 12 routes métier appelaient ollama.generate() directement — le choix
// du fournisseur (Réglages > Intelligence) n'était effectif qu'au diagnostic
// (sonde), jamais à la génération.
//
// Apres : TOUTE génération passe ICI. La fonction lit le réglage `llm_choix`
// et dispatch :
//   - "ollama"      -> API native Ollama (vision incluse, repli Tesseract)
//   - "llamacpp"    -> API OpenAI /v1/chat/completions (llama.cpp-server,
//                      vLLM, SGLang, LM Studio — tous la même surface)
//   - fournisseur cloud de la liste blanche -> /v1/chat/completions + clef
//     lue dans l'environnement (JAMAIS stockée en base ni rendue à l'écran)
//
// Le CONTRAT de sortie est le même pour tous : une string non vide, ou une
// erreur NOMMÉE. Jamais un 200 muet, jamais un texte « vu » sans source.
//
// La VISION (images) : seul Ollama expose /api/generate avec images[] en
// natif. Les serveurs OpenAI-compatibles locaux (vLLM, llama.cpp) l'exposent
// via messages[].content multi-parties — supportés ici ; le repli Tesseract
// reste joué si le modèle refuse l'image.

import { ollama, getModel, ollamaSettingsRef, type OllamaSettings } from "./ollama.js";
import { FOURNISSEURS_BLANCS, chercheFournisseur } from "./fournisseur/blanc.js";
import { DEFAUT_OLLAMA } from "./fournisseur/reglage-llm.js";

/** Le réglage brut lu dans settingsStore (forme du POST /api/settings). */
export interface ReglageLlmActuel {
  llm_choix?: string;
  llm_url?: string;
  llm_modele?: string;
  // champs Ollama historiques (model_name, custom_model, ollama_url) :
  // conservés pour la compatibilité des réglages existants.
  model_name?: string;
  custom_model?: string;
  ollama_url?: string;
  [k: string]: unknown;
}

/** La demande de génération, forme unique quel que soit le serveur. */
export interface DemandeGeneration {
  prompt: string;
  system?: string;
  /** Image en base64 (vision). Seuls certains modèles l'acceptent. */
  image?: string | null;
  /** Force la sortie JSON (Ollama format="json" ; OpenAI response_format). */
  format?: "json" | "texte";
  temperature?: number;
  max_tokens?: number;
}

/** La réponse : texte non vide + la SOURCE RÉELLE qui a parlé. */
export interface ReponseLlm {
  texte: string;
  source: string;
  /** Le repli (Tesseract pour la vision) a-t-il joué ? Explicite, jamais deviné. */
  repli: boolean;
}

export class LlmInjoignable extends Error {
  constructor(readonly cible: string, readonly motif: string) {
    super(`LLM injoignable [${cible}] : ${motif}`);
    this.name = "LlmInjoignable";
  }
}

/** La clef d'API d'un fournisseur cloud : l'environnement SEULEMENT. Jamais
 *  la base, jamais l'écran. Le nom de variable est dérivé du fournisseur :
 *  OPENAI_API_KEY, MISTRAL_API_KEY, ... */
function clefEnvironnement(nomFournisseur: string): string | undefined {
  const variable = nomFournisseur.toUpperCase().replace(/[^A-Z0-9]/g, "") + "_API_KEY";
  return process.env[variable];
}

/** Le réglage actuel, lu depuis ollamaSettingsRef (le settingsStore). Les
 *  champs historiques (model_name/custom_model/ollama_url) restent lus pour
 *  ne pas casser les installations existantes. */
export function reglageActuel(): ReglageLlmActuel {
  const s = ollamaSettingsRef.current as OllamaSettings & ReglageLlmActuel;
  return s ?? {};
}

/** La génération : LA porte unique. Toute route métier passe ici. */
export async function generer(d: DemandeGeneration): Promise<ReponseLlm> {
  const r = reglageActuel();
  const choix = (r.llm_choix ?? "ollama").trim().toLowerCase();
  const temperature = d.temperature ?? 0.2;

  // 1. Ollama : le défaut, l'API native, la vision, le repli Tesseract.
  if (choix === "ollama" || choix === "") {
    const modele = getModel(ollamaSettingsRef.current);
    try {
      const oRes = await ollama.generate({
        model: modele,
        prompt: d.prompt,
        ...(d.system ? { system: d.system } : {}),
        ...(d.image ? { images: [d.image] } : {}),
        format: d.format === "json" ? "json" : undefined,
        options: { temperature, ...(d.max_tokens ? { num_predict: d.max_tokens } : {}) },
        stream: false,
      });
      if (!oRes.response || oRes.response.trim() === "") {
        throw new LlmInjoignable("ollama", "generation muette");
      }
      return { texte: oRes.response, source: modele, repli: false };
    } catch (e) {
      // La vision qui échoue (modèle sans image) : le repli Tesseract existant
      // dans generateWithOllama reste joué — même contrat qu'avant.
      if (d.image && e instanceof Error && e.message.includes("Failed to load image")) {
        const texte = await repliTesseract(d.image);
        if (texte.trim() !== "") return { texte, source: "tesseract", repli: true };
      }
      if (e instanceof LlmInjoignable) throw e;
      throw new LlmInjoignable(`ollama (${modele})`, String((e as Error)?.message ?? e));
    }
  }

  // 2. Un serveur local OpenAI-compatible : llama.cpp-server, vLLM, SGLang,
  //    LM Studio — tous exposent /v1/chat/completions. URL libre (localhost).
  if (choix === "llamacpp" || choix === "openai-compatible" || choix === "vllm") {
    const base = (r.llm_url ?? "").trim().replace(/\/+$/, "");
    if (base === "") throw new LlmInjoignable(choix, "URL_ABSENTE");
    const modele = (r.llm_modele ?? "").trim();
    const texte = await genererOpenAiCompatible(base, modele, d, temperature, choix);
    return { texte, source: `${choix} (${base})`, repli: false };
  }

  // 3. Un fournisseur cloud de la liste blanche : base VERROUILLÉE par la
  //    liste (l'URL saisie ne peut que la confirmer — jamais la remplacer),
  //    clef lue dans l'environnement uniquement.
  const blanc = FOURNISSEURS_BLANCS.find(
    (f) => f.nom.toLowerCase() === choix || f.domaine === choix,
  );
  if (blanc === undefined) {
    throw new LlmInjoignable(choix, "HORS_LISTE_BLANCHE");
  }
  const clef = clefEnvironnement(blanc.nom);
  if (clef === undefined || clef.trim() === "") {
    throw new LlmInjoignable(blanc.nom, "CLEF_ABSENTE");
  }
  const modele = (r.llm_modele ?? "").trim();
  const texte = await genererOpenAiCompatible(blanc.urlBase, modele, d, temperature, blanc.nom, clef);
  return { texte, source: blanc.nom, repli: false };
}

/** L'adaptateur /v1/chat/completions : la surface commune de tous les serveurs
 *  OpenAI-compatibles (locaux et cloud). Un seul endroit à maintenir. */
async function genererOpenAiCompatible(
  base: string,
  modele: string,
  d: DemandeGeneration,
  temperature: number,
  cible: string,
  clef?: string,
): Promise<string> {
  const contenu = d.image
    ? [
        { type: "text", text: d.prompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${d.image}` } },
      ]
    : d.prompt;
  const messages: Array<{ role: string; content: unknown }> = [];
  if (d.system) messages.push({ role: "system", content: d.system });
  messages.push({ role: "user", content: contenu });

  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(clef ? { authorization: `Bearer ${clef}` } : {}),
      },
      body: JSON.stringify({
        ...(modele ? { model: modele } : {}),
        messages,
        temperature,
        stream: false,
        ...(d.max_tokens ? { max_tokens: d.max_tokens } : {}),
      }),
    });
  } catch (e) {
    throw new LlmInjoignable(cible, `connexion impossible : ${String((e as Error)?.message ?? e)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new LlmInjoignable(cible, "CLEF_REFUSEE");
  }
  if (!res.ok) {
    throw new LlmInjoignable(cible, `HTTP_${res.status}`);
  }
  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = await res.json();
  } catch {
    throw new LlmInjoignable(cible, "REPONSE_NON_JSON");
  }
  const texte = json.choices?.[0]?.message?.content ?? "";
  if (texte.trim() === "") {
    throw new LlmInjoignable(cible, "generation muette");
  }
  return texte;
}

/** Le repli Tesseract (vision) — repris de generateWithOllama, même contrat. */
async function repliTesseract(imageBase64: string): Promise<string> {
  const buffer = Buffer.from(imageBase64, "base64");
  const Tesseract = (await import("tesseract.js")).default;
  const { data: { text } } = await Tesseract.recognize(buffer, "fra");
  return text;
}

/** La cible de diagnostic rendue à l'UI (le nom lisible du choix actuel). */
export function cibleActuelle(): string {
  const r = reglageActuel();
  const choix = (r.llm_choix ?? "ollama").trim().toLowerCase();
  if (choix === "ollama") return `Ollama (${(r.ollama_url ?? DEFAUT_OLLAMA)})`;
  if (choix === "llamacpp" || choix === "openai-compatible" || choix === "vllm") {
    return `${choix} (${r.llm_url ?? "URL non configurée"})`;
  }
  const blanc = chercheFournisseur(choix);
  return blanc ? blanc.nom : choix;
}
