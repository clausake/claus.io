import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { cdFetch } from "../lib/cdFetch";

interface Compte {
  id: string;
  username: string;
  role: "maitre" | "staff" | "agent";
  active: number | boolean;
  created_at: string;
}

const LIBELLE_ROLE: Record<string, string> = {
  maitre: "Maitre",
  staff: "Staff",
  agent: "Agent",
};

const STYLE_ROLE: Record<string, string> = {
  maitre: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  staff: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  agent: "bg-violet-500/10 text-violet-300 border-violet-500/30",
};

// Page comptes du maitre (chantier 1). Le serveur refuse deja tout ce qui
// n'est pas maitre (403 MAITRE_REQUIS) ; l'UI ne fait que presenter les quatre
// gestes prevus : lister, creer, (des)activer, reinitialiser le mot de passe.
// Aucun bouton de suppression : le serveur desactive, il n'efface pas —
// l'historique d'un etablissement n'est pas un registre a trous.
export function AccountsView({ moi }: { moi: { username: string; role: string } }) {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [resetOuvert, setResetOuvert] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    setErreur(null);
    try {
      const res = await cdFetch("/api/users");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setComptes(data.users || []);
      } else {
        setErreur(data.message || data.error || "Chargement impossible.");
      }
    } catch {
      setErreur("Serveur injoignable.");
    } finally {
      setCharge(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const creer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await cdFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(f.get("username") || "").trim(),
          password: String(f.get("password") || ""),
          role: String(f.get("role") || "staff"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(`Compte ${data.user?.username || ""} cree.`);
        (e.target as HTMLFormElement).reset();
        await charger();
      } else {
        setErreur(data.message || data.error || "Creation refusee.");
      }
    } catch {
      setErreur("Serveur injoignable.");
    } finally {
      setOccupe(false);
    }
  };

  const basculer = async (c: Compte) => {
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await cdFetch(`/api/users/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await charger();
      } else {
        setErreur(data.message || data.error || "Changement refuse.");
      }
    } catch {
      setErreur("Serveur injoignable.");
    } finally {
      setOccupe(false);
    }
  };

  const reinitialiser = async (c: Compte, password: string) => {
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await cdFetch(`/api/users/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(`Mot de passe de ${c.username} reinitialise.`);
        setResetOuvert(null);
      } else {
        setErreur(data.message || data.error || "Reinitialisation refusee.");
      }
    } catch {
      setErreur("Serveur injoignable.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white mb-1">Comptes</h1>
          <p className="text-slate-400 font-light">
            Gestion reservee au maitre. L'agent ne peut rien ecrire : il informe, l'humain execute.
          </p>
        </div>
        <button
          onClick={charger}
          disabled={occupe}
          className="p-3 rounded-xl bg-obsidian border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors"
          aria-label="Rafraichir"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {(erreur || message) && (
        <p
          className={`mb-4 text-sm font-medium ${erreur ? "text-red-400" : "text-emerald-400"}`}
          data-testid="comptes-message"
        >
          {erreur || message}
        </p>
      )}

      {/* Creation */}
      <form
        onSubmit={creer}
        className="bg-obsidian border border-white/10 rounded-2xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end"
      >
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1 font-bold">Nom d'utilisateur</label>
          <input
            name="username"
            required
            minLength={3}
            className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-2.5 outline-none transition-colors"
            placeholder="ex: sophie"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1 font-bold">Mot de passe</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-2.5 outline-none transition-colors"
            placeholder="8 caracteres minimum"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1 font-bold">Role</label>
          <select
            name="role"
            defaultValue="staff"
            className="bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-4 py-2.5 outline-none"
          >
            <option value="staff">Staff</option>
            <option value="agent">Agent (lecture seule)</option>
            <option value="maitre">Maitre</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={occupe}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl transition-all border border-emerald-400/30 flex items-center gap-2 whitespace-nowrap"
        >
          {occupe ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Creer
        </button>
      </form>

      {/* Liste */}
      {charge ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {comptes.map((c) => {
            const actif = Boolean(c.active);
            return (
              <div
                key={c.id}
                className="bg-obsidian border border-white/10 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-4"
              >
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STYLE_ROLE[c.role] || ""}`}>
                      {LIBELLE_ROLE[c.role] || c.role}
                    </span>
                    <span className="text-white font-medium">{c.username}</span>
                    {!actif && <span className="text-xs text-red-400 font-medium">desactive</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> cree le {String(c.created_at).slice(0, 10)}
                  </div>
                </div>

                {resetOuvert === c.id && (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="Nouveau mot de passe"
                      minLength={8}
                      required
                      data-testid={`reset-password-${c.username}`}
                      onChange={(e) => {
                        (e.target as HTMLInputElement).dataset.valeur = e.target.value;
                      }}
                      className="bg-[#0a0a0a] border border-slate-800 focus:border-emerald-500/50 text-white rounded-xl px-3 py-2 text-sm outline-none"
                    />
                    <button
                      onClick={() => {
                        const el = document.querySelector<HTMLInputElement>(
                          `[data-testid="reset-password-${c.username}"]`,
                        );
                        const valeur = el?.dataset.valeur || "";
                        if (valeur.length >= 8) reinitialiser(c, valeur);
                        else setErreur("8 caracteres minimum.");
                      }}
                      disabled={occupe}
                      className="text-sm font-bold text-emerald-400 hover:text-emerald-300 px-3 py-2 disabled:opacity-50"
                    >
                      Valider
                    </button>
                    <button
                      onClick={() => setResetOuvert(null)}
                      className="text-sm text-slate-500 hover:text-slate-300 px-2 py-2"
                    >
                      Annuler
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {resetOuvert !== c.id && (
                    <button
                      onClick={() => setResetOuvert(c.id)}
                      disabled={occupe}
                      className="text-sm text-slate-400 hover:text-emerald-400 px-3 py-2 disabled:opacity-50 transition-colors"
                    >
                      Reinitialiser le mot de passe
                    </button>
                  )}
                  <button
                    onClick={() => basculer(c)}
                    disabled={occupe}
                    className={`text-sm px-4 py-2 rounded-xl font-medium border transition-colors disabled:opacity-50 ${
                      actif
                        ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                        : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    {actif ? "Desactiver" : "Reactiver"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
