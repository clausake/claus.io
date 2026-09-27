// Le coffre des clefs (Sprint 15, taches 10 et 12).
//
// La clef d'API du prestataire en ligne ne vit NI dans settings.json (la
// table est lisible par tout fichier de la sauvegarde), NI dans la base
// SQLite, NI dans un argument journalise. Elle vit dans le TROUSSEAU DU
// SYSTEME : `safeStorage` d'Electron (chiffre avec la clef du compte OS).
//
// Le serveur Express tourne DEDANS le processus Electron en production
// (electron/main.cjs : `require(dist-server/server.cjs)`) — donc safeStorage
// est atteignable ici directement. HORS Electron (dev tsx, le banc, les
// portes), safeStorage n'existe pas : la voie de secours ecrit un fichier
// `coffre.json` en 0600 dans le dossier de donnees, et le rend NON CHIFFRE a
// l'appelant (`chiffre: false`) — jamais un faux « range dans le trousseau ».
//
// Ce module ne LOG JAMAIS une clef : ni la valeur, ni un prefixe, ni la
// longueur (une longueur dans un log est deja une fuite d'entropie).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { settingsPath } from "./settings.js";

// createRequire FIGE sur un chemin du cwd : sous le bundle CJS du livrable
// (esbuild --format=cjs), `import.meta.url` est UNDEFINED et createRequire
// rougit a la naissance du serveur (faute mesuree sur la piece dist-server/
// server.cjs le 27/09). createRequire ne fait que demander un chemin de
// reference pour resoudre `electron` — un nom du cwd convient.
const requireCjs = createRequire(path.join(process.cwd(), "cookdrive-coffre.cjs"));

export interface EtatClef {
  readonly fournisseur: string;
  readonly presente: boolean;
  readonly chiffre: boolean;
}

/** Le nom normalise d'un fournisseur pour la clef du coffre (minuscules). */
function nomMeristique(fournisseur: string): string | null {
  const n = String(fournisseur ?? "").trim().toLowerCase();
  if (n === "" || n.length > 40) return null;
  if (!/^[a-z0-9._-]+$/.test(n)) return null; // un nom n'est pas une injection
  return n;
}

function cheminCoffre(): string {
  return path.join(path.dirname(settingsPath), "coffre.json");
}

/** safeStorage n'existe QUE dans le processus principal Electron. */
function safeStorageDispo(): { encrypt(s: string): Buffer; decrypt(b: Buffer): string } | null {
  if (!process.versions?.electron) return null;
  try {
    // requireCjs et non import() : ce fichier tourne en CJS consolide par
    // esbuild (dist-server/server.cjs) DEDANS Electron ; `electron` n'est
    // atteignable que par la voie commune.
    const { safeStorage } = requireCjs("electron");
    if (safeStorage && safeStorage.isEncryptionAvailable()) return safeStorage;
    return null;
  } catch {
    return null;
  }
}

interface CoffreBrut { [fournisseur: string]: { b64: string; chiffre: boolean } }

function lireCoffre(): CoffreBrut {
  try {
    const p = cheminCoffre();
    if (!fs.existsSync(p)) return {};
    const brut = JSON.parse(fs.readFileSync(p, "utf8"));
    return brut && typeof brut === "object" ? brut as CoffreBrut : {};
  } catch {
    return {}; // un coffre illisible est un coffre VIDE, pas une exception nue
  }
}

function ecrireCoffre(c: CoffreBrut): void {
  const p = cheminCoffre();
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
}

/** Ranger une clef. Une clef vide est refusee NOMMEEMENT (un POST qui
 *  « reussirait » sans rien ranger est un capteur mort). */
export function rangerClef(fournisseur: string, clef: string):
    EtatClef | { ok: false; defaut: string } {
  const nom = nomMeristique(fournisseur);
  if (nom === null) return { ok: false, defaut: "FOURNISSEUR_MAL_FORME" };
  if (typeof clef !== "string" || clef.trim() === "")
    return { ok: false, defaut: "CLEF_VIDE" };
  const valeur = clef.trim();
  const ss = safeStorageDispo();
  const coffre = lireCoffre();
  if (ss) {
    coffre[nom] = { b64: ss.encrypt(valeur).toString("base64"), chiffre: true };
  } else {
    // La voie de secours (dev/banc) : le fichier est en 0600 mais NON chiffre
    // — rendu tel quel, sans maquillage. En livraison Electron, cette voie ne
    // doit jamais servir ; `chiffre:false` est la preuve visible qu'elle a servi.
    coffre[nom] = { b64: Buffer.from(valeur, "utf8").toString("base64"), chiffre: false };
  }
  ecrireCoffre(coffre);
  return { fournisseur: nom, presente: true, chiffre: ss !== null };
}

/** Lire une clef pour l'appel sortant (la voie du produit : le serveur, pas
 *  l'UI). Rend null si absente — jamais une chaine vide confondue avec « il
 *  n'y a pas de clef » par un appelant distrait. */
export function lireClef(fournisseur: string): string | null {
  const nom = nomMeristique(fournisseur);
  if (nom === null) return null;
  const entree = lireCoffre()[nom];
  if (!entree) return null;
  try {
    const buf = Buffer.from(entree.b64, "base64");
    if (entree.chiffre) {
      const ss = safeStorageDispo();
      if (!ss) return null; // on ne dechiffre pas a l'aveugle : absence assumee
      return ss.decrypt(buf) || null;
    }
    return buf.toString("utf8") || null;
  } catch {
    return null; // un decryptage qui casse est une clef ABSENTE, pas un succes
  }
}

/** L'etat, sans la valeur (la voie de l'UI : « une clef est rangee » oui/non,
 *  Jamais la clef elle-meme, jamais un debut de clef). */
export function etatClef(fournisseur: string): EtatClef | { ok: false; defaut: string } {
  const nom = nomMeristique(fournisseur);
  if (nom === null) return { ok: false, defaut: "FOURNISSEUR_MAL_FORME" };
  const entree = lireCoffre()[nom];
  return { fournisseur: nom, presente: entree !== undefined, chiffre: entree?.chiffre ?? false };
}
