// Source UNIQUE des regles de forme des LIGNES de document (document_items).
//
// POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'EST PAS CELUI DES COLONNES
// D'INVENTAIRE. `src/shared/inventory-fields.ts` porte les memes TYPES de regle
// (bornes, lecture d'un nombre de saisie, texte non blanc) mais jugent le STOCK;
// les lignes de facture, elles, ne sont pas du stock: ce sont une PROPOSITION.
// Une quantite de facture peut donc legitimement etre nulle (un avoir, un don),
// alors qu'un prix ne peut jamais etre negatif (un credit est un mouvement, pas
// un tarif). Recopier les bornes de l'inventaire ici ferait de la ligne de
// facture une copie perimee le jour ou l'une des deux evole — la lecon des
// `BUDGETS` de l'auditeur, puis celle des TROIS portes de prix du Sprint 7.
//
// DEUX PORTES, UNE SEULE PREDICAT. `document_items` est ecrit par:
//   - `POST /api/documents`            (DocumentManager: saisie manuelle + import
//     de facture)              -> src/routes/documents.ts
//   - `POST /api/purchasing/order`     (Purchasking: bon de commande)
//                              -> src/routes/suppliers.ts
// Chacune debouche sur un liseur de decision qui IGNORE le compte-rendu de
// l'autre (`if (res.ok)` sans branche d'echec cote Documents, `await fetch(...)`
// sans meme lire la reponse cote Purchasking): un 400 muet y est un document ou
// un bon QUI N'EXISTE PAS, et le chef croit l'avoir enregistre. C'est la classe
// de faute la plus chere du depot (Sprint 7: « une porte ne prouve que la voie
// qu'elle arpente »). La predicat d'acceptation est donc UNIQUE ici; seule la
// SEMANTIQUE DU REFUS reste dans chaque route, parce qu'elle est propre a sa
// voie et ne doit pas etre confondu avec celle de sa voisine.
//
// La classe de faute fermee est MESUREE, sonde rejouable
// `scripts/probe-document-items-voices.mjs` (instance isolee + relecture EN
// BASE par l'API du depot), avant correctif:
//   A/B/C  `quantity: ""` ou `"beaucoup"` -> 200 et la ligne est en base en
//          `typeof = 'text'` dans une colonne `REAL NOT NULL` (l'affinite
//          dynamique de SQLite ne verifie RIEN): 3 lignes sur les 7 semees.
//   D/E/F  `quantity` absente, `items` absent ou non-tableau -> 500 muet
//          « Failed to save document »: le chef ne sait pas quoi corriger.
//   G      `inventory_id` inexistante -> 200 et ligne ORPHELINEE en base; la
//          validation qui suit fait `UPDATE inventory ... WHERE id = <clef>` de
//          0 ligne SANS ERREUR. Un bon orpheline ne peut JAMAIS devenir du stock.
//   H      `total_amount: "42,50"` survit en `typeof='text'` dans une colonne
//          REAL, pendant que `"42.50"` y est un REAL. Une saisie, deux issues.
//
// ⚠ LE `""` DE L'ECRAN N'EST PAS UN NOMBRE, ET CE N'EST PAS NON PLUS UN 0.
// `DocumentManager` handleAddItem initialise chaque ligne a
// `{quantity: "", unit_price: ""}` (les champs vides d'un formulaire) et
// handleSubmit les aplatit en `parseFloat(x) || 0`: un bouton « Ajouter une
// ligne » sans rien saisir devent, par la voie REELLE de l'UI, un 0. Ce n'est
// pas une decision du produit, c'est le residu d'un parse. Aucun nombre de ce
// module ne fabrique donc un 0 sur un texte blanc — il le REFUSE et le NOMME.
// (Mesure jumelle au Sprint 7: `import-analyze` faisait `Number(raw) || 0` et
// fabriquait un ingredient GRATUIT que le chef cochait a l'ecran.)

import type { Database } from "sqlite";

