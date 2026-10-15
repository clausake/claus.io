import React from "react";
import {
  ChefHat,
  Sparkles,
} from "lucide-react";

export function LandingPage({ onEnter, t }: { onEnter: () => void; t: Record<string, string> }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative overflow-hidden text-slate-200">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[100px]" />
      </div>

      <div className="z-10 text-center max-w-3xl px-6 led-glow-container p-12 rounded-3xl">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/30 backdrop-blur-xl">
            <ChefHat className="w-12 h-12 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-white mb-6 tracking-tight">
          {t.landingTitle || "LOGICIEL DE GESTION"}{" "}
          <span className="text-emerald-400">claus.io</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 mb-12 font-light leading-relaxed">
          {t.landingSubtitle ||
            "L'intelligence artificielle au service de la restauration et la haute gastronomie."}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onEnter}
            className="px-8 py-4 bg-emerald-600 text-white rounded-full font-medium text-lg hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            {t.accessKitchen || "Accéder à la Cuisine"}
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 text-slate-500 text-sm font-medium tracking-wider uppercase font-mono">
        claus.io — Intelligent Kitchen System
      </div>
    </div>
  );
}
