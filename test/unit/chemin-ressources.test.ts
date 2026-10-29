// Le juge des chemins de ressources — la porte qui manquait sous les « 404
// silencieux » de l'installeur Windows 0.1.0.
//
// Défaut mesuré : le serveur empaqueté cherchait tout depuis `process.cwd()`
// (dossier de l'exe, ou C:\Windows\System32) alors que `dist`, `vocab.json` et
// `public/` vivent DANS l'asar. Résultat : fenêtre « Not Found », Epicure en
// vecteurs nuls, guide en 404.
//
// Chaque règle est jouée dans ses DEUX directions : la forme juste doit passer,
// la forme cassée doit lever. Un résolveur trop tolérant rendrait un dossier
// fantôme (et le 404 reviendrait) ; un résolveur trop strict refuserait un
// lancement légitime depuis la racine du dépôt.
import { describe, it, expect } from "vitest";
import path from "path";
import {
  candidatsDist,
  resoudreDist,
  resoudreDonneesEpicure,
} from "../../src/services/chemin-ressources.js";

const ASAR = "/opt/claus.io/resources/app.asar";
const WIN = "C:\\Windows\\System32";

// Un faux disque : l'ensemble des fichiers qui « existent ».
const disque = (...fichiers: string[]) => {
  const set = new Set(fichiers.map((f) => path.resolve(f)));
  return (f: string) => set.has(path.resolve(f));
};

describe("candidatsDist : ordre et dédoublonnage", () => {
  it("COOKDRIVE_DIST passe en premier (c'est le chemin que le lanceur connaît)", () => {
    const c = candidatsDist({ env: { COOKDRIVE_DIST: "/x/dist" }, dirname: "/x/dist-server", cwd: "/ailleurs" });
    expect(c[0]).toBe(path.resolve("/x/dist"));
  });

  it("une variable vide ou blanche n'est pas un candidat", () => {
    const c = candidatsDist({ env: { COOKDRIVE_DIST: "   " }, dirname: "/x/dist-server", cwd: "/x" });
    expect(c[0]).toBe(path.resolve("/x/dist"));
  });

  it("l'asar (parent du module) est fouillé AVANT le cwd", () => {
    const c = candidatsDist({ env: {}, dirname: `${ASAR}/dist-server`, cwd: "/ailleurs" });
    expect(c).toEqual([path.join(ASAR, "dist"), path.resolve("/ailleurs/dist")]);
  });

  it("un même dossier trouvé par deux voies n'apparaît qu'une fois", () => {
    const c = candidatsDist({ env: {}, dirname: "/x/dist-server", cwd: "/x" });
    expect(c).toEqual([path.resolve("/x/dist")]);
  });
});

describe("resoudreDist : la direction passante", () => {
  it("application empaquetée : dist est DANS l'asar, le cwd n'en a pas", () => {
    const r = resoudreDist({
      env: {},
      dirname: `${ASAR}/dist-server`,
      cwd: WIN,
      fichierExiste: disque(`${ASAR}/dist/index.html`),
    });
    expect(r).toBe(path.join(ASAR, "dist"));
  });

  it("COOKDRIVE_DIST gagne même si dist-server/../dist existe aussi", () => {
    const r = resoudreDist({
      env: { COOKDRIVE_DIST: "/opt/app/dist" },
      dirname: "/opt/app/dist-server",
      cwd: "/",
      fichierExiste: disque("/opt/app/dist/index.html"),
    });
    expect(r).toBe(path.resolve("/opt/app/dist"));
  });

  it("npm start depuis le dépôt : seul le cwd porte dist", () => {
    const r = resoudreDist({
      env: {},
      dirname: "/tmp/inexistant/dist-server",
      cwd: "/home/moi/claus.io",
      fichierExiste: disque("/home/moi/claus.io/dist/index.html"),
    });
    expect(r).toBe(path.resolve("/home/moi/claus.io/dist"));
  });
});

describe("resoudreDist : la morsure", () => {
  it("dist absent partout : LÈVE en nommant les chemins fouillés (jamais un dossier fantôme)", () => {
    expect(() =>
      resoudreDist({ env: {}, dirname: `${ASAR}/dist-server`, cwd: WIN, fichierExiste: () => false }),
    ).toThrowError(/RESSOURCE_INTROUVABLE/);
  });

  it("le message cite le chemin asar ET le cwd testé (un 404 muet ne dit rien, celui-là si)", () => {
    try {
      resoudreDist({ env: {}, dirname: `${ASAR}/dist-server`, cwd: "/un/dossier", fichierExiste: () => false });
      expect.unreachable("aurait dû lever");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain(path.join(ASAR, "dist"));
      expect(msg).toContain(path.resolve("/un/dossier/dist"));
    }
  });

  it("un dossier dist sans index.html ne compte pas (dossier vide = 404 garanti)", () => {
    expect(() =>
      resoudreDist({
        env: {},
        dirname: "/opt/app/dist-server",
        cwd: "/opt/app",
        fichierExiste: disque("/opt/app/dist/main.js"), // dist existe, index.html non
      }),
    ).toThrowError(/RESSOURCE_INTROUVABLE/);
  });
});

describe("resoudreDonneesEpicure : le moteur d'accords ne lit plus des vecteurs nuls en silence", () => {
  it("vocab.json trouvé à la racine de l'asar (à côté de dist-server/) = la racine rendue", () => {
    const r = resoudreDonneesEpicure({
      env: {},
      dirname: `${ASAR}/dist-server`,
      cwd: WIN,
      fichierExiste: disque(`${ASAR}/vocab.json`),
    });
    expect(r).toBe(path.resolve(ASAR));
  });

  it("COOKDRIVE_DONNEES impose un dossier de données externe", () => {
    const r = resoudreDonneesEpicure({
      env: { COOKDRIVE_DONNEES: "/var/lib/clausio" },
      dirname: `${ASAR}/dist-server`,
      cwd: "/",
      fichierExiste: disque("/var/lib/clausio/vocab.json"),
    });
    expect(r).toBe(path.resolve("/var/lib/clausio"));
  });

  it("vocab.json absent : LÈVE (le défaut « Epicure silencieusement nul » est nommé)", () => {
    expect(() =>
      resoudreDonneesEpicure({ env: {}, dirname: `${ASAR}/dist-server`, cwd: "/", fichierExiste: () => false }),
    ).toThrowError(/donnees Epicure/);
  });
});
