// Routes : Paramètres + statut Ollama + infos réseau + le juge LLM (Tache 9)
import { Router } from "express";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getOllamaHost } from "../shared/util.js";
import { ollama, ollamaSettingsRef } from "../shared/ollama.js";
import { settingsStore, updateSettings } from "../services/settings.js";
import {
  cibleDuReglage, argvDeCible, parseSortieSonde, detecterServeursLocaux,
  type ReglageLlmBrut,
} from "../shared/fournisseur/index.js";

const router = Router();

/** LA MORSURE de la route (la regle du banc : un juge qui ne peut pas rougir
 *  ne juge rien). `?test=muet` force la route a juger une sortie VIDE comme
 *  si la sonde n'avait rien rendu ; elle doit alors rendre `vivant:false`,
 *  jamais un 200 lu comme un vert. Sans ce crochet, un parseur qui rendrait
 *  « vert » sur une sortie vide passerait au vert ETERNELLEMENT — la classe
 *  exacte de faute des capteurs morts. */
const FILTRE_TEST = (sortie: string, q: string) => (q === "muet" ? "" : sortie);

/** /api/llm/tester : le bouton « Tester » des Réglages.
 *  Construit la cible depuis les reglages LUS, joue la VRAIE sonde de la
 *  tache 5 (le fichier, jamais un inline), rend le VERDICT nominal.
 *  La clef d'API n'est JAMAIS lue d'un reglage ni rendue ici : la sonde la
 *  lit du seul environment (la decision du 25/09). */
router.get("/api/llm/tester", async (req, res) => {
  const reglage = settingsStore.value as ReglageLlmBrut;
  const construit = cibleDuReglage(reglage);
  if ("defaut" in construit) {
    // Une cible impossible a construire est un verdict ROUGE nomme — la
    // reponse est 200 (le jugement a eu lieu) mais jamais `vivant:true`.
    res.json({ vivant: false, cibles: [], defaut: construit.defaut });
    return;
  }
  const sonde = path.join(process.cwd(), "scripts", "sonde-fournisseur.mjs");
  try {
    const sortie = await new Promise<string>((resolve, reject) => {
      const fils = spawn(process.execPath, [sonde, ...argvDeCible(construit.cible)], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buf = "";
      fils.stdout.on("data", (d) => { buf += d.toString(); });
      fils.stderr.on("data", (d) => { buf += d.toString(); });
      fils.on("error", reject);
      fils.on("close", () => resolve(buf));
    });
    const v = parseSortieSonde(FILTRE_TEST(sortie, String(req.query["test"] ?? "")));
    res.json({ ...v, defaut: v.cibles[0]?.defaut });
  } catch (e) {
    res.json({ vivant: false, cibles: [], defaut: "SONDE_IMPROUVABLE",
               detail: String((e as Error)?.message ?? e) });
  }
});

/** /api/llm/detecter : les serveurs locaux detectes sur les ports d'usage
 *  (la tache 8), pour le bouton « Local (détecté) ». Jamais muet : si rien
 *  n'est trouve, le message AUCUN_MOTEUR_TROUVE est RENDU, pas cache. */
router.get("/api/llm/detecter", async (_req, res) => {
  try {
    const serveurs = await detecterServeursLocaux();
    res.json({ serveurs, message: serveurs.length === 0
      ? "AUCUN_MOTEUR_TROUVE" : null });
  } catch (e) {
    res.json({ serveurs: [], message: "AUCUN_MOTEUR_TROUVE",
               detail: String((e as Error)?.message ?? e) });
  }
});

router.get("/api/settings", (_req, res) => {
  res.json(settingsStore.value);
});

/** Les noms de champs qui portent un secret. Quel qu soit l'emmeteur du POST,
 *  ces clefs NE PASSENT PAS : la clef du prestataire vit dans le trousseau du
 *  systeme (Tache 12, safeStorage), jamais dans settings.json — la table est
 *  lisible par tout fichier de la sauvegarde (le contrat le dit mot pour mot).
 *  Comparaison par NOM EXACT normalise (minuscules, sans tiret/souligne). */
const CLEFS_SECRETES = new Set([
  "clefapi", "clefdapi", "apikey", "clef", "token", "secret",
  "motdepasse", "password",
]);
function estNomSecret(clef: string): boolean {
  return CLEFS_SECRETES.has(clef.trim().toLowerCase().replace(/[-_]/g, ""));
}

router.post("/api/settings", (req, res) => {
  // Le corps est le reglage complet (App.tsx poste l'objet entier). On le
  // persiste TEL QUEL — sauf les champs secrets, qui n'entrent pas ici, et
  // les champs `llm_*` qui passent par le type du contrat (Tache 9).
  const corps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (estNomSecret(k)) continue; // la fuite fermee au POST, pas qu'a l'affichage
    corps[k] = v;
  }
  const settings = updateSettings(corps as Partial<typeof settingsStore.value>);
  res.json({ status: "success", settings });
});
router.get("/api/network-info", (_req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = "localhost";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  const port = Number(process.env.PORT) || 3000;
  res.json({ ip: localIp, port, url: `http://${localIp}:${port}` });
});
router.get("/api/ollama/status", async (_req, res) => {
  const host = getOllamaHost(settingsStore.value);
  try {
    console.log(`[DEBUG] Tentative de connexion à Ollama sur ${host}`);
    const list = await ollama.list();
    console.log("[DEBUG] Ollama connecté, modèles trouvés:", list.models.length);
    res.json({ status: "connected", models: list.models });
  } catch (error) {
    console.error(`[OLLAMA ERROR] Impossible de joindre ${host}`, error);
    res.status(500).json({
      status: "disconnected",
      error: `Ollama injoignable sur ${host}. Vérifiez qu'il est en cours d'exécution.`,
    });
  }
});

export default router;
