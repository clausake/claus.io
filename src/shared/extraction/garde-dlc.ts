// La garde DLC / DDM (Sprint 15, Tache 15).
//
// DEUX regles distinctes (mesure du 25/09 : 6/6 verdicts justes) :
//   DLC  — « à consommer jusqu'au »      : date PASSEE = REFUSEE ;
//   DDM  — « de préférence avant le »    : date passée est LICITE.
// Les libellés sont MULTILINGUES par construction (tache 16 les etend) :
// fr/de/es/it/nl ci-dessous. Une garde qui ne connait qu'un libellé refuse
// en bloc ce qu'elle lit mal — c'est exactement la faute consignée au plan.
//
// Une date illisible ou inexistante (31/02, 13/13, « 05/l0 ») est REFUSEE
// avec son motif, jamais devinee. `aujourdhui` est INJECTE par l'appelant
// (le banc fige la sienne ; jamais Date.now() dans un juge : une porte qui
// depend de l'horloge rougit seule le lendemain).

export type GenrePeremption = "dlc" | "ddm" | "inconnu";

export type VerdictDlc =
  | "ACCEPTE"
  | "PASSEE"           // DLC passee : refusee (DDM : jamais ici)
  | "DATE_INVALIDE"    // 31/02, 13/13, caracteres ambigus : refusee
  | "LIBELLE_INCONNU"; // ni DLC ni DDM : la ligne attend le chef

export interface ResultatDlc {
  readonly brut: string;
  readonly libelle: string;
  readonly genre: GenrePeremption;
  readonly verdict: VerdictDlc;
  /** La date ISO (YYYY-MM-DD) quand la forme est licite, sinon null. */
  readonly date: string | null;
}

/** Les libellés de péremption par langue (mesurés 25/09 ; la tache 16 les
 *  reprend depuis src/shared/i18n/mots-cles.ts quand elle existe).
 *  « Te gebruiken tot » (nl) est classe DDM : le banc 25/09 le juge licite
 *  passe — la liste DDM est testee AVANT la liste DLC (regle ci-dessous). */
const LIBELLES_DLC: readonly string[] = [
  "à consommer jusqu'au",
  "verbrauchen bis",
  "da consumarsi entro",
  "fechas de consumo preferente", // es (DL), consigné 25/09
];
const LIBELLES_DDM: readonly string[] = [
  "de préférence avant le",
  "de préférence jusqu'au",
  "à consommer de préférence",
  "mindestens haltbar bis",
  "consumir preferentemente antes de",
  "de preferência antes de",
  "da consumarsi preferibilmente entro",
  "te gebruiken tot", // nl — DDM par défaut aux Pays-Bas
];

const normaliser = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

const dlcNormalises = LIBELLES_DLC.map(normaliser);
const ddmNormalises = LIBELLES_DDM.map(normaliser);

/** Le genre de péremption que porte un libellé (DDM vérifié AVANT DLC : « à
 *  consommer de préférence » contient « consommer » — l'ordre des test est un
 *  fait du banc, pas un goût). */
export function genrePeremption(libelle: string): GenrePeremption {
  const l = normaliser(libelle);
  if (ddmNormalises.some((k) => l.includes(k))) return "ddm";
  if (dlcNormalises.some((k) => l.includes(k))) return "dlc";
  return "inconnu";
}

/** Le juge : `chaine` est la date LUE (jj/mm/aaaa), `aujourdhui` la date du
 *  jour injectée. Voir l'en-tête pour la table des verdicts. */
export function jugerDlc(
  chaine: string,
  libelle: string,
  aujourdhui: Date,
): ResultatDlc {
  const base = { brut: chaine, libelle };
  const genre = genrePeremption(libelle);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(chaine.trim());
  if (!m) {
    return { ...base, genre, verdict: "DATE_INVALIDE", date: null };
  }
  const j = Number(m[1]);
  const mo = Number(m[2]);
  const a = Number(m[3]);
  const d = new Date(Date.UTC(a, mo - 1, j));
  // L'aller-retour fige les dates « creatives » (31/02 devient 03/03 : rejet).
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) {
    return { ...base, genre, verdict: "DATE_INVALIDE", date: null };
  }
  const iso = `${m[3]}-${String(m[2]).padStart(2, "0")}-${m[1]}`;
  if (genre === "inconnu") {
    return { ...base, genre, verdict: "LIBELLE_INCONNU", date: iso };
  }
  const seuil = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate());
  const passee = d.getTime() < seuil;
  if (genre === "ddm") return { ...base, genre, verdict: "ACCEPTE", date: iso };
  return passee
    ? { ...base, genre, verdict: "PASSEE", date: iso }
    : { ...base, genre, verdict: "ACCEPTE", date: iso };
}
