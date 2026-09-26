// Le moteur PaddleOCR local (Sprint 15, Tache 6).
//
// HORS LIGNE par construction: les poids (det/rec/dict, 12,8 Mo, scelles a la
// Tache 7) vivent dans le livrable, a cote de l'application. Aucun CDN, aucun
// telechargement au premier usage — c'est la raison meme du remplacement de
// Tesseract (mesure du 25/09: tesseract.js tire ses langues depuis jsdelivr).
//
// LA VOIE D'ENTREE, MESUREE AU SPIKE (sonde-5-voies.mjs, 25/09):
//   voie A (tampon brut)  : ECHEC — loadImage rend un Image SANS getContext,
//                           que le paquet passe a getContext("2d") → TypeError.
//   voie B (chemin fichier): OK   — le paquet lit lui-même. C'est LA voie.
//   voie C (toile vraise) : OK   — createCanvas + drawImage, le depanage.
// Le produit recoit des CHEMINS de fichié, jamais des tampons nus. Quand un
// tampon s'impose (image sortie du telephone, voie Electron), on passe par la
// voie C: on ecrit le tampon dans un fichié temporaire, et on rend la voie B.
//
// LE CHAMP DE SORTIE N'EST PAS PRESUME: le spike a probe text/fullText/joined
// et lines[].text, dans cet ordre, parce que la formé exacte varie par version.
// Un champ absent leve une faute nommee — jamais un texte vide interprete comme
// « la piece est vide ».

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ocr } from "ppu-paddle-ocr";
import { assemble, type LectureOcr } from "../ocr-commun.js";

export interface ModelesOcr {
  readonly detection: string;
  readonly recognition: string;
  readonly dictionnaire: string;
}

/** Ou vivent les poids. Livré: `resources/ocr/modeles` (Electron: sous
 *  process.resourcesPath). Dev: le meme chemin relatif a la racine du depot. */
export function cheminModeles(): ModelesOcr {
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath;
  const base = rp
    ? path.join(rp, "ocr", "modeles")
    : path.join(process.cwd(), "resources", "ocr", "modeles");
  return {
    detection: path.join(base, "det.onnx"),
    recognition: path.join(base, "rec.onnx"),
    dictionnaire: path.join(base, "dict.txt"),
  };
}

export class ModelesAbsents extends Error {
  constructor(readonly chemins: string[]) {
    super(`modeles OCR absents du livrable: ${chemins.join(", ")}`);
    this.name = "ModelesAbsents";
  }
}

function verifierModeles(m: ModelesOcr): void {
  const manquants = Object.values(m).filter((c) => !fs.existsSync(c));
  if (manquants.length > 0) throw new ModelesAbsents(manquants);
}

/** La sortie du paquet, lue sans RIEN presumer (mesure du spike). */
function lignesDeLaSortie(sortie: unknown): string[] {
  const s = sortie as Record<string, unknown>;
  const lignes = s?.["lines"];
  if (Array.isArray(lignes)) {
    // LA SORTIE BRUTE est lines[] de GROUPES: chaque groupe porte PLUSIEURS
    // fragments avec .text/.box/.confidence (mesure sonde-8-sortie-brute.mjs:
    // lines.length=20, chaque groupe porte 1..6 fragments, ex.
    // "Designation","Qte","U","P.U. HT"...). Le juge par lignes exige les
    // fragments SEULS (un groupe = une ligne visuelle, un fragment = une
    // colonne), jamais un bloc fondu. On rend CHAQUE fragment comme une ligne
    // separate, avec la boite pour la preuve ancree (Tache 15).
    // Une bande SANS encre rend un tableau VIDE : c'est un resultat legitime
    // (le decoupage par bandes en produit), pas une sortie inattendue.
    return lignes.flatMap((groupe) => (Array.isArray(groupe)
      ? groupe.map((frag) => String((frag as Record<string, unknown>)?.text ?? ""))
      : [String((groupe as Record<string, unknown>)?.text ?? "")])
      .filter((t) => t.trim() !== ""));
  }
  for (const cle of ["text", "fullText", "joined"]) {
    const v = s?.[cle];
    if (typeof v === "string" && v.trim() !== "") return v.split("\n");
  }
  throw new Error("SortieOcrInattendue: ni lines[].text ni text/fullText/joined");
}

