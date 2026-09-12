// Source UNIQUE des regles de forme des colonnes d'inventaire.
//
// POURQUOI CE MODULE EXISTE. La regle de prix des fournisseurs a ete recopiee
// dans trois fichiers et s'est perimee en silence (lecon des `BUDGETS` de
// `audit-perf.mjs`, appliquee ici avant qu'elle ne se reproduise): les memes
// bornes de `quantity`/`minStock`/`unit_price`/`yield_percent`, le meme jeu de
// `STATUTS` et les memes colonnes texte sont lus par DEUX routes d'ecriture de
// ce fichier (`POST` pour creer, `PUT` pour modifier). Deux copies d'une borne
// = une peretration garantie le jour ou l'une est durcie et l'autre oubliee.
//
// ⚠ CE QUI EST PARTAGE ICI est ce qui est REELLEMENT identique: les noms, les
// bornes, le jeu ferme de statuts, et la regle de depart du statut. Les BOUCLES
// de validation restent dans chaque route parce que leurs SEMANTIQUES sont
// differentes et ne doivent pas etre confondues:
//   - le PUT est une mise a jour PARTIELLE a trois etats (ABSENT = on n'y
//     touche pas / NET = on ecrit / REJETE = 400) : une colonne absente ne doit
//     rien ecrire du tout.
//   - le POST est une CREATION: une colonne absente y recoit le defaut du schema
//     (ou un defaut explique), jamais un `undefined` envoye au binding.
// Fusionner les deux en un seul « validateur » ferait du POST un PUT (des
// defauts ignores) ou du PUT un POST (des colonnes ecrees a leur defaut quand le
// client ne les envoie pas): la moitie des tests du Sprint 6 est la pour cela.
//
// ⚠ SUR LA REGLE « node-sqlite3 JETTE sur undefined », consignee au Sprint 6.
// Elle est VRAIE pour une colonne `NOT NULL` et FAUSSE pour une colonne
// NULLABLE, et la sonde brute `scripts/probe-binding-undefined.mjs` le tranche:
//   insert_undefined_nullable   -> ok:true, changes:1, et la ligne ressort NULL
//   insert_undefined_notnull    -> "NOT NULL constraint failed"
//   update_undefined_nullable   -> ok:true, et la colonne devient NULL
// C'est exactement ce qui rend le `PUT` dangereux s'il laissait passer un
// `undefined` sur `unit_price` (NULL en base, prix perdu) sans qu'aucune erreur
// ne sorte, et ce qui rend le `POST` rouge sur `quantity` (colonne NOT NULL).
// Un `undefined` n'a donc PAS un comportement unique: on ne le laisse entrer nulle
// part, et on ne se fie pas a « une erreur le dira » pour s'en garantir.

export const COLONNES_NUM = {
  quantity: { min: 0, max: 1_000_000 },
  minStock: { min: 0, max: 1_000_000 },
  unit_price: { min: 0, max: 1_000_000 },
  yield_percent: { min: 0, max: 100 },
} as const;

export type ColonneNum = keyof typeof COLONNES_NUM;

export const COLONNES_TEXTE = ["name", "unit", "category", "lot_number", "dlc"] as const;
export const COLONNE_TEXTE_MAX = 500;

// ⚠ Le jeu inclut 'active' parce que l'INIT de l'app (src/db/init.ts,
// ensureColumn `status TEXT DEFAULT 'active'`) y depose cette valeur: une regle
// qui l'omettrait rejetterait des lignes que le produit a lui-même creees.
export const STATUTS = ["ok", "low", "critical", "active"] as const;

// Le seuil du badge, sous la MEME forme que l'UI (InventoryAudit.tsx
// handleAddSubmit/handleEditSubmit: `q <= min` -> critical, `q <= min*1.5` ->
// low, sinon ok). Un seul endroit pour que le serveur ne puisse pas contredire
// l'ecran, et pour que l'auditeur ne rende pas une etiquette que personne ne
// definit.
export function statutDeparse(quantity: number, minStock: number): string {
  if (quantity <= minStock) return "critical";
  if (quantity <= minStock * 1.5) return "low";
  return "ok";
}

// Un nombre de saisie de cuisine: chiffre, ou chaine non vide qui SE LIT comme
// un nombre. `Number(true)` vaut 1 et `Number([])` vaut 0: ce ne sont pas des
// saisies de cuisine, ce sont des accidents de serialisation, et les accepter
// ferait entrer en base un prix ou une quantite que personne n'a ecrits.
// Rend NaN quand il faut refuser (l'appelant nomme le champ dans son 400).
export function lireNombre(brut: unknown): number {
  if (typeof brut === "number") return brut;
  if (typeof brut === "string" && brut.trim() !== "") return Number(brut);
  return Number.NaN;
}

export function estNombreExploitable(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min && v <= max;
}

// A la CREATION, un champ peut etre ABSENT (il recoit le defaut du schema) ou
// PRESENT (il doit etre un nombre exploitable). Le premier jeton de la sonde
// (`JSON.stringify(Infinity)` et `JSON.stringify(NaN)` rendent `"null"`) a fait
// decouvrir que le serveur ne recoit JAMAIS un reel Infinity ni un reel NaN: il
// recoit `null`. Traiter `null` comme « absent » reviendroit a laisser passer,
// avec un defaut compatissant, une saisie que l'UI n'a pas pu serialiser — et la
// distinction n'existerait plus dans le code. Donc :
//   absent (clef absente) -> le defaut, accepte ;
//   `null` explicite       -> REFUSE (undefined), car c'est une ordure serialisee
//                             et non une omission du client.
export function nombreALaCreation(
  present: boolean,
  brut: unknown,
  defaut: number,
): number | undefined {
  if (!present) return defaut;
  if (brut === null) return undefined;
  return lireNombre(brut);
}

export function texteALaCreation(
  present: boolean,
  brut: unknown,
  defaut: string,
  maxLen = COLONNE_TEXTE_MAX,
): string | undefined {
  if (!present) return defaut;
  if (brut === null) return undefined;
  return lireTexte(brut, maxLen);
}

// Un texte de saisie: chaine non vide APRres trim. Un nom d'article blanc rend
// deux lignes indiscernables et introuvables (et le champ `name` est NOT NULL:
// l'avant-contrat acceptoit `'  '` et meme `42`).
export function lireTexte(brut: unknown, maxLen = COLONNE_TEXTE_MAX): string | undefined {
  if (typeof brut !== "string") return undefined;
  const propre = brut.trim();
  if (propre === "") return undefined;
  return propre.length > maxLen ? propre.slice(0, maxLen) : propre;
}
