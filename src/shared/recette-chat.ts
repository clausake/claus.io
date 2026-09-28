// Le parseur de recette du chat culinaire (Sprint 16).
//
// La decision du maitre d'ouvrage (consignee au journal, 22/09, appliquee au
// sprint 14.c) : la generation automatique de menu est ANNULEE au profit de
// l'echange avec l'assistant + la sauvegarde des fiches techniques. Ce module
// est le pont entre les deux : le chef discute une recette dans le chat, la
// formate, et le bouton « Sauvegarder en fiche technique » PRE-REMPLIT le
// formulaire — le chef valide/modifie, puis enregistre (POST /api/recipes,
// la voie existante et jugee par les portes recipes*).
//
// Le parseur est PUR et sans devinette : il lit le gabarit que le prompt
// impose au modele (NOM: / INGRÉDIENTS: / ÉTAPES:). Une reponse qui ne suit
// pas le gabarit rend null — le formulaire s'ouvre alors VIDE et le chef
// remplit ; le produit n'invente jamais un ingrédient que le texte ne porte
// pas (la lecon anti-hallucination du sprint 15 vaut aussi ici).

export interface IngredientChat {
  readonly inventory_name: string;
  readonly quantity_per_person: number | null;
  readonly unit: string | null;
}

export interface RecetteChat {
  readonly nom: string;
  readonly ingredients: readonly IngredientChat[];
  readonly etapes: readonly string[];
}

const EN_TETE = /^\s*(?:\*\*)?\s*(NOM|INGR[EÉ]DIENTS?[S:]?|-[ -]?INGR[EÉ]DIENTS?|ÉTAPES?|ETAPES?|PRÉPARATION|PREPARATION)\s*[,:]?\s*(?:\*\*)?\s*[:|]?\s*(.*)$/i;

/** Une ligne d'ingredient : « 300 g de farine » | « farine 300 g » |
 *  « 0,2 L lait » | « 2 gousses d'ail ». La quantite est FRANCAISE (virgule
 *  decimale acceptee ; le point aussi, la sortie OCR du chat n'est pas
 *  une piece — ici c'est du texte modele, les deux ecritures se lisent).
 *  Pas de quantite recognisable => quantite nulle NOMMEE (null), jamais 0
 *  invente : la route traite absent = 0 explicitement, ici on rend la verite. */
export function parseIngredient(ligne: string): IngredientChat | null {
  // On retire la PUCE (« - », « • », « 1. » d'une liste numerotee) mais
  // JAMAIS les chiffres qui portent la quantite (« 300 g » n'est pas une
  // puce). Un strip trop gourmand lisait « 300 g de farine » en « g ».
  const propre = ligne
    .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (propre === "") return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ%°]{1,6})?\s*(?:d[eel]'?\s+|du\s+|des\s+|de\s+|la\s+|les\s+|un\s+|une\s+)?(.+)$/
    .exec(propre);
  if (m && m[3] && m[3].trim() !== "") {
    const brut = m[1].replace(",", ".");
    const n = Number(brut);
    if (!Number.isFinite(n)) return { inventory_name: propre, quantity_per_person: null, unit: null };
    const unit = m[2] && m[2].toLowerCase() !== "d" ? m[2] : null;
    return { inventory_name: m[3].trim(), quantity_per_person: n, unit };
  }
  const m2 = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ%°]{1,6})?$/.exec(propre);
  if (m2 && m2[1].trim() !== "") {
    const n = Number(m2[2].replace(",", "."));
    if (!Number.isFinite(n)) return { inventory_name: m2[1].trim(), quantity_per_person: null, unit: null };
    return { inventory_name: m2[1].trim(), quantity_per_person: n, unit: m2[3] ?? null };
  }
  // ni tete ni queue numerique : nom pur, quantite NON DITE (pas inventee).
  return { inventory_name: propre, quantity_per_person: null, unit: null };
}

/** Le gabarit complete. null si aucun bloc ingrédient/etapes n'est trouvable
 *  (reponse libre du chat) — l'appelant ouvre le formulaire vide. */
