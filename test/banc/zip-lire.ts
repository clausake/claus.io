// Lecture d'une archive ZIP (hors dependance : le format est simple et le
// depot n'installe pas de lecteur).
//
// Pourquoi : un test d'export ne peut pas juger « 200 + application/zip ».
// L'ancien test de routes.spec.ts acceptait exactement cela, et passait sur
// une archive VIDE de 219 octets dont la base ne contenait aucune table
// (defaut mesure par l'audit du 09/11). Pour prouver que le fichier livre
// porte les DONNEES, il faut l'OUVRIR : on parse le repertoire central, on
// decompresse l'entree, puis on interroge la base qu'elle contient.
//
// Le format lu ici est celui produit par `archiver` (deflate, methode 8, ou
// "stored", methode 0) : c'est le seul que produit le produit.
import { inflateRawSync } from "node:zlib";

export interface EntreeZip {
  nom: string;
  taille: number;
  methode: number;
  offset: number;
}

export interface ArchiveZip {
  entrees: EntreeZip[];
  noms: string[];
  /** Le contenu d'une entree (decompresse si necessaire). */
  contenu(nom: string): Buffer;
}

/** Parse une archive ZIP et rend ses entrees + un lecteur de contenu. */
export function lireZip(buf: Buffer): ArchiveZip {
  // Le repertoire central ("end of central directory") est en fin de fichier.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP invalide : pas de repertoire central");
  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entrees: EntreeZip[] = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`ZIP invalide : entree ${n} mal formee`);
    }
    const methode = buf.readUInt16LE(pos + 10);
    const taille = buf.readUInt32LE(pos + 20);
    const nomLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentaireLen = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42);
    const nom = buf.subarray(pos + 46, pos + 46 + nomLen).toString("utf8");
    entrees.push({ nom, taille, methode, offset });
    pos += 46 + nomLen + extraLen + commentaireLen;
  }
  return {
    entrees,
    noms: entrees.map((e) => e.nom),
    contenu(nom: string): Buffer {
      const e = entrees.find((x) => x.nom === nom);
      if (!e) throw new Error(`l'entree « ${nom} » est absente du ZIP`);
      const off = e.offset;
      if (buf.readUInt32LE(off) !== 0x04034b50) {
        throw new Error(`ZIP invalide : en-tete local de « ${nom} » mal forme`);
      }
      const nomLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const debut = off + 30 + nomLen + extraLen;
      const brut = buf.subarray(debut, debut + e.taille);
      if (e.methode === 0) return brut;
      if (e.methode === 8) return inflateRawSync(brut);
      throw new Error(`methode de compression ZIP non geree : ${e.methode}`);
    },
  };
}
