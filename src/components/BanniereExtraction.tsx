// Banniere globe du suivi d'extraction IA (C38-B).
//
// Montee UNE SEULE fois, dans App.tsx, HORS de la navigation : l'extraction
// d'un document peut durer longtemps (OCR + LLM), le maitre change d'onglet
// pendant — la banniere reste visible et dit la verite : en cours / terminee
// (formulaire pret dans Documents) / echouee.
//
// La source de verite est le store de module extraction-suivi.ts (memoire de
// session, regle d'atelier-chat.ts). Cette banniere LIT, n'ecrit jamais :
// l'erreur est toastee par le composant vivant (DocumentManager) qui l'a
// accusee — la banniere ne montre l'erreur non accusee que si le
// reponsable dead (demonte au moment de l'echec).

import React, { useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  sAbonner,
  instantane,
} from "../shared/extraction-suivi.js";

export function BanniereExtraction() {
  const suivi = useSyncExternalStore(sAbonner, instantane);

  if (!suivi.enCours && !suivi.erreur && !suivi.reponse) return null;
  // l'erreur accusee a deja ete toassee par le composant vivant
  if (suivi.erreur !== null && suivi.erreurLue) return null;

  const enCours = suivi.enCours;
  const enErreur = !enCours && suivi.erreur !== null;
  const livre = !enCours && !enErreur && suivi.reponse !== null && !suivi.delivre;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
      role="status"
      aria-live="polite"
      style={{
        background: "rgba(10, 10, 10, 0.95)",
        backdropFilter: "blur(8px)",
        borderColor: enErreur
          ? "rgba(239, 68, 68, 0.4)"
          : enCours
            ? "rgba(16, 185, 129, 0.4)"
            : "rgba(59, 130, 246, 0.4)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {enCours ? (
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          ) : enErreur ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-blue-400" />
          )}
        </div>
        <div>
          <div className="text-sm font-bold text-white">
            {enCours
              ? "Extraction IA en cours…"
              : enErreur
                ? "Extraction IA échouée"
                : "Extraction IA terminée"}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {suivi.documentNom && (
              <span className="font-mono">{suivi.documentNom}</span>
            )}
            {enCours && " — vous pouvez changer d'onglet, l'extraction continue"}
            {enErreur && ` — ${suivi.erreur}`}
            {livre &&
              " — formulaire de validation prêt dans l'onglet Documents"}
          </div>
        </div>
      </div>
    </div>
  );
}
