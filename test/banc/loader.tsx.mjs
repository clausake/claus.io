// Le loader TSX du banc : ce fichier existe pour que node puisse importer le
// TS source directement (sans tsc de sortie), pour sondes .mjs du banc.
//
// Sondes 7: les LIGNES reelles rendues par la porte d'entree OCR sur la piece
// du banc (pas une supposition de ma part, la sortie du moteur lue par la machine).
//
// Le juge par LIGNES vs le juge fondu: la piece d'essai disait 7/7 au spike
// (le montant avec son espace de milliers nage dans le texte fondu), mais le
// juge par lignes rendoit 1/7 — la faute est dans le JUGE, pas dans the moteur:
// le SIRET passe sur deux lignes, l'attendu porte des espaces que le moteur
// rend comme `41285733900 066`... On mesure avant de corriger.
//
// joué: node --import tsx/esm test/banc/sonde-7-lignes.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = path.resolve(ICI, "..", "..", "test", "banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const ATTENDUS = path.join BANC, "facture-synthetique.attendus.json";