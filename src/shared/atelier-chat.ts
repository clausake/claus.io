// Store de module du chat (P3, plan 014) — la reponse de l'IA et l'historique
// survivent au changement d'onglet.
//
// Defaut mesure le 02/11 sur le poste du maitre : l'IA ecrit, le maitre change
// d'onglet pour regarder une fiche, et a son retour la conversation est vide —
// le fetch etait porte par le composant, demonter = reponse perdue.
//
// Ce que ce store est, et n'est pas :
//  - memoire de SESSION uniquement : rien sur le disque, aucune cle
//    localStorage/sessionStorage (la surface de confidentialite d'un poste
//    partage ne bouge pas) ;
//  - compatible useSyncExternalStore : sAbonner/instantane, reference stable
//    entre les notifications ;
//  - envoyer() porte le fetch : le composant peut etre demonte, la reponse
//    atterrit quand meme dans l'instantane ;
//  - bornes (R4) : 200 messages, les plus vieux sortent. La fenetre ENVOYEE au
//    serveur reste historiqueSur(messages) (12) — contrat serveur, intouchable.
import type { MessageChat } from "./recette-chat.js";

/** Nombre max de messages conserves en memoire de session (R4). */
export const CAP_MESSAGES = 200;

export interface InstantaneChat {
  messages: MessageChat[];
  /** Contenu BRUT de la derniere reponse de l'assistant : MenuAnalysis le
   *  re-derive a chaque remontage (R3 : idempotent, le parseur n'est pas ici). */
  derniereReponse: string | null;
  enCours: boolean;
}

const BIENVENUE =
  "Bonjour ! Je suis votre assistant culinaire. Posez-moi vos questions sur la cuisine, les recettes, ou les techniques !";

let etatCourant: InstantaneChat = {
  messages: [{ role: "assistant", content: BIENVENUE }],
  derniereReponse: null,
  enCours: false,
};
const abonnes = new Set<() => void>();

function notifier() {
  for (const f of abonnes) f();
}

export function sAbonner(fn: () => void): () => void {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}

/** Reference STABLE entre les notifications (contrat useSyncExternalStore). */
export function instantane(): InstantaneChat {
  return etatCourant;
}

function remplacer(nouveau: Partial<InstantaneChat>) {
  etatCourant = { ...etatCourant, ...nouveau };
  notifier();
}

/** Pousse un message en appliquant la borne (les plus vieux sortent, le
 *  message le plus recent est toujours garde). */
function pousser(messages: MessageChat[], msg: MessageChat): MessageChat[] {
  const suivants = [...messages, msg];
  return suivants.length > CAP_MESSAGES ? suivants.slice(-CAP_MESSAGES) : suivants;
}

/** L'etat initial rendu par le store, independant du composant. */
export function messagesInitiaux(): MessageChat[] {
  return etatCourant.messages;
}

/**
 * Envoie `message` a /api/ai/chat et depose la reponse dans le store — meme
 * si l'appelant est demonte entre-temps (c'est LA reparation).
 * Garde : un second envoi est REFUSE tant qu'un envoi est en cours.
 * `transport` est injectable pour les tests ; le defest est le vrai fetch.
 */
export async function envoyer(
  message: string,
  opts: {
    t?: Record<string, string>;
    transport?: (body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }>;
    historiqueSur?: (messages: MessageChat[]) => MessageChat[];
  } = {},
): Promise<{ envoye: boolean; contenu?: string; erreur?: string }> {
  const etat = instantane();
  if (etat.enCours) return { envoye: false, erreur: "ENVOI_EN_COURS" };
  const texte = message.trim();
  if (texte === "") return { envoye: false, erreur: "MESSAGE_VIDE" };

  const t = opts.t ?? {};
  // L'historique PORTE est l'echange tel qu'il est AVANT ce tour (le message
  // en cours part par `message`, pas par l'historique).
  const fenetre = (opts.historiqueSur ?? ((m: MessageChat[]) => m))(etat.messages);

  remplacer({ messages: pousser(etat.messages, { role: "user", content: texte }), enCours: true });

  const transport = opts.transport ?? ((body: Record<string, unknown>) =>
    fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

  try {
    const reponse = await transport({ message: texte, history: fenetre });
    const data = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
    const contenu = String(
      reponse.ok
        ? (data.response ?? "")
        : (t["chatError"] ?? (data.response ?? "")),
    );
    remplacer({
      messages: pousser(etatCourant.messages, { role: "assistant", content: contenu }),
      derniereReponse: reponse.ok ? contenu : etatCourant.derniereReponse,
      enCours: false,
    });
    return { envoye: true, contenu };
  } catch {
    const contenu = String(t["chatServerError"] ?? t["chatError"] ?? "Le serveur n'a pas repondu.");
    remplacer({
      messages: pousser(etatCourant.messages, { role: "assistant", content: contenu }),
      enCours: false,
    });
    return { envoye: true, contenu, erreur: "SERVEUR" };
  }
}

/** Pour les tests (et le bouton « nouvelle conversation » du chat) : retour a
 *  l'etat initial, sans disque. */
export function reinitialiser() {
  remplacer({ messages: [{ role: "assistant", content: BIENVENUE }], derniereReponse: null, enCours: false });
}

/** Injecte un etat (tests de redrivaison : R3). */
export function poserEtat(partial: Partial<InstantaneChat>) {
  remplacer(partial);
}
