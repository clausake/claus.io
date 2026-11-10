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

  // Le CODE est lu sans les commentaires : un commentaire qui CITE le
  // defaut (pour l'expliquer) ne doit pas faire rougir le test.
  const codeSansCommentaires = (relatif: string): string =>
    fs
      .readFileSync(path.join(process.cwd(), relatif), "utf8")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");

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