/** Bornes des colonnes numeriques d'une ligne de document. */
export const COLONNES_NUM_LIGNE = {
  // 0 est EXPRESSEMENT permis cote facture: ligne d'avoir, produit offert,
  // solde nul. La voie du bon de commande le refuse (voir `minimumDeQuantite`).
  quantity: { min: 0, max: 1_000_000 },
  // Un prix de ligne ne peut pas etre negatif: un credit est un mouvement de
  // stock, pas un tarif. C'est la mesure D1_PRIX_STOCK=-12 / D1_BADGE_VERIFIE=1
  // (le tarif releve sur facture est CERTIFIE par ce badge, et la comparaison
  // designe le gagnant sur ce nombre: un negatif l'emporte a chaque fois).
  unit_price: { min: 0, max: 1_000_000 },
} as const;

export type ColonneNumLigne = keyof typeof COLONNES_NUM_LIGNE;

/** Colonnes texte d'une ligne de document. */
export const COLONNES_TEXTE_LIGNE = ["original_name", "lot_number", "dlc"] as const;
export const COLONNE_TEXTE_LIGNE_MAX = 500;

/** Plafond d'un total de document (une facture de cantine n'atteint pas 1 Md). */
export const TOTAL_MAX = 1_000_000_000;

/**
 * Nombre decimal dans les DEUX ecritures que le produit recoit: `2.5` et
 * `2,5`. Historiquement c'est l'UI qui faisait le replace avant d'envoyer
 * (`parseFloat(x.replace(",", ".")) || 0`), ce qui ecrasoit le vide en 0 et
 * laissait un poste tierce envoyer la virgule brute. Le serveur juge donc
 * desorais les deux formes LUI-MEME, et les unifie au lieu de les deviner.
 *
 * ⚠ On ne DEVINE pas le separateur quand les deux sont presents:
 * `Number("1.234,56")` est NaN et `Number("1,234.56")` vaudrait 1.234 — les
 * deux lectures d'un meme nombre se franciser divergent de trois ordres de
 * grandeur. Un texte qui melange les deux est REFUSE (et nomme), pas rabote.
 */
function nombreDecimal(brut: string): number {
  const net = brut.trim();
  if (net === "") return Number.NaN;
  if (net.includes(",") && net.includes(".")) return Number.NaN;
  return Number(net.replace(/,/g, "."));
}

/**
 * Un nombre de saisie de cuisine: chiffre, ou chaine non vide qui SE LIT comme
 * un nombre (point OU virgule decimale). `Number(true)` vaut 1 et
 * `Number([])` vaut 0: ce ne sont pas des saisies de cuisine, ce sont des
 * accidents de serialisation, et les accepter ferait entrer en base une
 * quantite ou un prix que personne n'a ecrits.
 *
 * ⚠ La chaine BLANCHE (`""`, `"   "`) rend explicitement NaN et non 0: c'est
 * le trou par lequel le `parseFloat(x) || 0` de l'UI transformait un champ
 * vide en montant legitime. Rendre 0 ici serait recréer le defaut dans le
 * module partage — donc dans les DEUX portes a la fois.
 */
export function lireNombreDeLigne(brut: unknown): number {
  if (typeof brut === "number") return brut;
  if (typeof brut === "string") return nombreDecimal(brut);
  return Number.NaN;
}

/**
 * Le texte d'une ligne de document: chaine non vide APRES trim.
 * `undefined`/`null`/`""` -> `defaut`: une ligne sans numero de lot n'est pas
 * une faute, c'est une absence (et le formulaire les initialise a `""`). Un
 * TEXTE non serialisable en chaine (nombre, objet, booleen) est une ordure de
 * payload -> `undefined`, que l'appelant refuse et NOMME. Tronque a `maxLen`:
 * une colonne TEXT sans borne accepterait un coller de 1 Mo.
 */
