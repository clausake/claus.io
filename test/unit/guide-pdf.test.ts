import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// La notice telechargeable (Reglages → « Télécharger le guide ») est generee
// par le dictionnaire `guides` de src/lib/settings-guides.ts. Ce juge est la
// barriere de non-regression de cette notice : une section supprimee par
// erreur, ou une langue qui n'embarque pas la section « Sauvegarde et reprise
// des donnees », doit rougir ici, pas chez le client qui reinstalle son poste.

const SOURCE = path.join(process.cwd(), "src", "lib", "settings-guides.ts");
const LANGUES = ["fr", "en", "de", "es", "it"] as const;

// Le texte attendu dans la section 7 de CHAQUE langue (mesure : le dictionnaire
// est un litteral du fichier, la generation jsPDF ne reecrit aucun mot).
const ATTENDUS: Record<string, string[]> = {
  fr: ["SAUVEGARDE", "REPRISE", "Sauvegarder", "démarrage", "cinq"],
  en: ["BACKUP", "RECOVERY", "Save backup", "start", "five"],
  de: ["SICHERUNG", "WIEDERHERSTELLUNG", "Sichern", "Start", "fünf"],
  es: ["COPIA DE SEGURIDAD", "RECUPERACIÓN", "Guardar copia", "iniciar", "cinco"],
  it: ["BACKUP", "RIPRISTINO", "Salva backup", "avvio", "cinque"],
};

describe("le guide telechargeable (src/lib/settings-guides.ts)", () => {
  const texte = fs.readFileSync(SOURCE, "utf8");

  it("les cinq langues du guide sont declarees", () => {
    for (const langue of LANGUES) {
      expect(texte, `la langue ${langue} est absente du dictionnaire`).toContain(`${langue}: {`);
    }
  });

  it("chaque langue porte les sept sections, numerotees de 1 a 7", () => {
    for (const langue of LANGUES) {
      const bloc = blocLangue(texte, langue);
      for (let n = 1; n <= 7; n++) {
        expect(bloc, `${langue} : la section ${n} est absente`).toContain(`title: "${n}. `);
      }
    }
  });

  it("chaque langue dit la sauvegarde, la copie automatique et la reprise", () => {
    for (const langue of LANGUES) {
      const section = section7(texte, langue);
      for (const mot of ATTENDUS[langue]) {
        expect(section, `${langue} : « ${mot} » est absent de la section 7`).toContain(mot);
      }
    }
  });

  it("la section 7 promet ce qui est reellement dans le produit", () => {
    // Mesures 10/11 : la copie automatique existe au demarrage PUIS a
    // l'intervalle (db-backup.ts BACKUP_INTERVAL_MS = 3600000) et la rotation
    // garde MAX_BACKUPS = 5 archives ; l'export est reserve au maitre
    // (src/middleware/garde-maitre.ts).
    const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "db-backup.ts"), "utf8");
    expect(src).toContain("BACKUP_INTERVAL_MS = 3600000");
    expect(src).toContain("MAX_BACKUPS = 5");
    const maitre = fs.readFileSync(path.join(process.cwd(), "src", "middleware", "garde-maitre.ts"), "utf8");
    expect(maitre).toMatch(/maitre/);
    for (const langue of LANGUES) {
      const section = section7(texte, langue);
      expect(section, `${langue} : rien sur la copie automatique`).toMatch(/démarrage|start|Start|iniciar|avvio/);
      expect(section, `${langue} : rien sur les cinq archives conservees`).toMatch(/cinq|five|fünf|cinco|cinque/);
    }
  });

  it("le README annonce le meme nombre de sections que le guide", () => {
    const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    expect(readme, 'le README doit dire « sept sections » (et non un compte périmé)').toContain("sept sections");
    expect(readme).not.toContain("six sections");
  });

  it("le guide porte le nom du produit, pas un nom de developpement", () => {
    // Mesure 10/11 : les cinq titres et les cinq noms de fichier etaient
    // « AGENT CULINAIRE OS », un nom que le client ne lit nulle part ailleurs
    // (le produit est claus.io partout ailleurs : README, installeurs,
    // electron-builder productName).
    for (const langue of LANGUES) {
      const bloc = blocLangue(texte, langue);
      expect(bloc, `${langue} : un nom de produit autre que claus.io`).not.toMatch(/AGENT CULINAIRE/i);
      expect(bloc, `${langue} : le titre porte le nom du produit`).toMatch(/CLAUS\.IO/);
      expect(bloc, `${langue} : le fichier telecharge porte le nom du produit`).toMatch(/fileName: "[^"]*clausio\.pdf"/);
    }
  });
});

// --- coupe du dictionnaire (le fichier est un litteral, pas un AST) --------
// Le separateur reel est `},\n      <langue>: {` (mesure dans le fichier) ; le
// DERNIER bloc (it) se termine par `}\n    };`, d'ou le sentinelle ci-dessous.
function blocLangue(texte: string, langue: string): string {
  const depart = texte.indexOf(`\n      ${langue}: {`);
  expect(depart, `le bloc ${langue} est introuvable`).toBeGreaterThan(-1);
  const suivants = LANGUES.map((l) => texte.indexOf(`\n      ${l}: {`, depart + 1)).filter((i) => i > -1);
  const apres = suivants.length ? Math.min(...suivants) : texte.indexOf("\n    };", depart);
  expect(apres, `la fin du bloc ${langue} est introuvable`).toBeGreaterThan(depart);
  return texte.slice(depart, apres);
}

function section7(texte: string, langue: string): string {
  const bloc = blocLangue(texte, langue);
  const depart = bloc.indexOf('title: "7. ');
  expect(depart, `${langue} : la section 7 est absente`).toBeGreaterThan(-1);
  return bloc.slice(depart);
}
