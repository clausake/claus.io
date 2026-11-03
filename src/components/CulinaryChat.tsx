import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MessageSquare,
  Mic,
  MicOff,
  Send,
} from "lucide-react";
import { historiqueSur } from "../shared/recette-chat";
import { sAbonner, instantane, envoyer } from "../shared/atelier-chat";

// Le chat culinaire (Sprint 16).
//
// La decision du maitre d'ouvrage (consignee au journal, 22/09 ; appliquee au
// sprint 14.c qui a retire la generation automatique des trois menus) : le
// chef AFFINE ses recettes EN DISCUTANT avec l'assistant — plus de generation
// « diversite ». Nees ici, les recettes se rangent en cartes Entree / Plat /
// Dessert dans l'onglet Ingenierie des Menus et se sauvegardent en fiches
// techniques apres VALIDATION du chef (le geste, jamais l'automatisme).
//
// Deux regles de porte, « le chat ne fabule pas » :
//  - l'historique de l'echange est PORTE AU SERVEUR (bloque sans lui, « et en
//    version vegane ? » repond hors sujet et « sauvegarde ca » ne designe
//    rien) ; le serveur le borne et nettoie les roles.
//  - chaque reponse est remise BRUTE a `onProposition` : c'est l'onglet qui
//    la LIT (parserRecette) — une reponse sans gabarit lisible ne produit
//    AUCUNE carte. Le chat, lui, n'invente rien ni n'ecrit rien en base.
export function CulinaryChat({
  t,
  settings,
  onProposition,
}: {
  t: Record<string, string>;
  settings: Record<string, unknown>;
  // Remet le CONTENU BRUT de chaque reponse de l'assistant. L'interpretation
  // (lecture en recette) appartient a l'onglet, pas au chat.
  onProposition?: (contenu: string) => void;
}) {
  // P3 (plan 014) : l'historique et la reponse vivent dans le store de module
  // (src/shared/atelier-chat.ts), PAS dans le composant. Le fetch y est porte :
  // l'IA peut finir d'ecrire pendant que l'onglet est demonte — c'est la
  // reparation du defaut « l'IA ecrit, je change d'onglet, tout est parti ».
  // Le message d'accueil est l'etat INITIAL du store, plus un effet.
  const etat = useSyncExternalStore(sAbonner, instantane);
  const messages = etat.messages;
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const isLoading = etat.enCours;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang =
        settings.language === "fr"
          ? "fr-FR"
          : settings.language === "es"
            ? "es-ES"
            : settings.language === "de"
              ? "de-DE"
              : "en-US";

      recognitionRef.current.onresult = (event: {results: {0: {0: {transcript: string}}}}) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: {error?: string}) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [settings.language]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    // Le fetch est dans le store : le composant peut etre demonte, la reponse
    // atterrit quand meme (et `onProposition` n'est joue que si nous sommes
    // encore montes — la redrivaison des cartes prend le relais sinon, R3).
    const r = await envoyer(userMessage, { t, historiqueSur });
    if (r.envoye && r.contenu !== undefined && !r.erreur && onProposition) {
      onProposition(r.contenu);
    }
  };

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex-none">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
          <MessageSquare className="w-6 h-6 mr-3 text-emerald-500" />
          {t.culinaryAssistant}
        </h2>
        <p className="text-slate-500 mt-1">{t.chatSubtitle}</p>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === "user"
                  ? "bg-emerald-600 text-white rounded-tr-sm"
                  : "bg-[#1A1A1A] text-slate-200 border border-white/10 rounded-tl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl rounded-tl-sm p-4 flex space-x-2 items-center">
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#0A0A0A] border-t border-white/10">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.chatPlaceholder}
              className="w-full bg-black border border-white/10 rounded-xl pl-4 pr-12 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "text-slate-500 hover:text-emerald-500"
              }`}
            >
              {isListening ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