export function lireTexteDeLigne(
  brut: unknown,
  defaut: string,
  maxLen = COLONNE_TEXTE_LIGNE_MAX,
): string | undefined {
  if (brut === undefined || brut === null) return defaut;
  if (typeof brut !== "string") return undefined;
  const propre = brut.trim();
  if (propre === "") return defaut;
  return propre.length > maxLen ? propre.slice(0, maxLen) : propre;
}

/**
 * Un nombre de ligne exploitable, dans les DEUX formes que le reseau peut
 * presenter. `JSON.stringify(NaN)` et `JSON.stringify(Infinity)` rendent
 * `null`: un calcul rate de l'UI arrive TOUJOURS au serveur comme `null`,
 * jamais comme un reel non fini (mesure au Sprint 8 sur la voie inventaire).
 * Traiter `null` comme « absent -> defaut » laisserait passer une saisie que
 * l'UI n'a pas pu serialiser; le refuser ici laisse l'appelant le NOMMER.
 */
export function nombreDeLigneExploitable(
  brut: unknown,
  bornes: { min: number; max: number },
): number | undefined {
  if (brut === null) return undefined;
  const n = lireNombreDeLigne(brut);
  if (!Number.isFinite(n) || n < bornes.min || n > bornes.max) return undefined;
  return n;
}

/**
 * Un total de document, dans les DEUX ecritures que le produit recoit:
 * `42.50` (la voie de l'UI, qui convertit la virgule avant d'envoyer) et
 * `42,50` (la saisie francaise brute d'une voie qui ne passe pas par le
 * composant React: import, poste tierce). MESURE (sonde, H/H2): la premiere
 * entre en REAL, la seconde survit en `typeof='text'` dans la MEME colonne.
 *
 * ⚠ On ne DEVINE pas le separateur decimal. `Number("1.234,56")` est NaN et
 * `Number("1,234.56")` vaudrait 1.234: les deux lectures d'un nombre se
 * franciser divergent de trois ordres de grandeur, donc un texte qui melange
 * les deux est REFUSE et non rabote. Le blanc et `null` sont refuses;
 * l'ABSENCE de clef est traitee par l'appelant (defaut du schema).
 */
export function totalOuNul(brut: unknown): number | undefined {
  if (typeof brut === "number") {
    return Number.isFinite(brut) && brut >= 0 && brut <= TOTAL_MAX ? brut : undefined;
  }
  if (typeof brut !== "string") return undefined;
  const propre = brut.trim();
  if (propre === "") return undefined;
  if (propre.includes(",") && propre.includes(".")) return undefined;
  const n = Number(propre.replace(/,/g, "."));
  if (!Number.isFinite(n) || n < 0 || n > TOTAL_MAX) return undefined;
  return n;
}

/** Une ligne de document PRETE a etre ecrite, dans la forme du schema. */
export interface LigneDocumentPropre {
  /** `null` = ligne non appariee (proposition libre, voie Documents). */
  inventory_id: string | null;
  /** Le nom TEL QUE SAISI par le chef (ou rendu par l'IA). La voie Documents
   *  ecrit CELUI-LA: c'est la valeur economique d'une ligne non appariee, et le
   *  GET la rend par `COALESCE(i.name, di.original_name)`. */
  original_name: string;
  /** Le nom REEL de l'article en base quand la clef a resolu, `null` sinon.
   *  La voie `POST /api/purchasing/order` ecrit CELUI-LA: un bon de commande
   *  s'IMPRIME et se receptionne a la main, il doit porter le nom de ce que la
   *  reception va compter — et l'UI, elle, envoie un nom TRADUIT dans la
   *  langue du cuisinier. Les deux noms sont legitimes et distincts: c'est la
   *  route qui choisit, jamais le juge. */
  nom_resolu: string | null;
  quantity: number;
  /** `null` = la ligne n'a PAS de prix exploitable. Ce n'est JAMAIS un 0: un 0
   *  fabrique est un ingredient gratuit au devis (defaut I3 de l'import de
   *  mercuriale) et, cote facture, un tarif que le chef croit releve. */
  unit_price: number | null;
  /** La valeur BRUTE recue quand elle n'a pas pu devenir un prix (texte,
   *  negatif, non serialisee). Conservée pour que la ligne reste FIDELE au
   *  papier et que `/validate` puisse la NOMMER: voir le contrat V3. */
  unit_price_brut: string | null;
  /** Vrai quand un prix etait PRESENT mais indefendable (et donc neutralise).
   *  Distingue « le BL n'a pas de tarif » de « le tarif est illisible » — le
   *  chef ne corrige pas la meme chose. */
  prix_rejete: boolean;
  lot_number: string;
  dlc: string;
}

