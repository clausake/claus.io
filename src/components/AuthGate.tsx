import React, { useCallback, useEffect, useState } from "react";
import { ChefHat, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { cdFetch } from "../lib/cdFetch";

type Etat = "chargement" | "setup" | "login" | "pret";

export interface Utilisateur {
  id: string;
  username: string;
  role: "maitre" | "staff" | "agent";
}

interface Props {
  onUser: (u: Utilisateur | null) => void;
  // Incremente par App quand l'utilisateur demande la deconnexion : AuthGate
  // detruit la session COTE SERVEUR (pas seulement l'etat local — un cookie
  // laisse en place serait une session valide dans les fichiers temporaires
  // du navigateur) puis affiche l'ecran de connexion.
  logoutSignal: number;
  children: React.ReactNode;
}

// Le garde d'identite de TOUTE l'application. Trois ecrans possibles au boot :
//   - chargement : /api/auth/me en vol (on ne rend RIEN du metier avant de
//     savoir qui parle — sinon les effets d'App partent sans session)
//   - setup : installation vierge (aucun compte) — le premier compte devient
//     maitre (le serveur le garantit, l'UI ne fait que presenter le formulaire)
//   - login : des comptes existent
// Une fois pret, on rend les children — et on reste a l'ecoute : une mutation
// 401 (session expiree/revolue) ramene a l'ecran de connexion.
export function AuthGate({ onUser, logoutSignal, children }: Props) {
  const [etat, setEtat] = useState<Etat>("chargement");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const verifier = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const data = await me.json();
        onUser(data.user);
        setEtat("pret");
        return;
      }
      const etatRep = await fetch("/api/auth/etat");
      const e = etatRep.ok ? await etatRep.json() : {};
      setErreur(null);
      setEtat(e.setup_requis ? "setup" : "login");
    } catch {
      // Serveur injoignable : on ne boucle pas, on montre la voie de reprise.
      setErreur("Serveur injoignable. Reessayez.");
      setEtat("login");
    }
  }, [onUser]);

  useEffect(() => {
    verifier();
  }, [verifier]);

  // Deconnexion demandee par le menu profil : detruire la session en base
  // (le cookie seul ne suffirait pas — la ligne sessions resterait valide).
  useEffect(() => {
    if (logoutSignal > 0) {
      cdFetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          onUser(null);
          setEtat("login");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoutSignal]);

  // Une mutation 401 n'importe ou dans l'app (session expiree ou revoquee) :
  // retour a l'ecran de connexion, jamais un silence.
  useEffect(() => {
    const expiree = () => {
      onUser(null);
      setErreur("Session expiree. Reconnectez-vous.");
      setEtat("login");
    };
    window.addEventListener("cd-auth-expiree", expiree);
    return () => window.removeEventListener("cd-auth-expiree", expiree);
  }, [onUser]);

  const soumettre = async (url: string, username: string, password: string) => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await cdFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onUser(data.user);
        setEtat("pret");
      } else {
        setErreur(data.message || data.error || "Echec de l'operation.");
      }
    } catch {
      setErreur("Serveur injoignable. Reessayez.");
    } finally {
      setOccupe(false);
    }
  };

  if (etat === "pret") return <>{children}</>;

  if (etat === "chargement") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const setup = etat === "setup";
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
              : "RESTAURATION IO — identifiez-vous pour acceder a la cuisine."}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const username = String(f.get("username") || "").trim();
              const password = String(f.get("password") || "");
              if (setup && f.get("confirmation") !== password) {
                setErreur("La confirmation ne correspond pas au mot de passe.");
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
        RESTAURATION IO Intelligent System
      </div>
    </div>
  );
}
