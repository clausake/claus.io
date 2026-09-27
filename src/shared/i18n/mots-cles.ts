// Les mots-cles de piece par langue (Sprint 15, Tache 16).
//
// Les libelles de piece sont propres a chaque langue : une garde qui ne
// connait qu'un libelle refuse en bloc ce qu'elle lit mal. Mesure 25/09
// (fr/de/es/it/nl) reprise ici pour la voie IMPORTATION ; la garde DLC
// (src/shared/extraction/garde-dlc.ts) garde SES listes pour la voie
// peremption — les deux jouent des roles differents (chercher un champ vs
// juger une date) et ne doivent pas se dissoudre l'une dans l'autre.
//
// La encore : la langue est DECLAREE (choix du chef par fournisseur/piece),
// jamais inferee du contenu. Sans locale declaree, un mot-cle rendu par la
// table d'a cote est un hasard — la porte le nomme, pas la chance.

import { resoudreLocale } from "./locales.js";

export interface MotsClesPiece {
  readonly total_ht: readonly string[];
  readonly tva: readonly string[];
  readonly total_ttc: readonly string[];
  readonly numero_facture: readonly string[];
  readonly date_emission: readonly string[];
  readonly siret: readonly string[];
}

const NORMALISES = (a: readonly string[]): readonly string[] =>
  a.map((s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim());

const TABLE: Readonly<Record<string, MotsClesPiece>> = {
  fr: {
    total_ht: ["total ht", "total hors taxe"],
    tva: ["tva"],
    total_ttc: ["total ttc", "net a payer"],
    numero_facture: ["facture n", "facture numero", "n° facture"],
    date_emission: ["date d'emission", "date"],
    siret: ["siret"],
  },
  de: {
    total_ht: ["netto", "zwischensumme", "nettopreis"],
    tva: ["umsatzsteuer", "mwst"],
    total_ttc: ["brutto", "gesamtbetrag", "zahlung"],
    numero_facture: ["rechnungsnummer", "rechnung nr"],
    date_emission: ["rechnungsdatum", "datum"],
    siret: ["siret"], // piece francaise lue par un germanophone : SIRET demeure
  },
  es: {
    total_ht: ["base imponible", "subtotal"],
    tva: ["iva"],
    total_ttc: ["total", "total a pagar"],
    numero_facture: ["factura n", "numero de factura"],
    date_emission: ["fecha de emision", "fecha"],
    siret: ["siret", "nif"],
  },
  it: {
    total_ht: ["imponibile", "totale imponibile"],
    tva: ["iva"],
    total_ttc: ["totale", "totale documento"],
    numero_facture: ["numero fattura", "fattura n"],
    date_emission: ["data fattura", "data emissione"],
    siret: ["siret", "piva"],
  },
  nl: {
    total_ht: ["subtotalen", "totaal excl", "excl btw"],
    tva: ["btw"],
    total_ttc: ["totaal", "te betalen"],
    numero_facture: ["factuurnummer", "factuur nr"],
    date_emission: ["factuurdatum", "datum"],
    siret: ["siret", "kvk"],
  },
};

/** Les mots-cles de la langue DECLAREE ; null si la locale n'est pas declaree
 *  ou inconnue — l'appelant doit refuser la piece, pas chercher au hasard. */
export function motsClesPour(codeLocale: string | null | undefined): MotsClesPiece | null {
  const r = resoudreLocale(codeLocale);
  if (!r.ok) return null;
  const langue = r.locale.code.slice(0, 2);
  const t = TABLE[langue as keyof typeof TABLE];
  return t ? t : null;
}

/** Le mot-cle de la ligne d'une piece est-il dans la table DECLAREE ?
 *  (normalise : accents et casse ne comptent pas — la voie OCR est crue). */
export function contientMoteCle(ligne: string, codeLocale: string | null | undefined,
                                champ: keyof MotsClesPiece): boolean {
  const mots = motsClesPour(codeLocale);
  if (!mots) return false;
  const l = ligne.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  return NORMALISES(mots[champ]).some((k) => l.includes(k));
}
