// L'outil a main de l'epreuve REELLE (Sprint 15, Tache 10).
//
// La porte `verify:assistant` joue le lecteur FABRIQUE (deterministe, hors
// infrastructure). Cet outil, lui, joue le VRAI moteur Paddle sur la piece du
// banc — c'est lui qui repond a « l'installe que je vais livrer peut-il faire
// l'epreuve sans reseau ? ». Il ne rend pas un verdict de porte : son resultat
// depend des poids (12,8 Mo, hors git) et du poste. Il nomme son etat.
//
// joue : npx tsx test/banc/outil-epreuve-reelle.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..");

const A = await import(path.join(RACINE, "src/services/assistant.ts"));
const v = await A.jouerEpreuve();
console.log("EPREUVE_REELLE:", JSON.stringify(v));
console.log(v.reussi
  ? `ETAT: l'epreuve passe sur ce poste (${v.score}) — la voie OCR est vivante.`
  : `ETAT: l'epreuve NE passe pas sur ce poste (${v.defaut ?? v.score + " manquants=" + v.manquants.join(",")}) —`
    + " verifier les poids OCR (npm run verify:ocr-modeles) et l'etat du moteur.");
// L'outil ne rougit jamais lui-meme : c'est un ETAT du poste, pas une porte.
process.exit(0);
