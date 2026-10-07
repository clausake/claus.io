// Routes : Paramètres + statut Ollama + infos réseau + le juge LLM (Tache 9)
import { Router } from "express";
import fs from "fs";
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
import {
  etatAssistant, jouerEpreuve, jugerEpreuve, attendusEpreuve,
  consignerDemarrage, reinitialiserEpreuve,
} from "../services/assistant.js";
import { rangerClef, lireClef, etatClef } from "../services/coffre.js";
import { logAuditRacine } from "../services/audit.js";

const logAudit = logAuditRacine;

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
  const sonde = [
    // Le livrable Electron : la sonde est LIVREE (extraResources — sans elle,
    // le bouton « Tester » du paquet ne rend rien et le verdict tombe en
    // SONDE_MUETTE, la faute mesuree le 27/09 sur la piece dist-server).
    path.join((process as unknown as { resourcesPath?: string }).resourcesPath
      ?? process.cwd(), "scripts", "sonde-fournisseur.mjs"),
    path.join(process.cwd(), "scripts", "sonde-fournisseur.mjs"),
  ].find((p) => p && fs.existsSync(p))
    ?? path.join(process.cwd(), "scripts", "sonde-fournisseur.mjs");
  try {
    // La clef part par l'ENVIRONNEMENT du fils (la decision du 25/09 : la
    // sonde la lit du seul environment), rangee dans le coffre du systeme
    // (tache 12). Jamais par l'URL, jamais le corps, jamais le argv.
    const clef = lireClef(construit.cible.nom === "reglage"
      ? (String((settingsStore.value as Record<string, unknown>).llm_choix ?? "") || "reglage")
      : construit.cible.nom);
    const sortie = await new Promise<string>((resolve, reject) => {
      const fils = spawn(process.execPath, [sonde, ...argvDeCible(construit.cible)], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CLEF_REGLAGE: clef ?? "" },
      });
      let buf = "";
      fils.stdout.on("data", (d) => { buf += d.toString(); });
      fils.stderr.on("data", (d) => { buf += d.toString(); });
      fils.on("error", reject);
      fils.on("close", () => resolve(buf));
    });
    const v = parseSortieSonde(FILTRE_TEST(sortie, String(req.query["test"] ?? "")));
    // Une sonde qui ne rend AUCUNE ligne est un capteur mort : le verdict est
    // NOMME (SONDE_MUETTE), jamais un `cibles: []` muet — la regle des
    // capteurs, la branche que la piece livree a fait rougir le 27/09.
    const defaut = v.cibles.length === 0 ? "SONDE_MUETTE" : v.cibles[0]?.defaut;
    res.json({ ...v, defaut });
  } catch (e) {
    res.json({ vivant: false, cibles: [], defaut: "SONDE_IMPROUVABLE",
               detail: String((e as Error)?.message ?? e) });
  }
});

/** /api/assistant/etat : l'etat machine du demarrage (tache 10) — sans
 *  epreuve reussie dans CE processus, l'application doit rester sur
 *  l'assistant. */
router.get("/api/assistant/etat", (_req, res) => {
  res.json(etatAssistant());
});

/** /api/assistant/epreuve : l'epreuve du demarrage (contrat, etape 3). Elle
 *  est jugee par l'OCR SEUL sur la piece du banc — « le moteur OCR determine,
 *  le cerveau LLM ne fait que ranger » : aucun LLM ne complete un champ.
 *  LA MORSURE : ?test=muet force la voie de lecture a ne RENDRE AUCUNE LIGNE ;
 *  le verdict doit rougir en EPREUVE_MUETTE (la regle des capteurs morts). */
router.get("/api/assistant/epreuve", async (req, res) => {
  if (String(req.query["test"] ?? "") === "muet") {
    // La voie forcee : les attendus sont lus (le compte est le vrai), mais
    // AUCUNE ligne n'est rendue — un verdict rouge nomme, pas un 200 muet.
    const v = jugerEpreuve([], attendusEpreuve());
    res.json({ ...v, reussi: false });
    return;
  }
  res.json(await jouerEpreuve());
});

/** /api/assistant/consigner : ne consigne (install_termine_le,
 *  fournisseur_choisi) QUE si l'epreuve est acquise dans CE processus.
 *  ?test=forget remise a zero l'epreuve — la morsure qui prouve qu'un
 *  « consigner » herite d'un certificat d'avant ne peut pas exister. */
router.post("/api/assistant/consigner", (req, res) => {
  if (String(req.query["test"] ?? "") === "forget") reinitialiserEpreuve();
  const fournisseur = typeof req.body?.fournisseur === "string" ? req.body.fournisseur : "";
  const r = consignerDemarrage(fournisseur);
  if (r.ok) logAudit(req, res, { route: "/api/assistant/consigner", action: "consigner", payload: { fournisseur: fournisseur } });
  res.status(r.ok ? 200 : 412).json(r);
});

/** /api/clef (Taches 10-12) : ranger une clef dans le coffre du systeme, et
 *  rendre SON ETAT seulement. GET ne rend JAMAIS la valeur — juste
 *  {presente, chiffre}. POST ne consigne que via coffre.ts (safeStorage sous
 *  Electron ; fichier 0600 non chiffre hors Electron, rendu `chiffre:false`,
 *  jamais maquille en trousseau). */
router.get("/api/clef", (req, res) => {
  const fournisseur = String(req.query["fournisseur"] ?? "");
  const etat = etatClef(fournisseur);
  res.status("ok" in etat && etat.ok === false ? 400 : 200).json(etat);
});
router.post("/api/clef", (req, res) => {
  const fournisseur = typeof req.body?.fournisseur === "string" ? req.body.fournisseur : "";
  const clef = typeof req.body?.clef === "string" ? req.body.clef : "";
  const r = rangerClef(fournisseur, clef);
  // La reponse ne porte JAMAIS la clef — seulement l'etat du rangement.
  // L'audit non plus : on journalise le FAIT du rangement, jamais la valeur.
  if (!("ok" in r) || r.ok !== false) {
    logAudit(req, res, { route: "/api/clef", action: "ranger_clef", payload: { fournisseur: fournisseur } });
  }
  res.status("ok" in r && r.ok === false ? 400 : 200).json(r);
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

router.post("/api/settings", async (req, res) => {
  // Le corps est le reglage complet (App.tsx poste l'objet entier). On le
  // persiste TEL QUEL — sauf les champs secrets, qui n'entrent pas ici, et
  // les champs `llm_*` qui passent par le type du contrat (Tache 9).
  const corps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (estNomSecret(k)) continue; // la fuite fermee au POST, pas qu'a l'affichage
    corps[k] = v;
  }
  const settings = updateSettings(corps as Partial<typeof settingsStore.value>);
  // Les clefs secretes sont FILTREEES du journal aussi : l'audit ne fuit pas
  // ce que le POST ne persiste deja pas.
  await logAudit(req, res, { route: "/api/settings", action: "update", payload: { colonnes: Object.keys(corps) } });
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
