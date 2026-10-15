// Ecran d'identite (login / premier demarrage) — separe du noyau AuthGate.
// Chargé en lazy par AuthGate : la gate elle-meme (etat + verifier + effets)
// reste dans le chunk d'entree, le formulaire ne part que si on DOIT se
// connecter. Raison: la porte verify-bundle plafonne le chunk d'entree a
// 620 000 octets et AuthGate y pesait ~9 Ko dont ce formulaire.
import React, { useState } from "react";
import { ChefHat, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { cdFetch } from "../lib/cdFetch";

interface Props {
  setup: boolean;
  occupe: boolean;
  erreur: string | null;
  soumettre: (url: string, username: string, password: string) => void;
}

export default function EcranIdentite({ setup, occupe, erreur, soumettre }: Props) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative overflow-hidden text-slate-200">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[100px]" />
      </div>

      <div className="z-10 w-full max-w-md px-6">
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/30 backdrop-blur-xl">
            <ChefHat className="w-10 h-10 text-emerald-400" />
          </div>
        </div>

        <div className="bg-obsidian border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black backdrop-blur-xl">
          <h1 className="text-2xl font-serif font-bold text-white mb-1 tracking-tight">
            {setup ? "Premier demarrage" : "Connexion"}
          </h1>
          <p className="text-sm text-slate-400 mb-8 font-light">
            {setup
              ? "Creez le premier compte de l'etablissement : il devient maitre."
              : "claus.io — identifiez-vous pour acceder a la cuisine."}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const username = String(f.get("username") || "").trim();
              const password = String(f.get("password") || "");
              if (setup && f.get("confirmation") !== password) {
                // La confirmation est jugee ici : setErreur appartient a la gate.
                const evt = new CustomEvent("cd-auth-erreur", { detail: "La confirmation ne correspond pas au mot de passe." });
                window.dispatchEvent(evt);
                return;
              }
              soumettre(setup ? "/api/auth/setup" : "/api/auth/login", username, password);
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">
                Nom d'utilisateur
              </label>
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-3 outline-none transition-colors"
                placeholder="ex: clausake"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">
                Mot de passe
              </label>
              <input
                name="password"
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                required
                minLength={8}
                className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-3 outline-none transition-colors"
                placeholder={setup ? "8 caracteres minimum" : "••••••••"}
              />
            </div>
            {setup && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">
                  Confirmer le mot de passe
                </label>
                <input
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-3 outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>
            )}

            {erreur && (
              <p className="text-red-400 text-sm font-medium" data-testid="auth-erreur">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={occupe}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-400/30 flex items-center justify-center gap-2"
            >
              {occupe ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : setup ? (
                <UserPlus className="w-5 h-5" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {setup ? "Creer le compte maitre" : "Se connecter"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            {setup
              ? "Ce compte aura tous les droits (maitre)."
              : "Session locale — 12 h, rien ne sort de l'etablissement."}
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 text-slate-500 text-sm font-medium tracking-wider uppercase font-mono">
        claus.io — Intelligent Kitchen System
      </div>
    </div>
  );
}
