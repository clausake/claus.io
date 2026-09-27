import { describe, it, expect } from "vitest";
import { resoudreLocale, LOCALES } from "../../src/shared/i18n/locales.js";
import { lireNombre, precocherAssistant } from "../../src/shared/i18n/nombre.js";
import { lireDate } from "../../src/shared/i18n/date.js";
import { contientMoteCle } from "../../src/shared/i18n/mots-cles.js";

// Tache 16 : la locale est DECLAREE, jamais inferee. Les valeurs de la
// matrice sont celles mesurees le 25/09 (nombres, dates, scripts OCR).

describe("resoudreLocale (declaree, jamais inferée)", () => {
  it("sans declaration : LOCALE_REQUISE", () => {
    expect(resoudreLocale(null)).toEqual({ ok: false, verdict: "LOCALE_REQUISE" });
    expect(resoudreLocale("  ").ok).toBe(false);
  });
  it("une locale hors matrice est NOMMEE, pas déduite", () => {
    expect(resoudreLocale("ja-JP").verdict).toBe("LOCALE_INCONNUE");
  });
  it("le script non prouvé REFUSE (interdiction du remplacement silencieux)", () => {
    expect(resoudreLocale("th-TH")).toEqual({ ok: false, verdict: "SCRIPT_NON_GARANTI" });
  });
  it("les quatres scripts PROUVÉS (mesure 25/09 avec suivi des 302) sont garantis", () => {
    const scripts = new Set(Object.values(LOCALES).map((l) => l.script_ocr));
    for (const s of ["latin", "cyrillic", "arabic", "devanagari"] as const) {
      expect(scripts.has(s)).toBe(true);
    }
    for (const l of Object.values(LOCALES)) {
      if (l.script_ocr === "inconnu") expect(l.script_prouve).toBe(false);
      else expect(l.script_prouve).toBe(true);
    }
  });
});

describe("les nombres (le separateur est le multiplicateur du prix)", () => {
  it("la locale declaree tranche seule", () => {
    expect(lireNombre("419,60", "fr-FR")).toMatchObject({ verdict: "VALEUR", valeur: 419.6 });
    expect(lireNombre("1.234,56", "de-DE")).toMatchObject({ verdict: "VALEUR", valeur: 1234.56 });
    expect(lireNombre("1,234.56", "en-US")).toMatchObject({ verdict: "VALEUR", valeur: 1234.56 });
    expect(lireNombre("419 60", "fr-FR").verdict).toBe("FORME_REFUSEE"); // pas de bloc de 3
  });
  it("le melange des ecritures est REFUSE, pas rabote", () => {
    expect(lireNombre("1,234.56", "fr-FR").verdict).toBe("FORME_REFUSEE");
    expect(lireNombre("419.60", "fr-FR").verdict).toBe("FORME_REFUSEE"); // le point n'a pas de role en fr
  });
  it("sans locale : aucune valeur ne sort jamais (LOCALE_REQUISE)", () => {
    const r = lireNombre("42", null);
    expect(r.verdict).toBe("LOCALE_REQUISE");
    expect(r.valeur).toBeNull();
  });
  it("le cas 1.234 : licite 1234 (de) ET 1.234 (us) → AMBIGU + les deux lectures", () => {
    const r = lireNombre("1.234", null);
    expect(r.verdict).toBe("SEPARATEUR_AMBIGU");
    expect(r.valeur).toBeNull();
    expect(r.lectures).toEqual(expect.arrayContaining([1234, 1.234]));
  });
  it("l'assistant pré-coche mais ne décide jamais", () => {
    expect(precocherAssistant("1 234,56").propose).toBe("fr");
    expect(precocherAssistant("1,234.56").propose).toBe("us");
    expect(precocherAssistant("1.234").propose).toBe("aucun"); // le cas ambigu
  });
});

describe("les dates (39 % structurellement ambiguës, mesure 25/09)", () => {
  it("l'ordre DECLARE tranche seul quand l'autre lecture est invalide", () => {
    // 25/12 n'existe qu'en jmma ; 25/12 lu en amjd = mois 25, invalide.
    expect(lireDate("25/12/2026", "fr-FR")).toMatchObject({ verdict: "VALEUR", iso: "2026-12-25" });
    expect(lireDate("12/25/2026", "en-US")).toMatchObject({ verdict: "VALEUR", iso: "2026-12-25" });
  });
  it("05/09 licite deux fois rend DATE_AMBIGUE + les deux lectures", () => {
    const r = lireDate("05/09/2026", "fr-FR");
    // 5/9 ET 9/5 sont licites : la locale pre-coche la sienne, la ligne
    // attend le chef — JAMAIS une valeur qui sort sans ce nom (clause c).
    expect(r.verdict).toBe("DATE_AMBIGUE");
    expect(r.iso).toBeNull();
    expect(r.lectures).toEqual(["2026-09-05", "2026-05-09"]);
  });
  it("la forme non ambigue (mois > 12 dans un sens) passe sans alerte", () => {
    const r = lireDate("25/12/2026", "fr-FR");
    expect(r.verdict).toBe("VALEUR");
  });
  it("dates inexistantes refusees ; sans locale declaree rien ne sort", () => {
    expect(lireDate("31/02/2026", "fr-FR").verdict).toBe("DATE_INVALIDE");
    expect(lireDate("05/09/2026", null).verdict).toBe("LOCALE_REQUISE");
  });
});

describe("les mots-cles par langue declaree", () => {
  it("TVA/IVA/BTW/MWSt : chacun dans SA langue, pas dans les autres", () => {
    expect(contientMoteCle("TVA 10,0 %", "fr-FR", "tva")).toBe(true);
    expect(contientMoteCle("IVA 22%", "it-IT", "tva")).toBe(true);
    expect(contientMoteCle("BTW 21%", "nl-NL", "tva")).toBe(true);
    expect(contientMoteCle("MwSt. 19%", "de-DE", "tva")).toBe(true);
    // en français, « BTW » n'est pas un mot-cle TVA : refuse, pas devine.
    expect(contientMoteCle("BTW 21%", "fr-FR", "tva")).toBe(false);
  });
  it("sans locale declaree : aucun mot-cle ne joue", () => {
    expect(contientMoteCle("TOTAL TTC 461,56", null, "total_ttc")).toBe(false);
    expect(contientMoteCle("TOTAL 461,56", "th-TH", "total_ttc")).toBe(false);
  });
});