/** Segmente la piece en BANDES de lignes par projection de luminance
 *  (mesure probe-bandes.py + sonde-18-bandes.mjs du 26/09: 23 bandes sur la
 *  piece du banc, et c'est LA bande 713..734 qui rend `419,60` — la pleine
 *  page ne le rend pas, le det le perd). Le moteur ne recoit donc JAMAIS la
 *  piece entiere : il recoit des bandes, assemblées ensuite par ordre y.
 *
 *  Reglages mesures (ne pas "ameliorer" sans re-mesurer):
 *    encre   : un pixel < 160 de gris, au moins 2 par rangee (pas 1 : le
 *              decor du tableau sinon rend des bandes parasites) ;
 *    fusion  : deux rangees separees de <= 4 px vuides restent la MEME bande
 *              (les accents de "Reglement" sont a 4 px du mot) ;
 *    plancher: une bande de moins de 6 px de haut n'est pas une ligne. */
export async function bandesDeLigne(cheminImage: string):
  Promise<Array<{ y0: number; y1: number }>> {
  const img = await loadImage(cheminImage);
  const W = img.width, H = img.height;
  // Une seule lecture de pixels, puis projection : ocr() recoit des toiles,
  // pas ce tampon (voie A mesuree morte), mais decouper est gratuit.
  const toile = createCanvas(W, H);
  toile.getContext("2d").drawImage(img as never, 0, 0);
  const data = toile.getContext("2d").getImageData(0, 0, W, H).data;
  const encre = (y: number): boolean => {
    let n = 0;
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const gris = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (gris < 160 && ++n >= 2) return true;
    }
    return false;
  };
  const sombres = Array.from({ length: H }, (_, y) => encre(y));
  const bandes: Array<{ y0: number; y1: number }> = [];
  let y = 0;
  while (y < H) {
    if (!sombres[y]) { y += 1; continue; }
    const debut = y;
    let fin = y;
    let trou = 0;
    while (y < H && trou <= 4) {
      if (sombres[y]) { fin = y + 1; trou = 0; } else { trou += 1; }
      y += 1;
    }
    if (fin - debut >= 6) bandes.push({ y0: debut, y1: fin });
  }
  return bandes;
}

const MARGE_BANDE = 13; // px de blanc autour de chaque bande (mesure sonde-18)

/** Lit une piece par son CHEMIN (la voie B mesuree) EN BANDES : chaque bande
 *  est coupee sur une toile vraise (voie C mesuree au spike) et jouee a ocr()
 *  seule. Les fragments sont rendus SEPARS — le juge du contrat les exige
 *  (retractation 1). */
export async function lireParChemin(cheminImage: string,
                                    modeles: ModelesOcr = cheminModeles()): Promise<LectureOcr> {
  const t0 = Date.now();
  verifierModeles(modeles);
  if (!fs.existsSync(cheminImage)) {
    throw new Error(`PieceOcrIntrouvable: ${cheminImage}`);
  }
  const img = await loadImage(cheminImage);
  const bandes = await bandesDeLigne(cheminImage);
  const fragments: string[] = [];
  let aucuneSortie = true;
  for (const b of bandes) {
    const y0 = Math.max(0, b.y0 - MARGE_BANDE);
    const y1 = Math.min(img.height, b.y1 + MARGE_BANDE);
    const toile = createCanvas(img.width, y1 - y0);
    toile.getContext("2d").drawImage(img as never,
      0, y0, img.width, y1 - y0, 0, 0, img.width, y1 - y0);
    // LA SIGNATURE DU PAQUET dit `ArrayBuffer | Canvas` : la toile vraise
    // (voie C du spike, OK 725 caracteres) est une entree LEGALE. Le cast ne
    // fait qu'effacer l'ambiguite des types du paquet, il n'ecrase rien.
    const sortie = await ocr(toile as unknown as ArrayBuffer, {
      model: {
        detection: modeles.detection,
        recognition: modeles.recognition,
        charactersDictionary: modeles.dictionnaire,
      },
      processing: { engine: "canvas-native" },
      flatten: false,
    });
    const lignes = lignesDeLaSortie(sortie);
    if (lignes.length > 0) aucuneSortie = false;
    fragments.push(...lignes);
  }
  if (aucuneSortie) {
    throw new Error("SortieOcrInattendue: aucune bande n'a rendu de texte");
  }
  return assemble(fragments, "paddle", t0);
}

/** Un tampon (la voie Electron/telephone): ecrit dans un temporaire, puis la
 *  voie B. On ne passe JAMAIS le tampon nu au paquet (voie A mesuree morte). */
export async function lireParTampon(tampon: Buffer,
                                    modeles: ModelesOcr = cheminModeles()): Promise<LectureOcr> {
  const temporaire = path.join(os.tmpdir(), `cookdrive-ocr-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(temporaire, tampon);
  try {
    return await lireParChemin(temporaire, modeles);
  } finally {
    fs.rmSync(temporaire, { force: true });
  }
}
