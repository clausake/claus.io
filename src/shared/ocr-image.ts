// Chantier B — VALIDER L'IMAGE AVANT DE LA DONNER AU MOTEUR.
//
// Le defaut mesure (document de verification 1.0.6, 11/11) : un POST avec un
// PNG au CRC corrompu TUAIT LE PROCESSUS. Reproduit sur ce poste (11/11) :
//   libpng error: [00][00][00][08]: invalid chunk type
//   UNCAUGHT-EXCEPTION: Error: Error attempting to read image.   <- rc 77
// Le « libpng error » part dans process.nextTick DEPUIS le worker interne de
// tesseract.js : un try/catch autour de recognize(...) ne l'attrape PAS
// (mesure : le meme appel, encadre, part quand meme en uncaughtException).
// Donc la parade n'est pas « attraper », c'est « ne pas donner au moteur ce
// qu'il ne peut pas lire ». On valide les OCTETS (la signature du format) et
// une taille raisonnable AVANT d'invoquer le moteur.
//
// CE MODULE NE S'ARRETE PAS A LA SIGNATURE. Mesure du 11/11 : un fichier qui
// a une VRAIE signature PNG mais un CRC d'IHDR faux passe le controle des
// octets, et le « libpng error: IHDR: CRC error » du worker part quand meme
// en uncaughtException MALGRE un try/catch autour de recognize() (rc 77,
// sonde probe-ocr-corrompu.ts). La signature ne suffit donc pas : on verifie
// la STRUCTURE complete des chunks PNG (CRC reel de chaque chunk) avant de
// donner le fichier au moteur. Ce n'est pas « re-implementer libpng » : c'est
// lire les en-tetes que libpng va lire, et refuser ce qu'il refusera — mais
// ici, sans tuer le processus.

/** Taille max acceptee avant meme d'essayer de lire (la piece du banc fait
 *  12,8 Mo ; un fichier de 25 Mo n'est pas une facture scannee). */
export const OCTETS_MAX_IMAGE = 25 * 1024 * 1024;

/** Les signatures (magic bytes) des formats que le produit accepte comme
 *  images. Un fichier qui ne commence par aucune d'elles n'est pas une image
 *  lisible : c'est exactement l'entree qui faisait tomber le worker. */
const SIGNATURES: Array<{ nom: string; octets: readonly number[] }> = [
  { nom: "png", octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { nom: "jpeg", octets: [0xff, 0xd8, 0xff] },
  { nom: "bmp", octets: [0x42, 0x4d] },
  { nom: "gif87", octets: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { nom: "gif89", octets: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { nom: "tiff-le", octets: [0x49, 0x49, 0x2a, 0x00] },
  { nom: "tiff-be", octets: [0x4d, 0x4d, 0x00, 0x2a] },
];

function commencePar(tampon: Buffer, signature: readonly number[]): boolean {
  if (tampon.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) if (tampon[i] !== signature[i]) return false;
  return true;
}

/** Un « RIFF » seul n'est pas une image : WEBP porte « WEBP » a l'octet 8. */
function estWebp(tampon: Buffer): boolean {
  if (!commencePar(tampon, [0x52, 0x49, 0x46, 0x46])) return false;
  if (tampon.length < 12) return false;
  return tampon[8] === 0x57 && tampon[9] === 0x45 && tampon[10] === 0x42 && tampon[11] === 0x50;
}

export type VerdictImage =
  | { readonly valide: true; readonly format: string }
  | { readonly valide: false; readonly motif: string };

// --- PNG : verification de la STRUCTURE des chunks --------------------------
// Le defaut mesure est un PNG a signature valide et CRC d'IHDR faux. La
// signature le laisse passer ; seul le CRC verifie le refuse AVANT le worker.
// Le format est simple et stable (RFC 2083 / PNG Third Edition) :
//   signature 8 o, puis des chunks [longueur 4o][type 4o][donnees][CRC 4o],
//   le CRC etant le CRC-32 (poly 0xEDB88320) du TYPE + des DONNEES.

let TABLE_CRC: Int32Array | null = null;
function tableCrc(): Int32Array {
  if (TABLE_CRC) return TABLE_CRC;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  TABLE_CRC = t;
  return t;
}

function crc32(tampon: Buffer, debut: number, fin: number): number {
  const t = tableCrc();
  let c = 0xffffffff;
  for (let i = debut; i < fin; i++) c = t[(c ^ tampon[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Le PNG est-il structurellement correct (CRC de chaque chunk verifie) ?
 *  Rend un MOTIF nomme : on ne renvoie jamais un booleen muet. */
export function pngStructurellementValide(tampon: Buffer): VerdictImage {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (tampon[i] !== SIG[i]) return { valide: false, motif: "SIGNATURE_PNG_ABSENTE" };
  let p = 8;
  let chunks = 0;
  let vuIHDR = false;
  let vuIEND = false;
  while (p + 8 <= tampon.length) {
    const longueur = tampon.readUInt32BE(p);
    const type = tampon.toString("latin1", p + 4, p + 8);
    const debutDonnees = p + 8;
    const finDonnees = debutDonnees + longueur;
    const finCrc = finDonnees + 4;
    if (finCrc > tampon.length) {
      return { valide: false, motif: `TRONQUE_dans_${type}` };
    }
    const crcAnnonce = tampon.readUInt32BE(finDonnees);
    const crcReel = crc32(tampon, p + 4, finDonnees); // type + donnees
    if (crcAnnonce !== crcReel) {
      return { valide: false, motif: `CRC_FAUX_dans_${type}` };
    }
    if (type === "IHDR") {
      vuIHDR = true;
      if (longueur < 13) return { valide: false, motif: "IHDR_TROP_COURT" };
    }
    if (type === "IEND") {
      vuIEND = true;
      break; // fin normale du fichier
    }
    if (!vuIHDR) return { valide: false, motif: "IHDR_ABSENT_EN_PREMIER" };
    chunks++;
    if (chunks > 4096) return { valide: false, motif: "TROP_DE_CHUNKS" };
    p = finCrc;
  }
  if (!vuIHDR) return { valide: false, motif: "IHDR_ABSENT" };
  if (!vuIEND) return { valide: false, motif: "IEND_ABSENT" };
  return { valide: true, format: "png" };
}

/** L'image est-elle des octets qu'un moteur peut au moins tenter de lire ?
 *  Rend un MOTIF nomme (jamais un booleen muet) pour que la route puisse le
 *  renvoyer au client. Un PNG est verifie STRUCTURELLEMENT (CRC des chunks),
 *  pas seulement a sa signature : c'est le seul controle qui arrete le
 *  « libpng error » AVANT qu'il ne tue le processus. */
export function imageValide(tampon: Buffer | null | undefined): VerdictImage {
  if (!tampon || tampon.length === 0) return { valide: false, motif: "IMAGE_VIDE" };
  if (tampon.length < 12) return { valide: false, motif: "IMAGE_TROP_COURTE" };
  if (tampon.length > OCTETS_MAX_IMAGE) return { valide: false, motif: "IMAGE_TROP_GROSSE" };
  if (estWebp(tampon)) return { valide: true, format: "webp" };
  // PNG : la signature se verifie, PUIS la structure (CRC de chaque chunk).
  if (commencePar(tampon, SIGNATURES[0].octets)) return pngStructurellementValide(tampon);
  for (const s of SIGNATURES.slice(1)) {
    if (commencePar(tampon, s.octets)) return { valide: true, format: s.nom };
  }
  return { valide: false, motif: "FORMAT_NON_IMAGE" };
}
