// Genere la page interactive `docs/architecture.html` depuis la source de verite
// `docs/architecture.json` et le modele `docs/architecture.template.html`.
//
// Pourquoi un generateur : la page doit etre UN SEUL fichier HTML autonome
// (elle tourne hors ligne, comme claus.io), mais le JSON doit rester la source
// de verite pour le prochain agent. Deux copies ecrites a la main finissent par
// diverger ; ici une seule commande les synchronise.
//
//   node scripts/gen-architecture.mjs          # ecrit docs/architecture.html
//   node scripts/gen-architecture.mjs --check  # verifie qu'il est a jour (rc=1 si non)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = path.join(RACINE, "docs", "architecture.json");
const TEMPLATE_PATH = path.join(RACINE, "docs", "architecture.template.html");
const HTML_PATH = path.join(RACINE, "docs", "architecture.html");
const MARQUEUR = "__ARCH_DATA__";

const json = fs.readFileSync(JSON_PATH, "utf8");
const donnees = JSON.parse(json);
const modele = fs.readFileSync(TEMPLATE_PATH, "utf8");
if (!modele.includes(MARQUEUR)) {
  console.error("GENERATION IMPOSSIBLE: marqueur absent du modele");
  process.exit(2);
}
// Echapper '<' : un contenu HTML dans le JSON ne doit jamais fermer le <script>.
const embarque = json.replace(/</g, "\\u003c").trim();
const html = modele.replace(MARQUEUR, embarque);

if (process.argv.includes("--check")) {
  const surDisque = fs.existsSync(HTML_PATH) ? fs.readFileSync(HTML_PATH, "utf8") : "";
  if (surDisque !== html) {
    console.error("ARCHITECTURE HTML PERIME : relancer node scripts/gen-architecture.mjs");
    process.exit(1);
  }
  console.log("ARCHITECTURE HTML A JOUR");
  process.exit(0);
}

fs.writeFileSync(HTML_PATH, html);
console.log(
  `ARCHITECTURE HTML ECRIT ${path.relative(RACINE, HTML_PATH)} ` +
  `(${html.length} octets, ${donnees.nodes.length} noeuds, ${donnees.edges.length} liens, ${donnees.flows.length} flux)`
);
