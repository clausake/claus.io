import fs from "fs";
import path from "path";

// Où vivent les FICHIERS DE L'APPLICATION quand elle doit les lire.
//
// Défaut corrigé (installeur Windows 0.1.0, mesuré) : tout était cherché depuis
// `process.cwd()`. Empaquetée, l'application porte ses fichiers DANS son archive
// (`…/resources/app.asar/…`) alors que le cwd du processus est le dossier
// d'installation (ou `C:\Windows\System32` selon le raccourci) :
//   - `dist` introuvable -> la fenêtre Electron affichait la page Express
//     « Not Found » au lieu de l'application ;
//   - `vocab.json` / `embeddings.*.safetensors` introuvables -> Epicure tombait
//     en vecteurs NULS en silence (« CRITICAL error loading EpicureModel ») ;
//   - `public/Executive_Guide.pdf` introuvable -> téléchargement du guide en 404.
//
// Résolution : le PREMIER candidat qui contient vraiment le fichier sentinelle
// gagne ; aucun candidat = exception NOMMÉE (refuser en disant où l'on a cherché,
// plutôt que servir un 404 qu'on prendra pour un bug de l'interface).

export interface ContexteRessource {
  env?: Record<string, string | undefined>;
  /** Dossier du module appelant (dist-server/ empaqueté, racine du dépôt en dev). */
  dirname?: string;
  cwd?: string;
  fichierExiste?: (cheminFichier: string) => boolean;
}

interface Resolution {
  racines: string[];
  candidats: string[];
  existe: (fichier: string) => boolean;
}

// Préparation commune : les racines possibles, puis les dossiers candidats.
//   racine 1 : la variable d'environnement (chemin exact connu du lanceur) ;
//   racine 2 : le dossier PARENT du module (`dist-server/..`) — c'est la racine de
//              l'asar empaquetée, et aussi la racine du dépôt pour un build local ;
//   racine 3 : le cwd — lancement depuis la racine du dépôt (`npm start`).
function preparer(ctx: ContexteRessource, variableEnv: string, sousDossier: string[]): Resolution {
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();
  const dirname =
    ctx.dirname !== undefined
      ? ctx.dirname
      : typeof __dirname === "string"
        ? __dirname
        : undefined;

  const existe =
    ctx.fichierExiste ??
    ((fichier: string) => {
      try {
        return fs.statSync(fichier).isFile();
      } catch {
        return false;
      }
    });

  const brut: string[] = [];
  const impose = (env[variableEnv] ?? "").trim();
  if (impose) brut.push(path.resolve(impose));
  if (dirname) brut.push(path.resolve(dirname, ".."));
  brut.push(path.resolve(cwd));
  // Un même dossier trouvé par deux voies ne se cherche pas deux fois.
  const racines = brut.filter((c, i) => brut.indexOf(c) === i);

  // La variable d'environnement désigne le dossier FINAL (le lanceur connaît le
  // chemin exact) ; les racines désignent un parent où il faut descendre.
  const candidats: string[] = [];
  if (impose) candidats.push(path.resolve(impose));
  for (const racine of racines) {
    if (impose && path.resolve(impose) === racine) continue;
    candidats.push(sousDossier.length ? path.join(racine, ...sousDossier) : racine);
  }
  const uniques = candidats.filter((c, i) => candidats.indexOf(c) === i);
  return { racines, candidats: uniques, existe };
}

function resoudre(sentinelle: string, etiquette: string, r: Resolution): string {
  const trouve = r.candidats.find((dossier) => r.existe(path.join(dossier, sentinelle)));
  if (trouve) return trouve;

  throw new Error(
    `RESSOURCE_INTROUVABLE (${etiquette}) : ${sentinelle} absent de ` +
      `${r.candidats.join(" | ")}. L'application est installee sans ses fichiers, ` +
      `ou le frontend n'a pas ete compile (npm run build).`,
  );
}

/** Le dossier `dist` (frontend compilé) à servir. */
export function resoudreDist(ctx: ContexteRessource = {}): string {
  return resoudre("index.html", "frontend dist", preparer(ctx, "COOKDRIVE_DIST", ["dist"]));
}

/** Le dossier des données Epicure (vocabulaire + vecteurs du moteur d'accords). */
export function resoudreDonneesEpicure(ctx: ContexteRessource = {}): string {
  return resoudre("vocab.json", "donnees Epicure", preparer(ctx, "COOKDRIVE_DONNEES", []));
}

/** Exposé pour les juges : la liste des dossiers réellement fouillés. */
export function candidatsDist(ctx: ContexteRessource = {}): string[] {
  return preparer(ctx, "COOKDRIVE_DIST", ["dist"]).candidats;
}

export function candidatsDonneesEpicure(ctx: ContexteRessource = {}): string[] {
  return preparer(ctx, "COOKDRIVE_DONNEES", []).candidats;
}
