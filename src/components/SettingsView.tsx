import React, { useState, useEffect } from "react";
import {
  Activity,
  Brain,
  Check,
  ClipboardList,
  Cpu,
  Download,
  Globe,
  Menu as MenuIcon,
  PencilLine,
  Play,
  Server,
  Settings,
  Smartphone,
} from "lucide-react";
import {
  Line,
} from "recharts";
import { LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "./ui/Toast";
// Le panneau « Intelligence » (Tache 9) puise sa liste de fournisseurs ICI —
// la VRAIE liste blanche (blanc.ts est pur : aucun reseau, aucun node ; on
// n'importe pas l'index du module, qui porte la partie serveur node:http).
// La cible et le verdict viennent de /api/llm/tester : c'est le serveur qui
// construit la cible et joue la sonde, jamais l'UI qui rejouerait la regle.
import { FOURNISSEURS_BLANCS } from "../shared/fournisseur/blanc.js";
// T3.2 : génération du guide PDF extraite (extraction pure, byte-exact) dans
// ../lib/settings-guides (dictionnaire `guides` par langue + mise en page jsPDF),
// pour tenir la règle « aucun fichier source > 800 lignes ».
import { exporterGuidePDF } from "../lib/settings-guides";

export function SettingsView({
  settings,
  setSettings,
  t,
}: {
  settings: Record<string, unknown>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  t: Record<string, string>;
}) {
  const toast = useToast();
  const [ollamaStatus, setOllamaStatus] = React.useState<
    "idle" | "checking" | "connected" | "error"
  >("idle");
  const [ollamaInfo, setOllamaInfo] = React.useState<string>("");
  const [networkInfo, setNetworkInfo] = React.useState<{
    ip: string | null;
    port: number;
    url: string | null;
  } | null>(null);


  // Panneau « Intelligence » (Sprint 15, Tâche 9). Le choix, l'URL et le
  // modèle sont les champs `llm_*` du contrat (ReglageFournisseur) ; ils
  // rentrent dans `settings` par setSettings, persistés par /api/settings.
  // « sans » (15/10) : la voie sans IA — l'état initial la montre comme un
  // choix explicite (pas « local » par défaut), activable ici à tout moment.
  const [choixIa, setChoixIa] = React.useState<"sans" | "local" | "ollama" | "en-ligne">(
    settings?.llm_choix === "sans"
      ? "sans"
      : settings?.llm_choix === "ollama"
      ? "ollama"
      : settings?.llm_choix && settings.llm_choix !== "llamacpp"
        ? "en-ligne"
        : "local",
  );
  const [fournisseurIa, setFournisseurIa] = React.useState<string>(
    settings?.llm_choix && settings.llm_choix !== "ollama" &&
    settings.llm_choix !== "llamacpp" && settings.llm_choix !== "sans"
      ? String(settings.llm_choix)
      : "",
  );
  const [urlIa, setUrlIa] = React.useState<string>(settings?.llm_url ?? "");
  const [modeleIa, setModeleIa] = React.useState<string>(settings?.llm_modele ?? "");
  const [serveursDetectes, setServeursDetectes] = React.useState<any[]>([]);
  const [aucunMoteur, setAucunMoteur] = React.useState(false);
  const [verdictIa, setVerdictIa] = React.useState<any>(null);
  const [testIaEnCours, setTestIaEnCours] = React.useState(false);

  // Les trois voies de l'IA (Tâche 8 livrait le moteur de recherche) :
  // /api/llm/detecter ne rend JAMAIS un tableau muet — si rien n'est trouvé,
  // le message AUCUN_MOTEUR_TROUVE est rendu, pas caché.
  const detecterLesMoteurs = async () => {
    try {
      const res = await fetch("/api/llm/detecter");
      const data = await res.json();
      setServeursDetectes(Array.isArray(data.serveurs) ? data.serveurs : []);
      setAucunMoteur(data.message === "AUCUN_MOTEUR_TROUVE");
    } catch (e) {
      setServeursDetectes([]);
      setAucunMoteur(true);
    }
  };

  // Le bouton « Tester » (Tâche 5) : persiste le réglage courant côté serveur,
  // PUIS joue la vraie sonde via /api/llm/tester et rend le verdict nommé.
  const ecrireReglageIa = async () => {
    const llm = reglageIaCourant();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(llm),
    });
    setSettings((s: Record<string, unknown>) => ({ ...s, ...llm }));
    return llm;
  };

  const reglageIaCourant = () => ({
    llm_choix:
      choixIa === "ollama"
        ? "ollama"
        : choixIa === "en-ligne"
          ? fournisseurIa || FOURNISSEURS_BLANCS[0].nom.toLowerCase()
          : choixIa === "sans"
            ? "sans"
            : "llamacpp",
    llm_url: urlIa.trim(),
    llm_modele: modeleIa.trim(),
  });

  const testerLlm = async () => {
    setTestIaEnCours(true);
    setVerdictIa(null);
    // R2 (plan 014) : la detection ne tournait qu'au montage. Si le maitre a
    // ouvre l'app AVANT de demarrer Ollama, le datalist restait vide et il
    // retapait le nom a la main. Rejouer la detection au « Tester » coute un
    // appel local et repeuple les suggestions.
    void detecterLesMoteurs();
    try {
      await ecrireReglageIa();
      const res = await fetch("/api/llm/tester");
      const data = await res.json();
      setVerdictIa(data);
    } catch (e) {
      setVerdictIa({ vivant: false, cibles: [], defaut: "TEST_IMPROUVABLE" });
    } finally {
      setTestIaEnCours(false);
    }
  };

  const enregistrerLlm = async () => {
    await ecrireReglageIa();
    toast(t.intelligenceEnregistre || "Réglage de l'intelligence enregistré.", "success");
  };

  React.useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const res = await fetch("/api/network-info");
        const data = await res.json();
        setNetworkInfo(data);
      } catch (e) {
        console.error("Error fetching network info", e);
      }
    };
    fetchNetwork();
    checkOllama();
    detecterLesMoteurs();
  }, []);

  // Les réglages arrivent du serveur APRÈS le premier rendu (App.tsx les
  // charge en asynchrone) : le panneau se cale dessus dès qu'ils tombent.
  React.useEffect(() => {
    if (!settings?.llm_choix) return;
    setUrlIa(settings.llm_url ?? "");
    setModeleIa(settings.llm_modele ?? "");
    if (settings.llm_choix === "sans") setChoixIa("sans");
    else if (settings.llm_choix === "ollama") setChoixIa("ollama");
    else if (settings.llm_choix === "llamacpp") setChoixIa("local");
    else {
      setChoixIa("en-ligne");
      setFournisseurIa(String(settings.llm_choix));
    }
  }, [settings?.llm_choix, settings?.llm_url, settings?.llm_modele]);

  const [availableModels, setAvailableModels] = React.useState<string[]>([
    "llama3.2",
  ]); // Default fallback

  const checkOllama = async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("/api/ollama/status");
      const data = await res.json();
      if (data.status === "connected") {
        setOllamaStatus("connected");
        setOllamaInfo(`${data.models.length} modèles détectés`);
        if (data.models && Array.isArray(data.models)) {
          // Assume models are objects with a 'name' field
          setAvailableModels(
            data.models.map((m: string | {name: string}) => (typeof m === "string" ? m : m.name)),
          );
        }
      } else {
        setOllamaStatus("error");
        setOllamaInfo(data.error);
      }
    } catch (e) {
      setOllamaStatus("error");
      setOllamaInfo("Impossible de contacter le serveur local.");
    }
  };

  const handleSave = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      toast(t.saveSuccess, "success");
    } catch (e) {
      toast(t.syncError, "error");
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast(`✅ ${t.active}: ${data.message}`, "success");
      } else {
        throw new Error(data.message || "Server error");
      }
    } catch (e) {
      console.error("Backup error:", e);
      toast(t.syncError, "error");
    }
  };

  
  const handleDownloadGuide = () => {
    exporterGuidePDF((settings.language as string) || "fr");
  };

  const handleDownloadDB = () => {
    const a = document.createElement("a");
    a.href = "/api/admin/db-download";
    a.download = "agent_culinaire.sqlite";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <motionSlim.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="mb-10">
        <h2 className="text-4xl font-black text-white tracking-tight mb-2">
          {t.systemCore}
        </h2>
        <p className="text-slate-500 text-lg">{t.advancedConfig}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8">
          {/* Section IA */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-brand-500/10 text-brand-500 rounded-xl mr-4">
                <Settings className="w-5 h-5" />
              </div>
              {t.aiSection}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.ollamaStatus || "Statut Ollama"}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={checkOllama}
                    disabled={ollamaStatus === "checking"}
                    className="px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/30 rounded-xl text-xs font-bold hover:bg-brand-500/20 transition-all"
                  >
                    {ollamaStatus === "checking"
                      ? t.checking || "Vérification..."
                      : t.testConnection || "Tester Connexion"}
                  </button>
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-black uppercase tracking-tighter ${
                        ollamaStatus === "connected"
                          ? "text-emerald-500"
                          : ollamaStatus === "error"
                            ? "text-red-500"
                            : "text-slate-500"
                      }`}
                    >
                      {ollamaStatus === "connected"
                        ? t.connectedStatus || "Connecté"
                        : ollamaStatus === "error"
                          ? t.errorStatus || "Erreur"
                          : t.notTested || "Non testé"}
                    </span>
                    {ollamaInfo && (
                      <span className="text-[10px] text-slate-500">
                        {ollamaInfo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.systemLanguage}
                </label>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings({ ...settings, language: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                >
                  <option value="fr" className="bg-black text-white">
                    {t.frenchLang || "Français"}
                  </option>
                  <option value="en" className="bg-black text-white">
                    {t.englishLang || "English"}
                  </option>
                  <option value="es" className="bg-black text-white">
                    {t.spanishLang || "Español"}
                  </option>
                  <option value="it" className="bg-black text-white">
                    {t.italianLang || "Italiano"}
                  </option>
                  <option value="de" className="bg-black text-white">
                    {t.germanLang || "Deutsch"}
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.activeAIModel || "Modèle IA Actif"}
                </label>
                <select
                  value={settings.model_name}
                  onChange={(e) =>
                    setSettings({ ...settings, model_name: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all appearance-none"
                >
                  {availableModels.map((model) => (
                    <option
                      key={model}
                      value={model}
                      className="bg-black text-white"
                    >
                      {model}
                    </option>
                  ))}
                  <option value="custom" className="bg-black text-white">
                    {settings.language === "fr" ? "Personnalisé (Saisir ci-dessous)" : "Custom Model (Type below)"}
                  </option>
                </select>
                <p className="text-[10px] text-slate-500 italic">
                  {t.activeAIModelDesc ||
                    "Modèle utilisé pour toutes les analyses IA locales."}
                </p>
              </div>
              {settings.model_name === "custom" && (
                <div className="space-y-2 col-span-1 md:col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {settings.language === "fr" ? "Nom du modèle personnalisé" : "Custom Model Name"}
                  </label>
                  <input
                    type="text"
                    value={settings.custom_model || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, custom_model: e.target.value })
                    }
                    placeholder="e.g. gemma-12b-it-qat"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  />
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.ollamaEndpoint}
                </label>
                <input
                  type="text"
                  value={settings.ollama_url}
                  onChange={(e) =>
                    setSettings({ ...settings, ollama_url: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
              </div>
            </div>
          </section>

          {/* Section Intelligence (Sprint 15, Tâche 9) : le choix de l'IA se
              lit et s'écrit dans la langue du chef. Trois boutons — Local
              (détecté), Ollama, En ligne — deux champs (URL, modèle), un
              bouton « Tester » qui joue la sonde (Tâche 5) par /api/llm/tester.
              Tant que le verdict est rouge, « Enregistrer » reste désarmé.
              Jamais de champ clef d'API ici : la clef vit dans le trousseau
              du système (Tâche 12), pas dans ce panneau ni dans settings. */}
          <section className="led-glow-container bg-black/40 border-emerald-500/20 shadow-none">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl mr-4">
                <Brain className="w-5 h-5" />
              </div>
              {t.intelligenceTitre || "Intelligence"}
            </h3>
            <p className="text-sm text-slate-400 -mt-4 mb-6">
              {t.intelligenceDesc || "Choisissez le moteur qui analyse vos documents."}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => { setChoixIa("local"); setVerdictIa(null); }}
                className={`p-4 rounded-xl border text-left transition-all ${choixIa === "local" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  {t.intelligenceLocal || "Local (détecté)"}
                </span>
                <span className="block text-[10px] text-slate-500 mt-2 font-mono">
                  {serveursDetectes.length > 0
                    ? serveursDetectes.map((s) => `${s.moteur}:${s.port}`).join(" · ")
                    : aucunMoteur
                      ? (t.intelligenceAucunMoteur || "AUCUN_MOTEUR_TROUVE")
                      : "…"}
                </span>
              </button>
              <button
                onClick={() => { setChoixIa("ollama"); setVerdictIa(null); }}
                className={`p-4 rounded-xl border text-left transition-all ${choixIa === "ollama" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Server className="w-4 h-4 text-emerald-400" />
                  {t.intelligenceOllama || "Ollama"}
                </span>
                <span className="block text-[10px] text-slate-500 mt-2 font-mono">
                  {serveursDetectes.some((s) => s.moteur === "ollama")
                    ? `${serveursDetectes.find((s) => s.moteur === "ollama").urlBase}`
                    : "http://127.0.0.1:11434"}
                </span>
              </button>
              <button
                onClick={() => { setChoixIa("en-ligne"); setVerdictIa(null); }}
                className={`p-4 rounded-xl border text-left transition-all ${choixIa === "en-ligne" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  {t.intelligenceEnLigne || "En ligne"}
                </span>
                <span className="block text-[10px] text-slate-500 mt-2 font-mono">
                  {t.intelligenceEnLigneAide || "Un fournisseur de la liste blanche, validé."}
                </span>
              </button>
              <button
                onClick={() => { setChoixIa("sans"); setVerdictIa(null); }}
                className={`p-4 rounded-xl border text-left transition-all ${choixIa === "sans" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <PencilLine className="w-4 h-4 text-slate-400" />
                  {t.intelligenceSansIa || "Sans IA"}
                </span>
                <span className="block text-[10px] text-slate-500 mt-2 font-mono">
                  {t.intelligenceSansIaAide || "Saisie manuelle complète — activable ici à tout moment."}
                </span>
              </button>
            </div>

            {aucunMoteur && choixIa === "local" && (
              <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold leading-relaxed">
                {t.intelligenceAucunMoteurDesc
                  || "Aucun moteur local trouvé sur les ports d'usage. Installez llama.cpp, Ollama, ou choisissez « En ligne »."}
              </div>
            )}

            {choixIa === "en-ligne" && (
              <div className="mb-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                  {t.intelligenceFournisseur || "Fournisseur"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {FOURNISSEURS_BLANCS.map((f) => (
                    <button
                      key={f.nom}
                      onClick={() => {
                        const bas = f.nom.toLowerCase();
                        setFournisseurIa(bas);
                        setVerdictIa(null);
                      }}
                      className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all ${fournisseurIa === f.nom.toLowerCase() ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-white/30"}`}
                    >
                      {f.nom}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 italic mt-2">
                  {t.intelligenceClefAide
                    || "La clef d'API ne se saisit pas ici : elle est demandée à la première ouverture et rangée dans le trousseau du système."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.intelligenceUrl || "URL du moteur"}
                </label>
                <input
                  type="text"
                  value={urlIa}
                  onChange={(e) => { setUrlIa(e.target.value); setVerdictIa(null); }}
                  placeholder={choixIa === "ollama" ? "http://127.0.0.1:11434" : choixIa === "local" ? "http://127.0.0.1:8080" : "https://… (optionnel)"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
                <p className="text-[10px] text-slate-500 italic">
                  {choixIa === "en-ligne"
                    ? (t.intelligenceUrlEnLigneDesc || "L'URL confirme le fournisseur de la liste blanche ; elle ne peut pas le remplacer.")
                    : null}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.intelligenceModele || "Nom du modèle"}
                </label>
                <input
                  type="text"
                  value={modeleIa}
                  onChange={(e) => { setModeleIa(e.target.value); setVerdictIa(null); }}
                  placeholder={choixIa === "ollama" ? "ex : qwen2.5:7b-instruct" : "ex : qwen2.5-7b-instruct-q4_k_m.gguf"}
                  list="modeles-detectes"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
                {/* P2 (plan 014) : le champ reste LIBRE — un chemin .gguf de
                    llama.cpp n'est pas un nom de modele Ollama. Le datalist
                    propose les modeles deja detectes (aucun appel reseau de
                    plus : /api/llm/detecter est joue au montage et rejoue au
                    « Tester », R2). Vide = aucune suggestion, pas d'erreur. */}
                <datalist id="modeles-detectes">
                  {Array.from(new Set(
                    serveursDetectes.flatMap((s) => (s.modeles ?? []).map((m: { nom: string }) => m.nom))
                  )).map((nom) => <option key={nom} value={nom} />)}
                </datalist>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={testerLlm}
                disabled={testIaEnCours}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/30 text-xs font-bold hover:bg-brand-500/20 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {testIaEnCours
                  ? (t.intelligenceTestEnCours || "Test en cours...")
                  : (t.intelligenceTester || "Tester")}
              </button>
              <button
                onClick={enregistrerLlm}
                disabled={verdictIa === null || verdictIa.vivant !== true}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all"
                title={verdictIa === null || verdictIa.vivant !== true
                  ? (t.intelligenceEnregistrerBloque || "Le test doit réussir avant d'enregistrer.")
                  : undefined}
              >
                <Check className="w-3.5 h-3.5" />
                {t.intelligenceEnregistrer || "Enregistrer"}
              </button>
              {verdictIa !== null && !testIaEnCours && (
                <span className={`text-xs font-black uppercase tracking-tighter ${verdictIa.vivant ? "text-emerald-400" : "text-red-500"}`}>
                  {verdictIa.vivant
                    ? `${t.intelligenceTestVert || "Le moteur répond"}${verdictIa.cibles?.[0]?.modele ? ` (${verdictIa.cibles[0].modele})` : ""}`
                    : `${t.intelligenceTestRouge || "Test échoué"}${verdictIa.defaut ? ` (${verdictIa.defaut})` : ""}`}
                </span>
              )}
            </div>
          </section>

          {/* Section Achats */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl mr-4">
                <Activity className="w-5 h-5" />
              </div>
              {t.automationSection}
            </h3>
            <div className="space-y-4">
              <label className="flex items-center group cursor-pointer p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.copilot_mode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        copilot_mode: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </div>
                <div className="ml-4">
                  <span className="block text-sm font-bold text-white">
                    {t.copilotMode}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t.copilotDesc}
                  </span>
                </div>
              </label>
              <label className="flex items-center group cursor-pointer p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.auto_pause}
                    onChange={(e) =>
                      setSettings({ ...settings, auto_pause: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </div>
                <div className="ml-4">
                  <span className="block text-sm font-bold text-white">
                    {t.autoPause}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t.autoPauseDesc}
                  </span>
                </div>
              </label>
            </div>
          </section>

          {/* Section Smartphone */}
          <section className="led-glow-container p-8 bg-gradient-to-br from-brand-500/5 to-transparent relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl opacity-50"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl mr-4">
                  <Smartphone className="w-5 h-5" />
                </div>
                {t.smartphoneAccess || "Accès Smartphone Wi-Fi"}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <p
                    className="text-sm text-slate-400 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html:
                        t.smartphoneAccessDesc ||
                        "Connectez votre smartphone au **même réseau Wi-Fi** que cet ordinateur pour scanner les factures et gérer l'inventaire en direct.",
                    }}
                  ></p>
                  <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                      {t.localWifiAddress ||
                        "Adresse de connexion (Wi-Fi Local)"}
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-emerald-400 font-mono font-bold text-lg">
                        {networkInfo?.url
                          ?? (networkInfo
                            ? (t.aucuneAdresseLan || "aucune adresse LAN détectée")
                            : (t.loading || "Chargement..."))}
                      </code>
                    </div>
                    {/* P4b : l'opt-in du maitre, plus le rappel de redemarrage
                        (le bind se resout au demarrage, `app.listen` est fige). */}
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          className="accent-emerald-500"
                          checked={networkInfo?.lan_acces === true}
                          onChange={async (e) => {
                            const suivant = e.target.checked;
                            await fetch("/api/settings", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                ...(settings ?? {}),
                                lan_acces: suivant,
                              }),
                            });
                            setSettings((s: Record<string, unknown>) => ({
                              ...(s ?? {}),
                              lan_acces: suivant,
                            }));
                            try {
                              const r = await fetch("/api/network-info");
                              setNetworkInfo(await r.json());
                            } catch (err) {
                              console.error("network-info", err);
                            }
                          }}
                        />
                        <span>{t.lanAccesOptIn || "Exposer l'app sur le réseau local (Wi-Fi)"}</span>
                      </label>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {t.lanAccesAvertissement ||
                          "Actif : votre inventaire est visible sur le réseau local. Inactif : adresse 127.0.0.1 uniquement. Redémarrez l'application après modification."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                  <div className="w-32 h-32 bg-white flex items-center justify-center rounded-2xl mb-4 shadow-2xl p-2 overflow-hidden">
                    {networkInfo?.url ? (
                      <QRCodeSVG
                        value={networkInfo.url}
                        size={112}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="L"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="text-black text-[10px] text-center font-bold px-2 flex flex-col items-center">
                        <Smartphone className="w-8 h-8 mb-2 text-emerald-600" />
                        {networkInfo
                          ? (t.aucuneAdresseLan || "aucune adresse LAN détectée")
                          : (t.loading || "Chargement...")}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center"
                    dangerouslySetInnerHTML={{
                      __html:
                        t.openCameraToConnect ||
                        "Ouvrez l'appareil photo<br/>pour vous connecter",
                    }}
                  ></span>
                </div>
              </div>
            </div>
          </section>

          {/* Boutons Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="flex-1 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-brand-500/20"
            >
              {t.saveSettings || "Sauvegarder les Paramètres"}
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Section Base de données */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl mr-4">
                <ClipboardList className="w-5 h-5" />
              </div>
              {t.backupSection}
            </h3>
            <div className="space-y-6">
              <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                  {t.activeEngine || "Moteur Actif"}
                </p>
                <p className="font-bold text-white">SQLite 3.0</p>
                <p className="text-[10px] font-mono text-brand-500 mt-1">
                  agent_culinaire.db
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => { const a = document.createElement("a"); a.href = "/api/admin/db-download"; a.download = "agent_culinaire.db"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
                  className="w-full py-4 bg-brand-500 text-obsidian rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  {t.downloadDB}
                </button>
                
                <button
                  onClick={handleDownloadGuide}
                  className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3 mt-4"
                >
                  <Download className="w-5 h-5" />
                  {t.downloadGuide || "Download Guide"}
                </button>

                <button
                  onClick={handleBackup}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
                >
                  {t.runBackup}
                </button>
              </div>
            </div>
          </section>

          <button
            onClick={handleSave}
            className="w-full py-3 bg-white text-obsidian rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-2xl shadow-white/10"
          >
            {t.saveSettings}
          </button>
        </div>
      </div>
    </motionSlim.div>
  );
}
