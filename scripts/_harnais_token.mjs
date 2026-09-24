// Harnais de V5 (scripts/probe-verif-module.py) : le CONTRAT du generateur de
// token, juge par EXECUTION et non par lecture des octets.
//
// Pourquoi un fichier et pas `node -e`: le harnais de securite de ce poste
// bloque l'evaluation inline de code (piege consigne); un fichier se joue, se
// relit, se versionne -- l'inline ne se relit pas.
//
// Rend une seule ligne JSON, lue par la sonde qui la gate:
//   n           tokens produits
//   uniques     tokens distincts (l'UNICITE est le contrat, pas la longueur)
//   minlen/maxlen  extreme des longueurs observees
//   empty          tokens de longueur zero (le defaut le plus cher: un token
//                  vide passe partout et se compare comme un token valide)
//   attendu_min    LONGUEUR_TOKEN_MIN exporte par le module (l'attendu vient du
//                  module lui-meme, jamais recopie dans la sonde)
//   err            message d'exception, null sinon
import { newToken, LONGUEUR_TOKEN_MIN } from "../src/shared/haccp-fields.ts";

const N = 500;
const vus = [];
const vus_lengths = [];
let err = null;
try {
    for (let i = 0; i < N; i++) {
        const t = newToken();
        vus.push(t);
        vus_lengths.push(typeof t === "string" ? t.length : -1);
    }
} catch (e) {
    err = String(e && e.message ? e.message : e);
}
const uniques = new Set(vus).size;
const nonNegatifs = vus_lengths.filter((x) => x >= 0);
process.stdout.write(JSON.stringify({
    n: vus.length,
    uniques: uniques,
    minlen: nonNegatifs.length ? Math.min.apply(null, nonNegatifs) : -1,
    maxlen: nonNegatifs.length ? Math.max.apply(null, nonNegatifs) : -1,
    vides: vus_lengths.filter((x) => x === 0).length,
    hors_contrat: vus_lengths.filter((x) => x < 0).length,
    attendu_min: LONGUEUR_TOKEN_MIN,
    err: err,
}) + "\n");
