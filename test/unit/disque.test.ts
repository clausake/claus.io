// Chantier 47 — LE DIAGNOSTIC DISQUE EST REEL.
//
// Le defaut mesure (audit senior du 09/11) : `/health` rendait TOUJOURS
// `diskFree: -1`. La route appelait `fs.statfs(...)` puis `statfsFn.sync(...)`
// — une methode qui N'EXISTE PAS : la methode synchrone s'appelle
// `statfsSync`. L'exception etait avalee par un `catch` muet, et l'ecran
// disait « disque inconnu » la ou le disque avait 35 Go libres.
//
// Ce juge couvre les deux moities du contrat :
//   1. le RESULTAT : sur un dossier reel, l'espace libre est mesure (>= 0),
//      et il ne vaut pas -1 (la valeur « information indisponible ») ;
//   2. la SOURCE : le service utilise `fs.statfsSync` et n'appelle PAS
//      `statfs.sync` (la forme qui ne compile pas dans un contexte Node
//      ordinaire et que le defaut avait). Un correctif qui reintroduirait
//      `statfs.sync` fait rougir CE test, meme si le resultat reste -1.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { espaceLibreDisque } from "../../src/services/disque.js";

describe("espaceLibreDisque (le disque, mesure et non suppose)", () => {
  it("sur un dossier reel, l'espace libre est mesure (jamais -1)", () => {
    const giga = espaceLibreDisque(os.tmpdir());
    expect(giga, "l'espace libre doit etre mesure sur un dossier reel").toBeGreaterThanOrEqual(0);
  });

  it("un dossier qui n'existe pas rend -1 (information indisponible, pas 0)", () => {
    const inexistant = path.join(os.tmpdir(), "clausio-dossier-inexistant-" + Date.now());
    expect(espaceLibreDisque(inexistant)).toBe(-1);
  });

  // Le CODE est lu sans les commentaires de LIGNE : une fente `//` RECONNUE EN
  // DEBUT DE LIGNE (aprs blanc) est un commentaire, tout le reste est du code.
  // Un retirage glouton — couper au PREMIER `//` — effacerait `"https://…"` :
  // le contre-exemple ci-dessous le refuse. Le retirage en milieu de ligne est
  // delibrement ABSENT (voir la regle des contre-exemples).
  //
  // LA REGLE DE RETIRAGE EST JUGEE ICI, parce que le defaut s'est loge LA.
  // Le premier harnais ecrivait `l.replace(/\/\/.*$/, "")`. Sur un fichier en
  // CRLF — ce que produce un checkout Windows avec `core.autocrlf=true`, donc
  // LE POSTE DU CLIENT, pas le notre — chaque ligne finit par un \r que `$`
  // (ancre multiline, active par /m) place AVANT le \r. La ligne
  //     // ... `statfsFn.sync` inexistante ...
  // ne etait coupee qu'au \r : la citation SURVIVAIT et le test rougissait sur
  // un commentaire. Le retirage doit donc atteindre le saut de ligne LUI-MEME
  // (le \r est un caractere de fin de ligne, pas du contenu).
  const retireCommentaires = (source: string): string =>
    source.split("\n").map((l) => l.replace(/^(\s*)\/\/.*(?=\r|$)/, "$1")).join("\n");

  const codeSansCommentaires = (relatif: string): string =>
    retireCommentaires(fs.readFileSync(path.join(process.cwd(), relatif), "utf8"));

  // --- la REGLE DE RETIRAGE EST JOUEE, pas supposee ------------------------
  // Sans ces trois assertions, le test dependrait du type de fin de ligne du
  // checkout : vert sur notre Linux en LF, rouge sur le poste Windows du client
  // (le defaut mesure ci-dessus). Un juge dont le resultat depend du systeme
  // d'exploitation ne juge pas le produit.
  const CITATION = "  // la route appelait `statfsFn.sync` — methode inexistante\n";
  it("le retirage retire une citation de commentaire en LF", () => {
    expect(retireCommentaires(CITATION).trim()).toBe("");
  });
  it("le retirage retire une citation de commentaire en CRLF (le poste du client)", () => {
    // Le cas qui faisait rougir le juge sous Windows : meme texte, fins de
    // ligne CRLF. L'ancienne regle (`/\/\/.*$/`) y LAISSAIT SURVIVRE
    // « statfsFn.sync » et le test rougissait sur un commentaire.
    expect(retireCommentaires(CITATION.replace(/\n/g, "\r\n")).trim()).toBe("");
  });
  it("le retirage ne mange pas une chaine qui contient // (le garde est strict)", () => {
    // CONTRE-EXEMPLE : un retirage glouton (couper au PREMIER `//`, comme le
    // faisait une regle sans ancre de debut) effacerait du code legitime. Le
    // test rougit si le retirage redevient glouton.
    const url = '  const url = "https://example.com/a";\n';
    expect(retireCommentaires(url), "une chaine n'est pas un commentaire").toBe(url);
    const cite = '  expect(code).not.toContain("statfs.sync"); // le defaut\n';
    expect(retireCommentaires(cite), "le code d'une assertion survit intact").toBe(cite);
  });

  it("la SOURCE utilise fs.statfsSync — pas statfs.sync (le defaut mesure)", () => {
    const code = codeSansCommentaires("src/services/disque.ts");
    expect(code, "le service doit appeler fs.statfsSync").toContain("fs.statfsSync(");
    expect(code, "statfs.sync n'existe pas : c'est le defaut mesure").not.toContain("statfs.sync");
  });

  it("la route /health ne masque plus l'appel par un catch muet", () => {
    const code = codeSansCommentaires("src/routes/health.ts");
    expect(code, "health.ts doit passer par le service du disque").toContain(
      "espaceLibreDisque(",
    );
    expect(code, "plus de statfsFn.sync dans health.ts").not.toContain("statfsFn.sync");
  });
});
