import React, { useEffect, useState } from "react";
import { Brain, Cpu, Server, Globe, KeyRound, FlaskConical, Check, ArrowRight } from "lucide-react";

// L'assistant de premier demarrage (Sprint 15, Tache 10).
//
// Trois ecrans, dans l'ordre du contrat :
//   1. le MOTEUR  — les serveurs detectes (la tache 8), ou les trois voies de
//      recours si rien n'est trouve ;
//   2. la CLEF    — seulement si « en ligne » est choisi ; la clef part dans
//      le coffre du systeme (/api/clef -> safeStorage), jamais dans settings,
//      jamais rendue par un GET ;
//   3. l'EPREUVE  — la piece du banc lue par l'OCR SEUL (le LLM ne complete
//      rien). Sans epreuve reussie, rien n'est consigne : le bouton de fin
//      reste désarmé tant que le verdict n'est pas vert.
//
// L'UI ne rejoue AUCUNE regle : elle appelle /api/assistant/etat,
// /api/assistant/epreuve et /api/assistant/consigner, et rend ce qu'on lui
// rend. Un verdict muet est affiche comme un defaut, pas comme un succes.

interface Etat {
  install_termine_le: string | null;
  fournisseur_choisi: string | null;
  epreuve_acquise: boolean;
}
interface Serveur { moteur: string; port: number; urlBase: string; modeles: string[] }
interface Verdict {
  reussi: boolean; score: string; manquants: string[]; defaut?: string; detail?: string;
}

