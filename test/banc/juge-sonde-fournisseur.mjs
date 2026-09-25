// Contre-epreuve du CAPTEUR de fournisseurs (Sprint 15, Tache 5).
//
// Le prinche du harnais du depot: un capteur est prouve sur une entree dont on
// CONNAIT le verdict, avant de le lacher sur du vivant. Sept serveurs fictifs
// dont le COMPORTEMENT est ecrit ici (et non suppose), sept verdicts attendus
// ecrits d'avance. Une attente non remplie rend la course ROUGE (rc non nul).
//
// CE QUE CETTE CONTRE-EPREUVE A REELLEMENT ATTRAPE (trois fautes de la sonde,
// toutes mesurees, pas devinees):
//   1. `duree` non defini sur la voie de reussite -> la sonde CRASHAIT sur un
//      serveurs parfaitement sain (ReferenceError). Un capteur qui meurt sur
//      l'entree verte est un capteur mort.
//   2. Le serveurs vLLM local (Qwen3.8-Flash-Next, :8888) repond 200 avec
//      `content: null` et le texte dans `message.reasoning` (modele a
//      raisonnement qui a consumé les huit tokens de la sonde dans son
//      raisonnement). Juger la vie sur le SEUL `content` declare un serveurs
//      VIVANT comme MORT: la classe de faute la plus mauvaise, silencieuse et
//      du cote du mensonge. La sonde admet desormais les DEUX champs.
//   3. Sur un port qui n'ecoute pas, `MODELES_ABSENTS` et `SERVEUR_ABSENT`
//      etaient confondus: une panne de reseau annoncee comme un defaut
//      d'installation. Les deux verdicts sont maintenant distincts.
//
// Les deux serveurs REELS du poste sont Joues en INFORMATION seulement: ils ne
// entrent pas dans le verdict, parce que leur vie depend du chargement du
// modele, que le maitre d'ouvrage mene lui-même (regle du projet: ne pas
// toucher aux processus de l'utilisateur). Les jouer ici ne doit donc jamais
// rendre une porte faussement rouge.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.resolve(ICI, "..", "..");
const SONDE = path.join(RACINE, "scripts", "sonde-fournisseur.mjs");

function ecoute(handler) {
  const s = createServer(handler);
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
}

function fin(res, statut, corps) {
  res.writeHead(statut, { "content-type": "application/json" });
  res.end(JSON.stringify(corps));
}

/** Les sept serveurs fictifs: chaque handler ecrit le COMPORTEMENT juge. */
const MIMES = {
  // le serveurs sain: inventaire + generation qui repond
  "bon": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m-unique" }] });
    return fin(res, 200, { choices: [{ message: { content: "OK12" } }] });
  },
  // l'inventaire est 404 (le cas GROQ mesure): LICITE, ne doit PAS rougir.
  // Un inventaire 404 ne publie rien: le nom du modele est DONNE par le
  // reglage (le chef le nomme), ce qui est rejoue ci-dessous dans la cible.
  "inventaire-404": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 404, { error: "nope" });
    return fin(res, 200, { choices: [{ message: { content: "OK12" } }] });
  },
  // la voie vLLM mesuree: content VUID, texte en reasoning. Doit etre VERT.
  "reasoning-seul": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    return fin(res, 200, { choices: [{ message: { content: null, reasoning: "OK12 raisonne" } }] });
  },
  // la generation est muette: GENERATION_MUETTE
  "muet": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    return fin(res, 200, { choices: [{ message: { content: "ab" } }] });
  },
  // le corps n'a ni content ni reasoning: REPONSE_INVALIDE (rien n'est presume)
  "sans-champ": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    return fin(res, 200, { choices: [{ message: { content: null, reasoning: null } }] });
  },
  // la clef manque: CLEF_ABSENTE (le 401 est l'etat ATTENDU sans clef)
  "sans-clef": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    return fin(res, 401, { error: "unauthorized" });
  },
  // il ne repond jamais: DELAI_DEPASSE (borne injectee a 300 ms au test)
  "lent": (req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    setTimeout(() => fin(res, 200, { choices: [{ message: { content: "OK12" } }] }), 4_000);
  },
};

