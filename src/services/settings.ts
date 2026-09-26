import fs from "fs";
import os from "os";
import path from "path";
import { ollamaSettingsRef } from "../shared/ollama.js";
import type { ReglageFournisseur } from "../shared/fournisseur/types.js";

// Paramètres applicatifs (settings.json dans le dossier de données utilisateur).
// Une instance partagée est lue/écrite par les routes /api/settings et par
// les composants qui en dépendent (modèle Ollama, langue, etc.).

export interface AppSettings extends ReglageFournisseur {
  model_name?: string;
  custom_model?: string;
  ollama_url?: string;
  copilot_mode?: boolean;
  auto_pause?: boolean;
  language?: string;
  [key: string]: unknown;
}

function resolveDataDir(): string {
  let storageDir = process.env.USER_DATA_PATH;
  if (!storageDir) {
    const home = os.homedir();
    storageDir = process.platform === "win32"
      ? path.join(home, "AppData", "Roaming", "ClausIO")
      : path.join(home, ".clausio");
  }
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  return storageDir;
}

export const settingsPath = path.join(resolveDataDir(), "settings.json");

const defaults: AppSettings = {
  model_name: "llama3.2-vision",
  custom_model: "gemma-12b-it-qat",
  ollama_url: "http://localhost:11434/api/generate",
  copilot_mode: true,
  auto_pause: true,
  language: "fr",
};

function load(): AppSettings {
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, "utf8");
      return { ...defaults, ...JSON.parse(data) };
    } catch (e) {
      console.error("Unable to read settings file", e);
    }
  }
  return { ...defaults };
}

// Instance partagée, mutable.
export const settingsStore: { value: AppSettings } = { value: load() };
// Synchronise la référence utilisée par le client Ollama et les routes.
ollamaSettingsRef.current = settingsStore.value;

export function reloadSettingsFromDisk() {
  settingsStore.value = { ...settingsStore.value, ...load() };
  ollamaSettingsRef.current = settingsStore.value;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  settingsStore.value = { ...settingsStore.value, ...patch };
  ollamaSettingsRef.current = settingsStore.value;
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settingsStore.value, null, 2));
  } catch (e) {
    console.error("Unable to save settings file", e);
  }
  // La fuite fermee (Tache 12, contrat : « jamais dans le code d'un appel
  // d'outil — les arguments sont journalises ») : ce log rendoit les Reglages
  // ENTiers a la console, clefs comprises. Il ne rend plus que les NOMS des
  // champs touches — jamais une valeur (une valeur de reglage peut etre une
  // URL interne, un identifiant, ou demain un champ secret qui aurait glisse
  // par un autre chemin que le coffre).
  console.log("[OLLAMA] Paramètres mis à jour :", Object.keys(patch).join(", "));
  return settingsStore.value;
}
