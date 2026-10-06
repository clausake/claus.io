import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cdFetch } from "../lib/cdFetch";

// L'ecran d'identite (formulaire login/setup) est charge en lazy : la gate
// elle-meme doit vivre dans le chunk d'entree (elle bloque TOUT), mais son
// formulaire ne part que si on doit reellement se connecter — la porte
// verify-bundle plafonne l'index a 620 000 octets.
const EcranIdentite = lazy(() => import("./EcranIdentite"));

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

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      }
    >
      <EcranIdentite
        setup={etat === "setup"}
        occupe={occupe}
        erreur={erreur}
        soumettre={soumettre}
      />
    </Suspense>
  );
}
