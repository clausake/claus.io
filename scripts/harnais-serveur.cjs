// Chantier 46 — LE HARNAIS DES TESTS,partAGE ET CORRECT SUR WINDOWS.
//
// Le defaut mesure (audit senior du 09/11) : 26 harnais (18 specs e2e + 8
// scripts) lanchaient le serveur via `node_modules/.bin/tsx`. Sous Windows,
// ce fichier est un SCRIPT SHELL : le passer a `process.execPath` (node.exe)
// le faisait lire comme du shell —
//     basedir=$(dirname ...) — SyntaxError: missing ) after argument list
// et le serveur ne demarrait jamais. Mesures du client : verify:auth
// echouait sur « serveur pas pret », verify:routes sur « 1 echec de
// demarrage, 43 tests non executes ».
//
// Deux corrections, ici, pour TOUS les harnais :
//
//  1. Le VRAI CLI JavaScript de tsx (`tsx/cli` -> dist/cli.mjs), resolu par
//     le MODULE, pas par le script shell `.bin`. Node sait l'executer sur
//     les deux systemes.
//
//  2. L'arret de l'ARBORESCENCE : sous Windows, `child.kill()` ne tue que
//     le processus direct ; tsx relance un petit-fils node qui SURVIT (le
//     « fantome » deja consigne dans verify-auth.mjs), et le port reste
//     occupe par un serveur d'une course precedente. On passe donc par
//     `taskkill /T /F`, qui tue l'arbre. Sous POSIX, on tue le GROUPE
//     (l'enfant est lance DETACHE), comme avant.
//
// ⚠ Le port du serveur INSTALLE (3000) n'est jamais touche : on ne tue que
// l'arbre du processus qu'ON a lance, par son PID.
const { execFileSync } = require("node:child_process");

/**
 * Le chemin du VRAI CLI JavaScript de tsx (dist/cli.mjs), resolu par le
 * module. `racine` est la racine du depot (celle qui porte node_modules).
 */
function cheminTsx(racine) {
  return require.resolve("tsx/cli", { paths: [racine] });
}

/**
 * Arreter un serveur lance par un harnais, ET toute sa descendance.
 * POSIX : le groupe (l'enfant est lance detache). Windows : taskkill /T.
 */
function arreterServeur(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* deja mort */
      }
    }
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* deja mort */
    }
  }
}

/**
 * Lancer le serveur de test (server.ts) avec le VRAI CLI tsx.
 * `detache` : sur POSIX, l'enfant devient chef de groupe (il meurt avec
 * `arreterServeur`). Sous Windows, `detache` est sans effet (et inutile :
 * taskkill /T descend l'arbre).
 */
function demarrerServeur({ racine, env, cwd, stdio }) {
  const { spawn } = require("node:child_process");
  const options = {
    cwd: cwd || racine,
    env,
    stdio: stdio || "pipe",
  };
  if (process.platform !== "win32") options.detached = true;
  return spawn(process.execPath, [cheminTsx(racine), "server.ts"], options);
}

module.exports = { cheminTsx, arreterServeur, demarrerServeur };
