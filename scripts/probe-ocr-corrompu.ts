// Sonde du chantier B (document de verification 1.0.6, 11/11) : une entree
// corrompue doit NOMMER une erreur, jamais tuer le processus.
//
// Le defaut mesure : Tesseract.recognize sur un PNG au CRC corrompu levait un
// « libpng error » depuis le worker EN process.nextTick, hors de portee d'un
// try/catch — le processus Node entier mourait (mesure du 11/11 : rc 77).
// La parade n'est pas d'attraper (impossible) mais de ne pas donner au moteur
// ce qu'il ne peut pas lire : on valide les octets AVANT (src/shared/ocr-image.ts).
//
// Le garde NOMME le crash au lieu de le subir : rc 77 = le processus serait
// mort, ce qui est le verdict ROUGE de cette sonde.
//
// Lancement : npx tsx scripts/probe-ocr-corrompu.ts   (rc = le verdict)
import fs from "fs";
import os from "os";
import path from "path";

let crash: string | null = null;
process.on("uncaughtException", (e) => {
  crash = `uncaughtException: ${String((e as Error)?.message ?? e)}`;
});
process.on("unhandledRejection", (e) => {
  crash = `unhandledRejection: ${String((e as Error)?.message ?? e)}`;
});

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Un PNG au CRC volontairement faux : l'entree exacte du document.
function pngCorrompu(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, truecolor
  const chunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    ihdr,
    Buffer.from([0xde, 0xad, 0xbe, 0xef]), // CRC faux
  ]);
  return Buffer.concat([sig, chunk]);
}

// Un PNG VRAIMENT valide (CRC corrects, calculés) : le contre-test qui prouve
// que le garde ne refuse pas les bonnes entrees. Fabrique par le moteur de
// rendu du produit (meme voie que le banc) : le PNG est reel, pas ecrit a la
// main.
async function pngValide(): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const toile = createCanvas(8, 8);
  const ctx = toile.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = "#000000";
  ctx.fillText("419,60", 0, 6);
  return toile.toBuffer("image/png");
}

async function principal(): Promise<number> {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "clausio-ocr-corrompu-"));
  const casse = path.join(dossier, "corrompu.png");
  fs.writeFileSync(casse, pngCorrompu());

  const echecs: string[] = [];
  const { imageValide } = await import(path.join(RACINE, "src", "shared", "ocr-image.ts"));

  // 1. La validation refuse ce qui n'est pas une image (un fichier texte).
  const texte = Buffer.from("ceci n'est pas une image" + "x".repeat(100));
  const vTexte = imageValide(texte);
  if (vTexte.valide) echecs.push("imageValide a accepte un fichier texte");
  else console.log(`VALIDATION : texte refuse (${vTexte.motif})`);

  // 2. La validation accepte une VRAIE image PNG (CRC corrects) : le garde ne
  //    doit jamais refuser une entree correcte (sinon il casse le produit).
  const bon = await pngValide();
  const vPng = imageValide(bon);
  if (!vPng.valide) echecs.push(`imageValide refuse un PNG correct (${vPng.motif})`);
  else console.log(`VALIDATION : PNG correct accepte (${vPng.format}, ${bon.length} o)`);

  // 3. LA VOIE DU PRODUIT : donner l'entree corrompue au moteur ne doit PAS
  //    tuer le processus. Sans la validation, ce point est celui qui tuait.
  //    On passe par le moteur tesseract, la voie mesuree du defaut.
  try {
    const { lireParCheminTesseract } = await import(
      path.join(RACINE, "src", "shared", "ocr-moteurs", "tesseract.ts")
    );
    await lireParCheminTesseract(casse);
    echecs.push("tesseract a rendu du texte sur une entree corrompue sans lever");
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.startsWith("EntreeOcrInvalide") || msg.startsWith("SortieOcrInattendue")) {
      console.log(`MOTEUR : entree corrompue rejetee proprement (${msg.slice(0, 60)})`);
    } else {
      echecs.push(`tesseract a leve une erreur NON NOMMEE : ${msg.slice(0, 80)}`);
    }
  }

  fs.rmSync(dossier, { recursive: true, force: true });

  // On laisse respirer un tick : c'est LA uncaughtException partirait ici.
  await new Promise((r) => setImmediate(r));

  if (crash) {
    console.log(`VERDICT : ROUGE — le processus a CRASHÉ (${crash})`);
    return 1;
  }
  if (echecs.length) {
    for (const e of echecs) console.log("  ECHEC", e);
    console.log("VERDICT : ROUGE");
    return 1;
  }
  console.log("VERDICT : VERT (aucun crash, erreur nommee, processus vivant)");
  return 0;
}

principal().then((rc) => {
  // Le crash est capte par le garde : rc 77 est reserve « le processus meurt ».
  if (crash) { console.log("VERDICT : ROUGE — processus tue"); process.exit(77); }
  process.exit(rc);
});