export function Assistant({
  t, onTermine,
}: {
  t: any;
  onTermine: () => void;
}) {
  const [ecran, setEcran] = useState(0);
  const [serveurs, setServeurs] = useState<Serveur[]>([]);
  const [aucunMoteur, setAucunMoteur] = useState(false);
  const [choix, setChoix] = useState<"llamacpp" | "ollama" | string>("");
  const [clef, setClef] = useState("");
  const [clefRangee, setClefRangee] = useState<{ presente: boolean; chiffre: boolean } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [epreuveEnCours, setEpreuveEnCours] = useState(false);
  const [erreurConsignation, setErreurConsignation] = useState<string | null>(null);

  const enLigne = choix !== "" && choix !== "ollama" && choix !== "llamacpp";

  useEffect(() => {
    fetch("/api/llm/detecter")
      .then((r) => r.json())
      .then((d) => {
        setServeurs(Array.isArray(d.serveurs) ? d.serveurs : []);
        setAucunMoteur(d.message === "AUCUN_MOTEUR_TROUVE");
      })
      .catch(() => { setServeurs([]); setAucunMoteur(true); });
  }, []);

  const choisir = (c: string) => {
    setChoix(c);
    setVerdict(null);
    setClefRangee(null);
    setEcran(c !== "ollama" && c !== "llamacpp" ? 1 : 1);
  };

  const rangerLaClef = async () => {
    const res = await fetch("/api/clef", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fournisseur: choix, clef }),
    });
    const data = await res.json();
    if (res.ok && data.presente) setClefRangee({ presente: true, chiffre: !!data.chiffre });
    else setClefRangee(null);
  };

  const jouerEpreuve = async () => {
    setEpreuveEnCours(true);
    setVerdict(null);
    try {
      // Le reglage LLM est ecrit d'abord : l'epreuve et le futur bouton
      // « Tester » des Reglages doivent lire la MEME cible.
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_choix: choix }),
      });
      const res = await fetch("/api/assistant/epreuve");
      setVerdict(await res.json());
    } catch {
      setVerdict({ reussi: false, score: "0/0", manquants: [], defaut: "EPREUVE_IMPROUVABLE" });
    } finally {
      setEpreuveEnCours(false);
    }
  };

  const terminer = async () => {
    setErreurConsignation(null);
    const res = await fetch("/api/assistant/consigner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fournisseur: choix }),
    });
    const data = await res.json();
    if (res.ok && data.ok) onTermine();
    else setErreurConsignation(data.defaut ?? "CONSIGNATION_IMPROUVABLE");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl led-glow-container bg-black/40 border-emerald-500/20 p-8 rounded-2xl">
        <h2 className="text-2xl font-bold text-white mb-1 flex items-center">
          <Brain className="w-6 h-6 text-emerald-400 mr-3" />
          {t.assistantTitre || "Bienvenue dans CLAUS.IO"}
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {(t.assistantSousTitre || "Trois étapes pour équiper l'application de son intelligence.")}{" "}
          <span className="font-mono text-emerald-500 text-xs">
            {["1/3", "2/3", "3/3"][ecran]}
          </span>
        </p>

        {ecran === 0 && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {t.assistantEcran1 || "Choisissez le moteur qui analyse vos documents"}
            </p>
            {serveurs.map((s) => (
              <button
                key={s.port}
                onClick={() => choisir(s.moteur === "ollama" ? "ollama" : "llamacpp")}
                className="w-full text-left p-4 rounded-xl border border-white/10 hover:border-emerald-500/60 transition-all"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  {s.moteur === "ollama"
                    ? <Server className="w-4 h-4 text-emerald-400" />
                    : <Cpu className="w-4 h-4 text-emerald-400" />}
                  {s.moteur}:{s.port}
                  <span className="text-[10px] text-slate-500 font-mono ml-auto">{s.urlBase}</span>
                </span>
              </button>
            ))}
            {aucunMoteur && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                {t.assistantAucunMoteur
                  || "AUCUN_MOTEUR_TROUVE. Trois voies de recours : installez llama.cpp (lançé avec --serveur), installez Ollama, ou choisissez un fournisseur en ligne ci-dessous."}
              </div>
            )}
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                onClick={() => choisir("ollama")}
                className={`px-4 py-2 rounded-lg border text-xs font-bold ${choix === "ollama" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400"}`}
              >
                {t.intelligenceOllama || "Ollama"}
              </button>
              <button
                onClick={() => choisir("llamacpp")}
                className={`px-4 py-2 rounded-lg border text-xs font-bold ${choix === "llamacpp" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400"}`}
              >
                llama.cpp
              </button>
              <span className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 mb-1">
                {t.intelligenceEnLigne || "En ligne"}
              </span>
              {["openai", "mistral", "anthropic", "cohere", "deepseek"].map((f) => (
                <button
                  key={f}
                  onClick={() => choisir(f)}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold ${choix === f ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400"}`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                disabled={choix === ""}
                onClick={() => setEcran(1)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold"
              >
                {t.assistantSuivant || "Continuer"} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {ecran === 1 && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              {enLigne
                ? (t.assistantEcran2Clef || "La clef de l'application")
                : (t.assistantEcran2SansClef || "Ce moteur ne demande pas de clef")}
            </p>
            {enLigne ? (
              <>
                <input
                  type="password"
                  value={clef}
                  onChange={(e) => { setClef(e.target.value); setClefRangee(null); }}
                  placeholder={t.assistantClefPlace || "Collez votre clef d'API"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-slate-500">
                  {t.assistantClefAide
                    || "La clef est rangée dans le trousseau du système (chiffrée). Elle ne figure jamais dans la base ni dans les réglages."}
                </p>
                <button
                  disabled={clef.trim() === ""}
                  onClick={rangerLaClef}
                  className="px-5 py-2.5 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/30 text-xs font-bold disabled:opacity-40"
                >
                  {t.assistantRanger || "Ranger la clef"}
                </button>
                {clefRangee && (
                  <p className={`text-xs font-bold ${clefRangee.chiffre ? "text-emerald-400" : "text-amber-400"}`}>
                    {clefRangee.chiffre
                      ? (t.assistantClefChiffree || "Clef rangée, chiffrée par le système.")
                      : (t.assistantClefNonChiffree || "Clef rangée en local (non chiffrée : mode développement).")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">
                {t.assistantPasDeClef || "Ollama et llama.cpp tournent chez vous : aucune clef n'est nécessaire."}
              </p>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => setEcran(0)}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-bold">
                {t.assistantRetour || "Retour"}
              </button>
              <button
                disabled={enLigne && !clefRangee?.presente}
                onClick={() => setEcran(2)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold"
              >
                {t.assistantSuivant || "Continuer"} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {ecran === 2 && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-emerald-400" />
              {t.assistantEcran3 || "L'épreuve : l'application lit-elle une facture ?"}
            </p>
            <p className="text-sm text-slate-400">
              {t.assistantEpreuveDesc
                || "Une facture de démonstration est lue par le moteur OCR local. Aucun modèle de langage ne complète : ce qui n'est pas lu reste manquant."}
            </p>
            <button
              onClick={jouerEpreuve}
              disabled={epreuveEnCours}
              className="px-5 py-2.5 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/30 text-xs font-bold disabled:opacity-50"
            >
              {epreuveEnCours
                ? (t.assistantEpreuveEnCours || "Lecture de la pièce…")
                : (t.assistantJouerEpreuve || "Lire la facture d'épreuve")}
            </button>
            {verdict && (
              <div className={`p-4 rounded-xl border text-xs font-semibold ${verdict.reussi ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
                {verdict.reussi
                  ? `${t.assistantEpreuveVerte || "Épreuve réussie"} — ${verdict.score}`
                  : `${t.assistantEpreuveRouge || "Épreuve échouée"} — ${verdict.defaut ?? `${verdict.score}${verdict.manquants.length ? " · " + t.assistantManquants + ": " + verdict.manquants.join(", ") : ""}`}`}
              </div>
            )}
            {erreurConsignation && (
              <p className="text-xs font-bold text-rose-400">{erreurConsignation}</p>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => setEcran(enLigne ? 1 : 0)}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-bold">
                {t.assistantRetour || "Retour"}
              </button>
              <button
                disabled={!verdict?.reussi || epreuveEnCours}
                onClick={terminer}
                title={!verdict?.reussi ? (t.assistantBloque || "L'épreuve doit réussir avant de terminer.") : undefined}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold"
              >
                <Check className="w-3.5 h-3.5" />
                {t.assistantTerminer || "Terminer le démarrage"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