/** Une ligne refusee: INDEXEE, NOMMEE, avec un motif distinct. */
export interface LigneRejetee {
  index: number;
  raison: string;
  nom?: string;
}

export interface LotDeLignes {
  ecrites: LigneDocumentPropre[];
  rejetees: LigneRejetee[];
}

export interface OptionsDeJugement {
  /**
   * Une clef d'article ABSENTE est-elle une faute?
   *   false (defaut, voie Documents): la ligne est une PROPOSITION libre. Le
   *     chef saisiit un PDF a la main et n'a pas encore apparie chaque ligne;
   *     le GET la rend lisible grace a `original_name`. La rejeter rendrait la
   *     voie manuelle du produit inutilisable — une regle trop stricte se
   *     presente comme un 400 impeccable et casse le client (la lecon de
   *     l'ENUM du Sprint 6, qui omettoit `'active'` pose par l'init).
   *   true (voie Purchasking): un bon de commande est une ENTITE qui se
   *     receptionne. Sa boucle de reception saute toute ligne sans
   *     `inventory_id` (`if (!it.inventory_id ...) continue`) et le solde de
   *     cloture la compte comme RESTANTE: un bon sans clef est un bon qui ne
   *     peut JAMAIS passer a RECEIVED. Ce n'est pas une ligne libre, c'est un
   *     bon faux — et il part imprime chez le fournisseur.
   */
  exigerClef?: boolean;
  /** Plancher de quantite (defaut 0, la valeur du schema). La voie du bon de
   *  commande passe 1e-9: une ligne de 0 unite est un bon qui facture rien et
   *  que la reception ne peut pas compter. */
  quantiteMin?: number;
  /** Ce que devient un prix PRESENT mais indefendable:
   *   "neutraliser" (defaut, voie Documents): la ligne SURVIT avec
   *     `unit_price = null` et son brut. C'est le contrat consigne V3
   *     (« la valeur brute reste, ce qui compte est qu'elle ne devienne PAS un
   *     prix de 0 € chez un fournisseur ») et V2 (un montant negatif ne devient
   *     pas un tarif CERTIFIE, mais la validation du stock, elle, reussit).
   *     Jeter la ligne casserait ces deux verdicts: la facture n'aurait plus
   *     AUCUNE ligne et le mouvement de stock — le travail principal de la
   *     route — disparaitrait avec.
   *   "rejeter" (voie Purchasking): le total du bon est la SOMME des lignes et
   *     il s'IMPRIME; une ligne au montant illisible n'y a pas sa place. */
  prixIndefendable?: "neutraliser" | "rejeter";
}

const clefEnChaineLisible = (brut: unknown): string | null => {
  if (brut === undefined || brut === null) return null;
  if (typeof brut === "string") {
    const propre = brut.trim();
    return propre === "" ? null : propre.slice(0, COLONNE_TEXTE_LIGNE_MAX);
  }
  // Une clef n'est ni un nombre, ni un booleen, ni un tableau: on la rend en
  // chaine pour que le MOTIF du refus soit verifiable par un test (et non un
  // `[object Object]` introuvable dans le payload du chef).
  if (typeof brut === "number" || typeof brut === "boolean") return String(brut);
  return `[objet:${JSON.stringify(brut)?.slice(0, 40) ?? "indefini"}]`;
};