export function parserRecette(texte: string): RecetteChat | null {
  if (typeof texte !== "string" || texte.trim() === "") return null;
  const lignes = texte.split(/\r?\n/);
  let section: "aucune" | "nom" | "ingredients" | "etapes" = "aucune";
  let nom = "";
  const ingredients: IngredientChat[] = [];
  const etapes: string[] = [];
  for (const l of lignes) {
    const m = EN_TETE.exec(l);
    if (m) {
      const cle = m[1].toUpperCase();
      const reste = (m[2] ?? "").trim();
      if (cle === "NOM") { section = "nom"; if (reste) nom = reste; continue; }
      if (cle.startsWith("INGR")) {
        section = "ingredients";
        if (reste) {
          // « INGREDIENTS: 200 g riz, 1 dose safran » : la ligne porte
          // plusieurs ingredients separes par virgule — chaque fragment qui
          // porte un chiffre est un ingredient ; sinon c'etait du decor, la
          // ligne tombe en decor et la suite suit le gabarit.
          const morceaux = reste.includes(",") ? reste.split(",") : [reste];
          for (const mor of morceaux) {
            const ing = parseIngredient(mor);
            if (ing) ingredients.push(ing);
          }
        }
        continue;
      }
      if (cle.startsWith("É") || cle === "ETAPES" || cle === "ÉTAPES" || cle.startsWith("PRÉPA") || cle.startsWith("PREPA")) {
        section = "etapes"; if (reste) etapes.push(reste); continue;
      }
      continue;
    }
    const t = l.trim();
    if (t === "") continue;
    if (section === "nom" && nom === "") { nom = t.replace(/^\*\*|\*\*/g, ""); continue; }
    if (section === "ingredients") {
      const ing = parseIngredient(t);
      if (ing) ingredients.push(ing);
      continue;
    }
    if (section === "etapes") {
      // la puce numerotee (« 1. … ») est un ornement du texte modele : la
      // colonne preparation_steps de la fiche garde l'etape nue.
      etapes.push(t.replace(/^\d+[.)]\s+/, ""));
      continue;
    }
  }
  if (ingredients.length === 0 && etapes.length === 0) return null;
  if (nom === null || nom === undefined) return null;
  return { nom, ingredients, etapes };
}

/** L'historique du chat, borne et assaini AVANT d'entrer dans le prompt :
 *  12 derniers messages, roles user|assistant seulement, chaines seulement,
 *  4 000 caracteres par message (le modele local n'a pas une fenetre infinie
 *  et un texte geometrique n'est pas une conversation). */
export interface MessageChat {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export function historiqueSur(messages: unknown): MessageChat[] {
  if (!Array.isArray(messages)) return [];
  const propres = messages
    .filter((m): m is MessageChat =>
      !!m && typeof m === "object" &&
      (m as MessageChat).role !== undefined &&
      typeof (m as MessageChat).content === "string" &&
      ((m as MessageChat).role === "user" || (m as MessageChat).role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  return propres.slice(-12);
}

/** Le bloc d'historique injecte dans le prompt du chat (le tour en cours est
 *  porte par `message`, pas par l'historique). */
export function blocHistorique(messages: unknown): string {
  const h = historiqueSur(messages);
  if (h.length === 0) return "";
  const lignes = h.map((m) => `${m.role === "user" ? "LE CHEF" : "TOI"}: ${m.content}`);
  return `La conversation actuelle (le chef t'a deja dit, reponds dans la CONTINUITE — ne recommence pas la recette depuis zero) :\n${lignes.join("\n")}\n---\n`;
}

/** Le gabarit exige du modele quand il propose UNE recette : c'est ce que le
 *  parseur lit, donc ce que le bouton « Sauvegarder en fiche technique »
 *  pre-remplit. Sans cette consigne la reponse est libre et le parseur rend
 *  null (formulaire vide) — jamais de devinette. */
export const CONSIGNE_GABARIT =
  "Quand tu proposes UNE recette complete, termine ton message par ce bloc exact:\n" +
  "NOM: <nom du plat>\n" +
  "INGRÉDIENTS:\n- <quantité> <unité> <ingrédient>\n" +
  "ÉTAPES:\n1. <étape>\n" +
  "Une quantité française s'écrit avec la virgule (0,2 L). Ne calcule aucun prix.";
