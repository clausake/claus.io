// Store de module du suivi d'extraction IA (C38-B) — l'extraction d'un
// document survit au changement d'onglet.
//
// Defaut mesure (capture du maitre d'ouvrage, 06/11) : le maitre donne un
// document a extraire par IA, change d'onglet, et a son retour la reponse
// est perdue — le fetch etait porte par DocumentManager.tsx (handleExtract
// FromDraft), demonter = formulaire pre-rempli jamais rendu.
//
// Ce store suit la MEME regle qu'atelier-chat.ts (P3, plan 014) :
//  - memoire de SESSION uniquement : rien sur le disque, aucune cle
//    localStorage/sessionStorage (surface de confidentialite d'un poste
//    partage) ;
//  - compatible useSyncExternalStore : sAbonner/instantane, reference stable
//    entre les notifications ;
//  - lancer() porte le fetch (transport injectable pour les tests) : le
//    composant peut etre demonte, la reponse atterrit quand meme dans
//    l'instantane ;
//  - garde : UNE SEULE extraction a la fois (contrat identique a envoyer()
//    d'atelier-chat) ;
//  - la reponse est LIVREE : au remontage de Documents, le composant lit la
//    reponse brute (matching inventaire fait avec l'etat vivant), ouvre le
//    formulaire, puis l'ACCUSE. Tant qu'un composant vivant n'accuse pas, la
//    reponse reste dans l'instantane (deliverie idempotente).

/** Reponse brute du serveur a l'extraction, stockee pour livraison au
 *  remontage du composant vivant. */
export interface ReponseExtraction {
  documentId: string;
  /** Le corps JSON brut du serveur (data.items, data.type, supplier, ...). */
  corps: Record<string, unknown>;
}

export interface InstantaneExtraction {
  enCours: boolean;
  documentId: string | null;
  /** Nom affichable du document (type + fournisseur si connu). */
  documentNom: string | null;
  /** La CHAINE qui a lance le fetch (documents | haccp) : chaque composant
   *  vivant ne livre que LE genre qui le concerne (C39). */
  genre: "documents" | "haccp";
  /** Reponse du serveur en attente de livraison (null si nothing). */
  reponse: ReponseExtraction | null;
  /** true des qu'un composant vivant a applique la reponse. */
  delivre: boolean;
  erreur: string | null;
  /** true des qu'un composant vivant a lu (toaste) l'erreur : la banniere
   *  globale peut alors l'eteindre. */
  erreurLue: boolean;
}

let etatCourant: InstantaneExtraction = {
  enCours: false,
  documentId: null,
  documentNom: null,
  genre: "documents",
  reponse: null,
  delivre: false,
  erreur: null,
  erreurLue: false,
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
export function instantane(): InstantaneExtraction {
  return etatCourant;
}

function remplacer(nouveau: Partial<InstantaneExtraction>) {
  etatCourant = { ...etatCourant, ...nouveau };
  notifier();
}

/** Le composant vivant signale qu'il a applique la reponse au formulaire :
 *  elle disparait alors du statut « en attente de livraison » (idempotent). */
export function accuserDelivre(documentId: string) {
  const etat = instantane();
  if (etat.reponse?.documentId === documentId && !etat.delivre) {
    remplacer({ delivre: true, reponse: null });
  }
}

/** Le composant vivant signale qu'il a affiche (toast) l'erreur localement :
 *  la banniere globale peut l'eteindre. (idempotent) */
export function marquerErreurLue() {
  const etat = instantane();
  if (etat.erreur !== null && !etat.erreurLue) {
    remplacer({ erreurLue: true });
  }
}

/** Pour les tests : injecte un etat. */
export function poserEtat(partial: Partial<InstantaneExtraction>) {
  remplacer(partial);
}

/**
 * Lance l'extraction IA d'un document et depose la reponse dans le store —
 * meme si l'appelant est demonte entre-temps (c'est LA reparation C38-B).
 * Garde : une seconde extraction est REFUSEE tant qu'une extraction est
 * en cours. `transport` est injectable pour les tests ; le defaut est le
 * vrai fetch POST /api/documents/:id/extract.
 */
export async function lancer(
  documentId: string,
  documentNom: string,
  opts: {
    /** La chaine qui porte le fetch. Defaut : "documents". */
    genre?: "documents" | "haccp";
    transport?: (id: string) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>;
  } = {},
): Promise<{ lance: boolean; erreur?: string }> {
  const etat = instantane();
  if (etat.enCours) return { lance: false, erreur: "EXTRACTION_EN_COURS" };

  remplacer({
    enCours: true,
    documentId,
    documentNom,
    genre: opts.genre ?? "documents",
    reponse: null,
    delivre: false,
    erreur: null,
    erreurLue: false,
  });

  const transport =
    opts.transport ??
    ((id: string) =>
      fetch(`/api/documents/${id}/extract`, { method: "POST" }));

  try {
    const reponse = await transport(documentId);
    const corps = (await reponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!reponse.ok) {
      const message =
        String(corps?.message ?? "") ||
        "Erreur lors de l'extraction IA du document.";
      remplacer({ enCours: false, erreur: message, erreurLue: false });
      return { lance: true, erreur: message };
    }
    remplacer({
      enCours: false,
      reponse: { documentId, corps },
      erreur: null,
      erreurLue: false,
    });
    return { lance: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur de connexion au serveur.";
    remplacer({ enCours: false, erreur: message, erreurLue: false });
    return { lance: true, erreur: message };
  }
}