/**
 * Le nom que le chef a SOUS LES YEUX quand la ligne est refusee.
 *
 * ⚠ Ce n'est PAS le nom ecrit en base: la voie du bon ecrit `inv.name` (le nom
 * REEL resolu) alors que l'UI envoie un nom TRADUIT. Un compte-rendu qui
 * recopierait la base designerait une ligne que le chef ne relit pas a l'ecran;
 * un qui recopierait le payload designerait un article qu'il n'a pas nomme
 * ainsi. On prend donc le NOM DE SAISIE, et a defaut la clef refusee elle-meme:
 * dans les deux cas c'est une chaine qu'il peut retrouver dans SON fichier.
 */
const nomDeSaisie = (brut: Record<string, unknown>): string => {
  for (const cle of ["original_name", "name", "item", "description"] as const) {
    const v = brut[cle];
    if (typeof v === "string" && v.trim() !== "") return v.trim().slice(0, 80);
  }
  return "(sans nom)";
};

/**
 * Le motif de refus DISTINGUE la forme recue, parce que la correction n'est pas
 * la meme: un champ VIDE se remplit, un TEXTE se remplace par un nombre, un
 * NEGATIF est une erreur de signe (ou un avoir qu'il faut coder en AVOIR, pas
 * en prix), un HORS PLAGE est une unite perdue (des grammes saisis en kilos).
 * Un `null` est un calcul rate de l'UI: le dire evite au chef de chercher une
 * faute de frappe qu'il n'a pas faite.
 */
function motifDeNombre(brut: unknown, champ: "quantite" | "montant"): string {
  if (brut === undefined) return `${champ}_absente`;
  if (brut === null) return `${champ}_non_serialisee`;
  if (typeof brut === "string" && brut.trim() === "") return `${champ}_vide`;
  const n = lireNombreDeLigne(brut);
  if (!Number.isFinite(n)) return `${champ}_non_numerique`;
  return `${champ}_invalide`;
}

const brutPourTrace = (brut: unknown): string | null => {
  if (brut === undefined) return null;
  if (typeof brut === "string") return brut.trim() === "" ? null : brut.trim().slice(0, 80);
  if (typeof brut === "number" || typeof brut === "boolean") return String(brut);
  if (brut === null) return "null";
  return JSON.stringify(brut)?.slice(0, 80) ?? null;
};

/**
 * JUGER LES LIGNES D'UN DOCUMENT AVANT TOUTE ECRITURE, contre la base.
 *
 * La clef d'article est resolue CONTRE `inventory` ici et non apres coup: une
 * ligne orpheline n'est pas une ligne « sans article », c'est une ligne qui ne
 * pourra JAMAIS bouger le stock (l'UPDATE de la validation comme de la reception
 * fait `WHERE id = <clef>` et ne touce 0 ligne SANS AUCUNE ERREUR — le PASS
 * creux le plus tranquille du produit). Une clef qui ne resout pas est refusee
 * ET NOMMEE avec sa clef: un refus muet est une donnee perdue que le client
 * croit enregistree.
 */
