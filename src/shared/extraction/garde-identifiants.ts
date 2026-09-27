// La garde des IDENTIFIANTS (Sprint 15, Tache 15).
//
// Le SIRET porte la clef de l'INSEE : les 3 derniers chiffres sont le reste
// de la division des 11 premiers par 97. Le numéro de TVA intracommunautaire
// français se déduit du SIREN : clef = (12 + 3 × (SIREN % 97)) % 97.
// Mesure du 25/09 : le banc portoit un SIRET INVALIDE (« 00027 », la clef
// vraie est « 066 ») — une piece à identifiant fautif ne peut pas juger la
// voie « accepte ». Le banc a été corrigé ; cette garde est jouée par la
// porte scripts/negative-test-extraction.py.
//
// Un identifiant fautif n'est JAMAIS « corrigé » : il rend null + le motif,
// comme CHAMP_SANS_PREUVE. Ce n'est pas au cerveau de deviner un SIRET.

export type VerdictIdentifiant =
  | "VALIDE"
  | "FORME_INVALIDE"   // ni 14 chiffres ni 13 : la piece n'est pas lisible
  | "CLEF_SIRET_FAUSSE"
  | "CLEF_TVA_FAUSSE";

export interface ResultatIdentifiant {
  readonly genre: "siret" | "tva";
  readonly brut: string;
  readonly verdict: VerdictIdentifiant;
  /** La valeur normalisée (chiffres seuls / FR.. ) quand VALIDE, sinon null. */
  readonly normalise: string | null;
}

/** Les chiffres seuls, en refusant tout autre signe qu'espace et point. */
function chiffresOuRefus(brut: string): string | null {
  const propre = brut.trim();
  if (propre === "") return null;
  if (!/^[0-9 .]+$/.test(propre)) return null;
  const chiffres = propre.replace(/[ .]/g, "");
  return /^[0-9]+$/.test(chiffres) ? chiffres : null;
}

const pad3 = (n: number): string => String(n).padStart(3, "0");

/** Garde SIRET : 14 chiffres, les 3 derniers == (11 premiers) % 97. */
export function jugerSiret(brut: string): ResultatIdentifiant {
  const base = { genre: "siret" as const, brut };
  const chiffres = chiffresOuRefus(brut);
  if (chiffres === null || chiffres.length !== 14) {
    return { ...base, verdict: "FORME_INVALIDE", normalise: null };
  }
  const onzieme = Number(chiffres.slice(0, 11));
  const clefLue = chiffres.slice(11);
  if (!Number.isFinite(onzieme)) {
    return { ...base, verdict: "FORME_INVALIDE", normalise: null };
  }
  if (clefLue !== pad3(onzieme % 97)) {
    return { ...base, verdict: "CLEF_SIRET_FAUSSE", normalise: null };
  }
  return { ...base, verdict: "VALIDE", normalise: chiffres };
}

/** La clef de TVA française attendue pour un SIREN (les 9 premiers chiffres). */
export function clefTvaAttendue(siren: number): number {
  return (12 + 3 * (siren % 97)) % 97;
}

/** Garde TVA française : « FR78 412857339 » ou « FR78412857339 » ; si un
 *  SIRET est fourni, la clef doit aussi concordance avec SON SIREN. */
export function jugerTvaFr(brut: string, siret?: string): ResultatIdentifiant {
  const base = { genre: "tva" as const, brut };
  const propre = brut.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^FR(\d{2})(\d{9})$/.exec(propre);
  if (!m) return { ...base, verdict: "FORME_INVALIDE", normalise: null };
  const clefLue = Number(m[1]);
  const siren = Number(m[2]);
  if (clefTvaAttendue(siren) !== clefLue) {
    return { ...base, verdict: "CLEF_TVA_FAUSSE", normalise: null };
  }
  if (siret !== undefined) {
    const chiffres = chiffresOuRefus(siret);
    if (chiffres === null || chiffres.length !== 14 || chiffres.slice(0, 9) !== m[2]) {
      return { ...base, verdict: "CLEF_TVA_FAUSSE", normalise: null };
    }
  }
  return { ...base, verdict: "VALIDE", normalise: `FR${m[1]}${m[2]}` };
}
