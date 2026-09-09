// Verification terrain de la repartition des chunks (qui est dans le bundle
// D'ENTREE, ce qui se telecharge avant le premier rendu).
//
// Pourquoi ce script : le poids du chunk d'entree ne se voit pas dans un build
// vert. Rollup peut y faire remonter un vendor lourd sans casser une seule
// ligne de l'app, et la seule consequence est un demarrage plus lent sur les
// tablettes du comptoir. Deux cas concrets deja rencontres ici :
//   - un `manualChunks: { "vendor-motion": ["motion/react", ...] }` avait l'air
//     d'une bonne ide et ASPIRAIT les features de Motion (que LazyMotion est
//     cense charger a la demande) dans le lot statiquement charge : le gain
//     etait reduit a peines rien ;
//   - la migration `motion` -> `m` (meme poids de code, sans les features) n'a
//     de sens QUE si le chunk des features reste asynchrone.
//
// Le contrat est donc verrouille ici, en nombres, et non dans une conversation.
//
// Usage: node scripts/verify-bundle.mjs      (presuppose `npm run build` fait)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = join(root, "dist");
const assets = join(dist, "assets");

if (!existsSync(join(dist, "index.html"))) {
  console.log("ECHEC  dist/ absent : lancer `npm run build` avant ce script");
  process.exit(1);
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

const html = readFileSync(join(dist, "index.html"), "utf8");
// Le chargement initial = ce que le HTML declare. Rien d'autre ne compte pour le
// temps d'affichage; compter les chunks asynchrones dans un total « de bundle »
// donnerait un chiffre qui n'a pas de sens pour l'utilisateur.
const statiques = [...new Set([...html.matchAll(/assets\/([\w.-]+\.js)/g)].map((m) => m[1]))];
const taille = (nom) => (existsSync(join(assets, nom)) ? statSync(join(assets, nom)).size : 0);
const entree = statiques.filter((n) => /^index-/.test(n));
const totalInitial = statiques.reduce((a, n) => a + taille(n), 0);

check("(a) un chunk d'entree index-* est declare", entree.length === 1, entree.join(","));

// Plafond volontairement fige : 5 % au-dessus de la mesure de reference
// (591 112 octets, harnais avant/apres de la migration vers `m`). Il ne bouge que
// si un vendor lourd y remonte VOLONTAIREMENT, et alors on le relve en
// connaissance de cause apres avoir relu la liste des gros modules
// (`node scripts/analyze-bundle.mjs index`).
const PLAFOND_ENTREE = 620_000;
const tailleEntree = entree.reduce((a, n) => a + taille(n), 0);
check(`(b) chunk d'entree sous le plafond de ${PLAFOND_ENTREE} octets`,
  tailleEntree > 0 && tailleEntree <= PLAFOND_ENTREE,
  `index=${tailleEntree} octets, total initial=${totalInitial}`);

// Le chunk des features Motion doit EXISTER et ne pas etre dans le HTML : c'est
// la whole raison d'etre de `m` + `LazyMotion`.
const chunkFeatures = readdirSync(assets).filter((f) => /^motion-features-[\w-]+\.js$/.test(f));
check("(c) le chunk des features Motion existe (separation effective)",
  chunkFeatures.length === 1, chunkFeatures.join(",") || "introuvable");
check("(d) les features Motion sont chargees a la demande (pas declarees dans index.html)",
  chunkFeatures.length === 1 && !statiques.includes(chunkFeatures[0]),
  chunkFeatures[0] ? (statiques.includes(chunkFeatures[0]) ? "present dans le lot initial !" : "absent du lot initial") : "-");

// Le chunk doit quand meme etre atteignable : s'il n'est reference par AUCUN
// import dynamique, les animations ne se joueraient jamais (defaut silencieux).
if (chunkFeatures.length === 1) {
  const src = readdirSync(assets)
    .filter((f) => /^index-/.test(f))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("");
  check("(e) le chunk des features est bien reference par un import dynamique",
    src.includes(chunkFeatures[0]), `reference dans le chunk d'entree`);
}

// Le contrat de fond : plus aucun composant ne doit importer la version lourde
// (`motion`) directement depuis src/ — un seul import oublie annule le gain pour
// toute l'app, sans rien casser de visible.
import { execFileSync } from "node:child_process";
let lourds = "";
try {
  lourds = execFileSync("grep", ["-rnoE", "--include=*.tsx", "--include=*.ts",
    "\\bmotion\\s*,?\\s*\\}?\\s*from\\s*[\"']motion/react[\"']", join(root, "src")],
    { encoding: "utf8" });
} catch { lourds = ""; }
check("(f) aucun composant n'importe la variante lourde de la de Motion",
  lourds.trim() === "", lourds.split("\n").filter(Boolean).slice(0, 3).join(" | ") || "aucun");

console.log(fail === 0 ? "\nVERIF BUNDLE: TOUT PASS" : "\nVERIF BUNDLE: " + fail + " ECHEC(S)");
process.exit(fail === 0 ? 0 : 1);