export async function jugerLignesDeDocument(
  db: Database,
  bruts: unknown,
  options: OptionsDeJugement = {},
): Promise<LotDeLignes> {
  const ecrites: LigneDocumentPropre[] = [];
  const rejetees: LigneRejetee[] = [];
  if (!Array.isArray(bruts)) return { ecrites, rejetees };

  const exigerClef = options.exigerClef === true;
  const quantiteMin = options.quantiteMin ?? COLONNES_NUM_LIGNE.quantity.min;
  const prixIndefendable = options.prixIndefendable ?? "neutraliser";
  const bornesQuantite = { min: quantiteMin, max: COLONNES_NUM_LIGNE.quantity.max };

  for (const [index, brut] of (bruts as unknown[]).entries()) {
    const l = (brut ?? {}) as Record<string, unknown>;

    // ⚠ Le nom est CAPTURE avant tout test de presence: un
    // `rejetees: [{index, raison}]` sec designe une ligne que le chef ne peut
    // pas retrouver dans son propre fichier (mesure au Sprint 7: un refus qui
    // ne dit pas QUELLE ligne est fautive oblige a tout ressaisir).
    const nom = nomDeSaisie(l);

    // -- 1) La clef d'article, verifiee contre la base -----------------------
    const clefLue = clefEnChaineLisible(l.inventory_id);
    let clef: string | null = null;
    let nomResolu: string | null = null;
    if (clefLue !== null) {
      const trouve = await db.get<{ id: string; name: string }>(
        "SELECT id, name FROM inventory WHERE id = ?",
        [clefLue],
      );
      if (!trouve) {
        rejetees.push({ index, raison: "article_inexistant", nom: clefLue });
        continue;
      }
      clef = trouve.id;
      nomResolu = trouve.name;
    }
    if (clef === null && exigerClef) {
      rejetees.push({ index, raison: "article_non_apparie", nom });
      continue;
    }

    // -- 2) La designation -----------------------------------------------
    const nomTexte = lireTexteDeLigne(l.original_name, "");
    if (nomTexte === undefined) {
      rejetees.push({ index, raison: "nom_non_texte", nom });
      continue;
    }
    // Ni clef ni nom: la ligne ne dit rien de ce qu'elle represente, et le GET
    // (`COALESCE(i.name, di.original_name)`) la rend en NULL. C'est une ligne
    // vide, pas une ligne libre.
    if (clef === null && nomTexte === "") {
      rejetees.push({ index, raison: "ligne_sans_designation" });
      continue;
    }

    // -- 3) La quantite: colonne NOT NULL, donc sans compromis --------------
    const quantite = nombreDeLigneExploitable(l.quantity, bornesQuantite);
    if (quantite === undefined) {
      rejetees.push({
        index,
        raison: motifDeNombre(l.quantity, "quantite"),
        ...(nom !== "(sans nom)" ? { nom } : {}),
      });
      continue;
    }

    // -- 4) Le montant ----------------------------------------------------
    // NULLABLE au schema: une ligne sans prix est une ligne NON PRICEE (le BL
    // sans tarif, la ligne d'avoir), jamais une ligne a 0 €.
    let prix: number | null = null;
    let prixBrut: string | null = null;
    let prixRejete = false;
    if (l.unit_price !== undefined && l.unit_price !== null) {
      const prixLu = nombreDeLigneExploitable(l.unit_price, COLONNES_NUM_LIGNE.unit_price);
      if (prixLu === undefined) {
        if (prixIndefendable === "rejeter") {
          rejetees.push({
            index,
            raison: motifDeNombre(l.unit_price, "montant"),
            ...(nom !== "(sans nom)" ? { nom } : {}),
          });
          continue;
        }
        prixRejete = true;
        prixBrut = brutPourTrace(l.unit_price);
      } else {
        prix = prixLu;
      }
    }

    // -- 5) Les textes ------------------------------------------------------
    const lot = lireTexteDeLigne(l.lot_number, "");
    const dlc = lireTexteDeLigne(l.dlc, "");
    if (lot === undefined || dlc === undefined) {
      rejetees.push({ index, raison: "lot_ou_dlc_non_texte", nom });
      continue;
    }

    ecrites.push({
      inventory_id: clef,
      original_name: nomTexte,
      nom_resolu: nomResolu,
      quantity: quantite,
      unit_price: prix,
      unit_price_brut: prixBrut,
      prix_rejete: prixRejete,
      lot_number: lot,
      dlc,
    });
  }

  return { ecrites, rejetees };
}

/**
 * Le compte-rendu d'une ECRIURE de lignes, construit a partir des temoins du
 * SQL (`changes`) et non du corps de la requete: un 200 dont on ne relit pas
 * les lignes est le PASS creux consigne pour documents.ts (l'ancien
 * `res.json({ id })` recitoit la requete et livrait `id: undefined`, donc un
 * 404 sur le `/validate` SUIVANT d'un document bel et bien cree).
 */
export interface CompteRenduLignes {
  ecrites: number;
  ignorees: number;
  rejetees: LigneRejetee[];
}
