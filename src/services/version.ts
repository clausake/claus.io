// La version de l'application, lue a l'execution.
//
// Ou elle se trouve : `package.json` est a la RACINE de l'archive Electron
// (asar), et le serveur compile vit dans `dist-server/`. Donc le fichier est
// a `dist-server/../package.json`. En developpement (tsx server.ts), le
// serveur est a la racine du depot : `package.json` est a cote de lui.
//
// Pourquoi une resolution et pas un `require("../../package.json")` : le
// chemin relatif au module change entre le developpement (racine) et la
// version empaquetee (dist-server/), et un `require` qui ne trouve pas son
// fichier fait tomber le serveur au demarrage. On essaie donc les DEUX
// emplacements, et on rend une valeur nommee si aucun ne repond.
import fs from "fs";
import path from "path";

const CANDIDATS = ["package.json"];

function lireVersion(fichier: string): string | null {
  try {
    const brut = JSON.parse(fs.readFileSync(fichier, "utf8")) as { version?: unknown };
    return typeof brut.version === "string" && brut.version.trim() !== ""
      ? brut.version.trim()
      : null;
  } catch {
    return null;
  }
}

/** La version de l'application, ou "inconnue" si elle n'est pas lisible. */
export function versionApplication(): string {
  const racines: string[] = [];
  // A cote du module compile (dist-server/ -> racine de l'asar).
  try {
    racines.push(path.resolve(__dirname, ".."));
  } catch {
    /* __dirname absent : on continue avec le cwd */
  }
  try {
    racines.push(path.resolve(process.cwd()));
  } catch {
    /* cwd illisible : on continue */
  }
  for (const racine of racines) {
    for (const nom of CANDIDATS) {
      const version = lireVersion(path.join(racine, nom));
      if (version) return version;
    }
  }
  return "inconnue";
}
