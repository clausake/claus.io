#!/usr/bin/env node
/**
 * Outil de signature de licences claus.io
 * ------------------------------------------------------------
 * Génère une clé d'unlock VALIDE pour un machineId donné, en utilisant
 * la CLÉ PRIVÉE RSA (qui reste chez l'éditeur, jamais dans le binaire).
 *
 * Le serveur (server.ts) ne contient que la CLÉ PUBLIQUE et vérifie la
 * signature avec crypto.createVerify("RSA-SHA256").
 *
 * Usage :
 *   node scripts/sign-license.cjs <machineId> [cheminCléPrivée.pem]
 *
 * Exemple :
 *   node scripts/sign-license.cjs "A1B2C3D4" /chemin/vers/license_private.pem
 *
 * Sortie : une clé d'unlock (base64) prête à être collée dans l'app
 * (ou envoyée au client via ton backend de licences).
 *
 * SÉCURITÉ :
 *  - La clé privée ne doit JAMAIS être commitée, copiée dans le binaire,
 *    ou partagée. Garde-la dans un coffre (vault) ou sur ton serveur de
 *    signature uniquement.
 *  - La clé publique est dans server.ts (elle peut être publique, c'est
 *    voulu : elle sert seulement à VÉRIFIER, pas à signer).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`\n❌ ERREUR : ${msg}\n`);
  process.exit(1);
}

const machineId = process.argv[2];
const keyPath =
  process.argv[3] ||
  path.join(__dirname, "..", "license_private.pem");

if (!machineId) {
  fail(
    "machineId manquant.\n" +
      "Usage : node scripts/sign-license.cjs <machineId> [cheminCléPrivée.pem]\n" +
      "Le machineId est renvoyé par GET /api/trial-status (champ machineId)."
  );
}

if (!fs.existsSync(keyPath)) {
  fail(
    `Clé privée introuvable : ${keyPath}\n` +
      "Génère une paire avec :\n" +
      "  openssl genrsa -out license_private.pem 2048\n" +
      "  openssl rsa -in license_private.pem -pubout -out license_public.pem\n" +
      "Puis mets la publique dans LICENSE_PUBLIC_KEY_PEM (server.ts)."
  );
}

let privateKey;
try {
  privateKey = fs.readFileSync(keyPath, "utf8");
} catch (e) {
  fail(`Lecture de la clé privée impossible : ${e.message}`);
}

// Le machineId est signé en RSA-SHA256 (la moitié privée de la paire).
const signer = crypto.createSign("RSA-SHA256");
signer.update(machineId);
const signature = signer.sign(privateKey, "base64");

// On formatte la clé en groupes de 4 séparés par "-" (cosmétique).
// ATTENTION : le padding "=" du base64 ne doit pas être chunké (ça casse le
// decode). On sépare donc le corps du padding, on chunk le corps, puis on
// ré-attache le padding à la fin. Le serveur (verifyLicenseKey) retire les
// tirets et garde [A-Za-z0-9+/=] → il retrouve le base64 d'origine.
const b64Body = signature.replace(/=+$/, "");
const b64Pad = signature.slice(b64Body.length);
const prettyKey = b64Body
  .match(/.{1,4}/g)
  .join("-") + b64Pad
  .toUpperCase();

console.log(`\n✅ Licence générée pour machineId : ${machineId}`);
console.log(`   Clé d'unlock (à coller dans l'app ou envoyer au client) :`);
console.log(`\n   ${prettyKey}\n`);
console.log(
  "   ⚠️  Garde ce fichier / cette sortie en lieu sûr : la clé privée est le\n" +
    "   secret de signature. Ne la commitez jamais."
);
