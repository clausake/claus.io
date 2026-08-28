import { Ollama } from "ollama";
import Tesseract from "tesseract.js";
import { getOllamaHost } from "./util.js";

export interface OllamaSettings {
  model_name?: string;
  custom_model?: string;
  ollama_url?: string;
  language?: string;
  [key: string]: unknown;
}

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  images?: string[];
  format?: string;
  options?: { temperature?: number; top_p?: number; num_ctx?: number; num_predict?: number };
  [key: string]: unknown;
}

export interface OllamaModelInfo {
  name?: string;
  model?: string;
  [key: string]: unknown;
}

export function getModel(s: OllamaSettings | undefined) {
  if (!s) return "llama3.2-vision";
  if (s.model_name === "custom" && s.custom_model) {
    return s.custom_model;
  }
  return s.model_name || "llama3.2-vision";
}

export const ollama = {
  get client() {
    const host = getOllamaHost(ollamaSettingsRef.current);
    return new Ollama({ host });
  },
  async generate(options: OllamaGenerateOptions) {
    return this.client.generate(options);
  },
  async list(): Promise<{ models: OllamaModelInfo[] }> {
    return this.client.list();
  },
};

// Référence mutable aux settings (mise à jour par le serveur au démarrage
// et à chaque POST /api/settings).
export const ollamaSettingsRef: { current: OllamaSettings } = { current: {} as OllamaSettings };

// Génère via Ollama (modèle configurable) avec fallback OCR Tesseract si le
// modèle ne supporte pas l'image.
export async function generateWithOllama(
  promptText: string,
  base64Image?: string | null,
  format: string = "json",
  temperature: number = 0.1,
) {
  console.log("[OLLAMA] Utilisation d'Ollama local pour vision/extraction...");
  const settings = ollamaSettingsRef.current;
  const host = getOllamaHost(settings);
  const client = new Ollama({ host });

  const configModel = getModel(settings);
  let targetModelForOllama = configModel;

  const payload: OllamaGenerateOptions = {
    model: targetModelForOllama,
    prompt: promptText,
    format: format,
    stream: false,
    options: { temperature: temperature },
  };
  if (base64Image) {
    payload.images = [base64Image];
  }

  try {
    const oRes = await client.generate(payload);
    return oRes.response;
  } catch (error: unknown) {
    const err = error as Error;
    if (base64Image && err.message && err.message.includes("Failed to load image")) {
      console.log(`[OCR FALLBACK] Le modèle ${targetModelForOllama} ne supporte pas l'image, utilisation de l'OCR Tesseract pour simuler la vision...`);
      try {
        const buffer = Buffer.from(base64Image, "base64");
        const { data: { text } } = await Tesseract.recognize(buffer, "fra");
        console.log("[OCR FALLBACK] Texte extrait :", text.substring(0, 100));

        payload.images = undefined;
        payload.prompt = promptText + "\n\n--- TEXTE LU SUR LA PHOTO (OCR) ---\n" + text;

        const oResFall = await client.generate(payload);
        return oResFall.response;
      } catch (ocrErr) {
        console.error("[OCR FALLBACK] Échec Tesseract", ocrErr);
      }
    }
    console.error(`[OLLAMA] Échec de génération avec le modèle principal ${targetModelForOllama}`, err);
    throw error;
  }
}
