// Le store extraction-suivi devait prouver la reparation C38-B (le fetch
// porte par le MODULE, pas par le composant) :
//  1. la reponse atterrit dans l'instantane MEME si l'appelant « demonte » ;
//  2. pendant l'extraction, enCours/documentId sont visibles (banniere);
//  3. un second lancer() est refuse tant qu'une extraction est en cours ;
//  4. une reponse non-ok devient une erreur NOMmee dans l'instantane ;
//  5. la livraison est accusee : accuserDelivre efface la reponse,
//     idempotent (le second appel n'ecrase pas un document different).
import { describe, expect, it, beforeEach } from "vitest";
import {
  lancer,
  instantane,
  accuserDelivre,
  marquerErreurLue,
  poserEtat,
} from "../../src/shared/extraction-suivi.js";

const OK = (corps: Record<string, unknown> = { data: {} }) => ({
  ok: true,
  json: () => Promise.resolve(corps),
});
const KO = (corps: Record<string, unknown> = {}) => ({
  ok: false,
  json: () => Promise.resolve(corps),
});

beforeEach(() => {
  poserEtat({
    enCours: false,
    documentId: null,
    documentNom: null,
    genre: "documents",
    reponse: null,
    delivre: false,
    erreur: null,
    erreurLue: false,
  });
});

describe("extraction-suivi", () => {
  it("(1) la reponse survit a un « demontage » : elle est dans l'instantane", async () => {
    let release: (v: unknown) => void = () => {};
    const porte = new Promise((r) => (release = r));
    let lance = false;
    const p = lancer("doc1", "FACTURE Auguste", {
      transport: (id) => {
        lance = true;
        expect(id).toBe("doc1");
        return porte.then(() => OK({ data: { items: [] } }));
      },
    });

    // L'appelant est « demonte » avant la reponse : rien d'autre a faire —
    // le fetch est porte par le store, la reponse DOIT atterrir.
    release(null);
    await p;
    const etat = instantane();
    expect(lance).toBe(true);
    expect(etat.enCours).toBe(false);
    expect(etat.documentId).toBe("doc1");
    expect(etat.documentNom).toBe("FACTURE Auguste");
    expect(etat.reponse?.documentId).toBe("doc1");
    expect(etat.reponse?.corps).toEqual({ data: { items: [] } });
    expect(etat.erreur).toBeNull();
  });

  it("(2) pendant l'extraction, enCours + nom sont affichables", async () => {
    let release: (v: unknown) => void = () => {};
    const porte = new Promise((r) => (release = r));
    const p = lancer("doc2", "BL Cheval", {
      transport: () => porte.then(() => OK()),
    });
    expect(instantane().enCours).toBe(true);
    expect(instantane().documentNom).toBe("BL Cheval");
    release(null);
    await p;
    expect(instantane().enCours).toBe(false);
  });

  it("(3) un second lancer() est refuse tant qu'une extraction est en cours", async () => {
    let release: (v: unknown) => void = () => {};
    const porte = new Promise((r) => (release = r));
    const p1 = lancer("docA", "A", { transport: () => porte.then(OK) });
    const refus = await lancer("docB", "B", { transport: () => OK() });
    expect(refus).toEqual({ lance: false, erreur: "EXTRACTION_EN_COURS" });
    release(null);
    await p1;
    expect(instantane().enCours).toBe(false);
  });

  it("(4) une reponse non-ok devient une erreur NOMmee", async () => {
    await lancer("docX", "X", {
      transport: () => Promise.resolve(KO({ message: "Draft deja extrait" })),
    });
    expect(instantane().enCours).toBe(false);
    expect(instantane().erreur).toBe("Draft deja extrait");
    expect(instantane().reponse).toBeNull();
  });

  it("(5) accuserDelivre efface la reponse puis reste idempotent", async () => {
    await lancer("docY", "Y", { transport: () => Promise.resolve(OK()) });
    expect(instantane().reponse?.documentId).toBe("docY");
    accuserDelivre("docY");
    expect(instantane().reponse).toBeNull();
    expect(instantane().delivre).toBe(true);
    // idempotent + n'ecrase pas la livraison d'un AUTRE document
    accuserDelivre("docY");
    expect(instantane().delivre).toBe(true);
  });

  it("(6) l'erreur lue est accusee une seule fois (marquerErreurLue)", async () => {
    await lancer("docZ", "Z", {
      transport: () => Promise.resolve(KO({ message: "Documento absente" })),
    });
    expect(instantane().erreur).toBe("Documento absente");
    expect(instantane().erreurLue).toBe(false);
    marquerErreurLue();
    expect(instantane().erreurLue).toBe(true);
    // l'erreur se rapelle toujours (banniere), mais le toast ne rejoue pas :
    marquerErreurLue();
    expect(instantane().erreurLue).toBe(true);
    expect(instantane().erreur).toBe("Documento absente");
  });

  // C39-A : le scan HACCP partage le store — chaque chaine ne livre que son
  // genre. Deux mesures : le genre par defaut, et le genre transmis.
  it("(7) sans opts.genre, la chaine est « documents » (defaut C38-B)", async () => {
    await lancer("docD", "D", { transport: () => Promise.resolve(OK()) });
    expect(instantane().genre).toBe("documents");
  });

  it("(8) genre « haccp » porte le scan d'etiquette jusqu'a la livraison", async () => {
    await lancer("haccp-scan", "Étiquette produit (scan HACCP)", {
      genre: "haccp",
      transport: () =>
        Promise.resolve(OK({ product: "Filet de canard", lot: "L1", dlc: "12/12" })),
    });
    const etat = instantane();
    expect(etat.genre).toBe("haccp");
    expect(etat.reponse?.corps).toEqual({
      product: "Filet de canard",
      lot: "L1",
      dlc: "12/12",
    });
    accuserDelivre("haccp-scan");
    expect(instantane().reponse).toBeNull();
    expect(instantane().delivre).toBe(true);
  });
});
