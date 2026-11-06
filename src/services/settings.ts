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
  // Seuils du moteur de surveillance (chantier 4) — configurables par le
  // maitre via POST /api/settings. Un seuil absent reprend son defaut
  // (src/services/surveillance.ts SEUILS_DEFAUT).
  marge_rupture?: number;
  jours_dlc?: number;
  temp_min?: number;
  temp_max?: number;
  [key: string]: unknown;
}

/** Les RACINES de noms qui portent un secret. Deux lectures, parce que les
 *  deux formes existent dans le produit et dans les fichiers herites :
 *    - par SUFFIXE sur le nom colle : `llm_clef` -> `llmclef` finit par `clef`,
 *      `openai_api_key` -> `openaiapikey` finit par `apikey` ;
 *    - par SEGMENT : `clef_api`, `injected_key`, `webhook_token` — le nom
 *      decoupe sur `-`/`_`/espace contient le mot seul.
 *  La premiere version comparait le nom ENTIER a une liste fermee, donc
 *  `llm_clef` (« llmclef ») ne matchait pas `clef` et la clef du prestataire
 *  restait servie en clair par GET /api/settings (trouvaille du scan 015,
 *  mesuree sur une instance reelle). La liste fermee, elle, ne connaissait que
 *  `clefapi` : `clef_api` lui echappait (mesure : test/banc/juge-reglage-llm). */
const RACINES_SECRETES = [
  "clef", "apikey", "token", "secret", "password", "motdepasse", "passphrase", "key",
] as const;

/** Vrai si le NOM du champ annonce un secret (a ne jamais rendre ni ecrire). */
export function estNomSecret(clef: string): boolean {
  const brut = String(clef ?? "").trim().toLowerCase();
  if (brut === "") return false;
  const colle = brut.replace(/[-_\s]/g, "");
  const segments = brut.split(/[-_\s]+/).filter(Boolean);
  return RACINES_SECRETES.some((r) => colle.endsWith(r)) ||
    segments.some((s) => (RACINES_SECRETES as readonly string[]).includes(s));
}

/** La vue PUBLIQUE des reglages : tout sauf les champs dont le nom annonce un
 *  secret. La lecture est libre (contrat A1) — un secret n'est pas une donnee
 *  metier : il ne sort pas, meme sur un settings.json herite d'une version qui
 *  l'y avait laisse (le coffre systeme est la seule place de la clef). */
export function sansSecrets<T extends Record<string, unknown>>(valeur: T): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valeur ?? {})) {
    if (estNomSecret(k)) continue;
    sortie[k] = v;
  }
  return sortie;
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
  // C2 : le defaut est le modele installe sur le poste (gemma4, mesure du scan
  // 015) ; « llama3.2-vision » n'etait jamais present => « fetch failed ».
  model_name: "gemma4:e4b-it-qat",
  custom_model: "gemma-12b-it-qat",
  ollama_url: "http://127.0.0.1:11434",
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
