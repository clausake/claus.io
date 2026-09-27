// Le couloir de la garde DLC/DDM — le MEME module du produit que la voie
// facture (src/shared/extraction/garde-dlc.ts). stdin JSON :
// {"lignes": ["A CONSOMMER JUSQU'AU", "25/10/2026", …], "aujourdhui": "2026-09-25"}
// stdout : {"libelle","chaine","verdict","genre","iso","lignes"}
// La CHAINE est la premiere ligne qui rend jj/mm/aaaa ; le LIBELLE est la
// ligne qui porte un mot d'etat connu des listes (sinon LIBELLE_INCONNU).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const G = await import(path.join(RACINE, "src/shared/extraction/garde-dlc.ts"));

const entree = JSON.parse(readFileSync(0, "utf8"));
const lignes = (entree.lignes ?? []).map((l) => String(l).trim()).filter((l) => l !== "");
const [aa, mo, jj] = entree.aujourdhui.split("-").map(Number);
const aujourdhui = new Date(Date.UTC(aa, mo - 1, jj));

const MOTS_ETAT = /consommer|verbrauchen|haltbar|consumarsi|gebruiken|perime|périmé/i;
const ligneDate = lignes.find((l) => /\d{2}\/\d{2}\/\d{4}/.test(l));
const dateLue = ligneDate ? /\d{2}\/\d{2}\/\d{4}/.exec(ligneDate)[0] : null;
// Le moteur peut FONDRE le libelle et la date en une ligne (mesure
// 27/09) : la ligne de date porte le mot d'etat — elle est son propre
// libelle quand aucune autre ligne ne le porte.
const ligneLibelle = lignes.find((l) => MOTS_ETAT.test(l) && l !== ligneDate)
  ?? (ligneDate && MOTS_ETAT.test(ligneDate) ? ligneDate : "");

const r = G.jugerDlc(dateLue ?? "", ligneLibelle, aujourdhui);
process.stdout.write(JSON.stringify({
  libelle: ligneLibelle, chaine: dateLue, verdict: r.verdict, genre: r.genre,
  iso: r.iso, lignes,
}));
