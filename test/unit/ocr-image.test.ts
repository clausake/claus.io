// Chantier B — LE GARDE D'IMAGE NE PEUT PAS DISPARAITRE SILENCIEUSEMENT.
//
// Le defaut mesure (document de verification 1.0.6, 11/11, reproduit sur ce
// poste) : Tesseract.recognize sur un PNG au CRC d'IHDR faux levait un
// « libpng error » depuis le worker EN process.nextTick — hors de portee d'un
// try/catch — et TUAIT le processus Node entier (mesure : rc 77, sortie
// « UNCAUGHT-EXCEPTION: Error: Error attempting to read image. »). Les quatre
// routes d'upload (analyze-menu, documents/upload, documents/:id/extract,
// recipes/scan) pouvaient donc etre descendues par une seule image corrompue.
//
// La parade n'est pas d'attraper (impossible) mais de ne pas donner au moteur
// ce qu'il ne peut pas lire : src/shared/ocr-image.ts verifie les octets, et
// pour PNG la STRUCTURE complete (CRC de chaque chunk). La SIGNATURE SEULE NE
// SUFFIT PAS : mesure du 11/11, un fichier a vraie signature PNG et CRC faux
// passait le controle des signatures et tuait quand meme le processus. Ce
// juge est ecrit pour ne pas laisser reintroduire ce raccourci.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { imageValide, pngStructurellementValide, OCTETS_MAX_IMAGE } from "../../src/shared/ocr-image.js";

const RACINE = process.cwd();

/** Un PNG au CRC d'IHDR volontairement faux : l'entree exacte du document. */
function pngCrcFaux(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    sig,
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    ihdr,
    Buffer.from([0xde, 0xad, 0xbe, 0xef]),
  ]);
}

// --- les verdicts attendus --------------------------------------------------
describe("imageValide (le garde qui empeche le worker de tuer le serveur)", () => {
  it("refuse ce qui n'est pas une image, avec un MOTIF nomme", () => {
    const texte = Buffer.from("ceci n'est pas une image" + "x".repeat(200));
    const v = imageValide(texte);
    expect(v.valide).toBe(false);
    expect(v.valide ? "" : v.motif).toBe("FORMAT_NON_IMAGE");
  });

  it("refuse le vide et le trop court (jamais un booleen muet)", () => {
    expect(imageValide(Buffer.alloc(0)).valide).toBe(false);
    expect(imageValide(null).valide).toBe(false);
    const court = imageValide(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(court.valide).toBe(false);
  });

  it("refuse un PNG au CRC faux — LE cas qui tuait le processus", () => {
    const v = pngStructurellementValide(pngCrcFaux());
    expect(v.valide).toBe(false);
    expect(v.valide ? "" : v.motif).toContain("CRC_FAUX");
  });

  it("la signature seule ne suffit PAS (regle nee de la mesure du 11/11)", () => {
    // Un fichier avec la VRAIE signature PNG doit etre juge par sa structure,
    // pas par ses huit premiers octets : c'est l'erreur qui laissait passer le
    // crash. Ce test rougit si quelqu'un revient a la signature seule.
    const v = imageValide(pngCrcFaux());
    expect(v.valide, "un PNG a signature valide mais CRC faux ne doit PAS etre accepte").toBe(false);
  });

  it("accepte un PNG reel (le garde ne casse pas le produit)", async () => {
    const piece = path.join(RACINE, "test", "banc", "facture-synthetique.png");
    const tampon = fs.readFileSync(piece);
    const v = imageValide(tampon);
    expect(v.valide, `la piece du banc doit etre acceptee (${v.valide ? "" : v.motif})`).toBe(true);
    expect(v.valide ? v.format : "").toBe("png");
  });

  it("accepte les formats reels du produit (jpeg d'un telephone)", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    expect(imageValide(jpeg).valide).toBe(true);
    const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(64, 7)]);
    expect(imageValide(gif).valide).toBe(true);
  });

  it("refuse un fichier plus gros que la taille admise", () => {
    // LA BORNE EST LE CONTRAT : un fichier au-dela d'OCTETS_MAX_IMAGE est
    // refuse AVANT toute lecture, avec son motif. On ne fabrique pas 25 Mo en
    // RAM pour le juger : on fabrique un tampon d'un octet de plus que la
    // borne, rempli d'une signature PNG valide pour que ce soit BIEN la taille
    // qui decide et non le contenu.
    const justeAuDessus = Buffer.alloc(OCTETS_MAX_IMAGE + 1, 0x42);
    justeAuDessus.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const v = imageValide(justeAuDessus);
    expect(v.valide, "un fichier au-dessus de la borne doit etre refuse").toBe(false);
    expect(v.valide ? "" : v.motif, "et le motif doit nommer la taille").toBe("IMAGE_TROP_GROSSE");
  });
});

// --- le garde est bien branche sur les voies du produit ---------------------
describe("le garde est branche, pas juste ecrit", () => {
  const source = (relatif: string): string =>
    fs.readFileSync(path.join(RACINE, relatif), "utf8");

  it("la voie tesseract valide AVANT d'appeler recognize", () => {
    const code = source("src/shared/ocr-moteurs/tesseract.ts");
    expect(code).toContain("imageValide");
    // L'appel au moteur vient APRES le controle (l'ordre est le contrat).
    expect(code.indexOf("imageValide")).toBeLessThan(code.indexOf("Tesseract.recognize"));
  });

  it("le repli vision de llm.ts valide et enveloppe l'appel du worker", () => {
    const code = source("src/shared/llm.ts");
    expect(code).toContain("imageValide");
    expect(code).toContain("ocr-image.js");
    // Un try/catch ne suffit PAS contre le crash, mais il doit rester : il
    // nomme les echecs du worker (langue absente, worker mort).
    expect(code).toMatch(/catch \(e\)[\s\S]{0,200}LlmInjoignable/);
  });
});
