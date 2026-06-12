import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import path from "path";
import mime from "mime-types";

// Configuration Cloudflare R2
// Remplacez ces valeurs par celles de votre compte Cloudflare
const ACCOUNT_ID = "905fd9074189e4d8e084c67304eb616c"; // Trouvé dans votre URL Cloudflare
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "VOTRE_ACCESS_KEY_ID";
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "VOTRE_SECRET_ACCESS_KEY";
const BUCKET_NAME = "claus"; // Le nom de votre bucket

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function uploadFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Fichier introuvable: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  const contentType = mime.lookup(filePath) || "application/octet-stream";
  const fileSizeInfo = fs.statSync(filePath);

  console.log(`🚀 Début de l'envoi vers R2 : ${fileName} (${(fileSizeInfo.size / (1024 * 1024)).toFixed(2)} MB)`);

  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: contentType,
      },
      tags: [], // Optional tags
      queueSize: 4, // Upload 4 parts simultaneously
      partSize: 5 * 1024 * 1024, // 5 MB parts
    });

    upload.on("httpUploadProgress", (progress) => {
      if (progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        process.stdout.write(`\r⏳ Progression... ${percentage}%`);
      } else {
        process.stdout.write(`\r⏳ Envoi en cours... ${progress.loaded} bytes`);
      }
    });

    await upload.done();
    console.log(`\n✅ Succès ! Le fichier ${fileName} a été uploadé avec succès dans le bucket "${BUCKET_NAME}".`);
  } catch (error) {
    console.error(`\n❌ Erreur lors de l'upload :`, error.message);
  }
}

// Récupérer le fichier depuis les arguments
const fileToUpload = process.argv[2];

if (!fileToUpload) {
  console.log("⚠️ Utilisation: node upload-r2.mjs <chemin_vers_le_fichier>");
  console.log("Exemple: node upload-r2.mjs ./CLAUS.IO-1.0.0-arm64.dmg");
  process.exit(1);
}

if (ACCESS_KEY_ID === "VOTRE_ACCESS_KEY_ID") {
  console.log("\n⚠️ ATTENTION : Vous devez configurer vos clés API R2 !");
  console.log("Vous pouvez créer un Token S3 dans Cloudflare > R2 > Manage R2 API Tokens");
  console.log("Ensuite, vous pouvez soit modifier ce script, soit utiliser des variables d'environnement :");
  console.log("R2_ACCESS_KEY_ID=votre_cle R2_SECRET_ACCESS_KEY=votre_secret node upload-r2.mjs <fichier>");
  process.exit(1);
}

uploadFile(fileToUpload);