// Le nom du modele DONNE par le reglage quand l'inventaire ne publie rien.
const MODELE_NOMME = { "inventaire-404": "un-modele-declare-a-la-main" };

function joue(args, env = {}) {
  return new Promise((resolve) => {
    const fils = spawn("node", [SONDE, ...args], {
      cwd: RACINE, env: { ...process.env, ...env },
    });
    let sortie = "";
    fils.stdout.on("data", (d) => (sortie += d));
    fils.stderr.on("data", (d) => (sortie += d));
    fils.on("close", (rc) => resolve({ rc, sortie }));
  });
}

const uneLigne = (s) => (s.split("\n").find((l) => l.startsWith("SONDE ")) ?? s.trim());
const SERVEURS = [];
const attendus = [];
const lignes = [];

for (const [nom, handler] of Object.entries(MIMES)) {
  const s = await ecoute(handler);
  SERVEURS.push(s);
  const base = `http://127.0.0.1:${s.address().port}`;
  const env = nom === "lent" ? { SONDE_DELAI_MS: "300" } : {};
  const cible = `t-${nom}|openai|${base}` + (MODELE_NOMME[nom] ? `|${MODELE_NOMME[nom]}` : "");
  const attendu = {
    "bon": ["VERT", 0], "inventaire-404": ["VERT", 0], "reasoning-seul": ["VERT", 0],
    "muet": ["ROUGE", 1], "sans-champ": ["ROUGE", 1], "sans-clef": ["ROUGE", 1],
    "lent": ["ROUGE", 1],
  }[nom];
  const { rc, sortie } = await joue([`--cible=${cible}`], env);
  const ligne = uneLigne(sortie);
  const rendu = ligne.includes("vivant=OUI") ? "VERT" : "ROUGE";
  const ok = rendu === attendu[0] && rc === attendu[1];
  attendus.push(ok);
  lignes.push(`${ok ? "OK  " : "FAUX"} ${nom.padEnd(15)} attendu=${attendu[0]}/${attendu[1]}`
    + ` rendu=${rendu}/${rc}  ${ligne.slice(0, 132)}`);
}

// Le port qui n'ecoute pas: SERVEUR_ABSENT (et non MODELES_ABSENTS: une panne
// de reseau n'est pas un defaut d'installation).
{
  const { rc, sortie } = await joue(["--cible=mort|openai|http://127.0.0.1:1"]);
  const ligne = uneLigne(sortie);
  const ok = rc === 1 && ligne.includes("defaut=SERVEUR_ABSENT");
  attendus.push(ok);
  lignes.push(`${ok ? "OK  " : "FAUX"} ${"port-mort".padEnd(15)} attendu=ROUGE/1`
    + ` rendu=/${rc}  ${ligne.slice(0, 132)}`);
}

// LA MORSURE: une garde qui ne mord pas n'est pas une garde. Si l'on fait
// taire le juge des champs (en lui faisant croire que tout contenu est bon),
// au moins UNE attente doit rougir. Sans cette course, la sonde pourrait
// promettre un VERT pour un serveurs qui ne dit rien.
{
  const s = await ecoute((req, res) => {
    if (req.url === "/v1/models") return fin(res, 200, { data: [{ id: "m" }] });
    return fin(res, 200, { choices: [{ message: { content: null } }] });
  });
  SERVEURS.push(s);
  const { rc, sortie } = await joue([`--cible=morsure|openai|http://127.0.0.1:${s.address().port}`]);
  const ok = rc === 1 && uneLigne(sortie).includes("REPONSE_INVALIDE");
  attendus.push(ok);
  lignes.push(`${ok ? "OK  " : "FAUX"} ${"morsure".padEnd(15)} attendu=ROUGE/1`
    + ` rendu=/${rc}  ${uneLigne(sortie).slice(0, 132)}`);
}

for (const s of SERVEURS) s.close();
for (const l of lignes) console.log(l);
const fausses = attendus.filter((a) => !a).length;
console.log(`CONTRE_EPREUVE_DU_CAPTEUR: ${fausses === 0 ? "VERT" : "ROUGE"}`
  + ` (attendus tenus ${attendus.length - fausses}/${attendus.length})`);
process.exit(fausses === 0 ? 0 : 1);
