// Le juge de la detection des serveurs locaux (Sprint 15, Tache 8) — la voie
// REELLE : de vrais serveurs `node:http`, le VRAI fetch, le code du detecteur
// tel quel. Les unitaires jugent la logique ; ici se juge la VOIE (fetch reel,
// AbortSignal.timeout, HTTP reel).
//
// Les ports d'usage (11434/8080/1234) NE SONT PAS Joues : une porte qui
// depend de ce qu'un humain a lance sur son poste est un outil, pas une porte
// (la regle du jumeau deterministe). Les serveurs fictifs ecoutent sur des
// ports ephemeres choisis par l'OS et le fetch injecte fait le lien URL d'usage
// -> stub. Deterministe sur tout poste, a toute heure.
import http from "node:http";

const mod = await import("../../src/shared/fournisseur/serveurs-locaux.js");
const { detecterServeursLocaux, etatMoteurLocal, MESSAGE_AUCUN_MOTEUR, PORTS_USAGE } = mod;

let ECHECS = 0;
function verifier(nom, ok, detail = "") {
  if (ok) { console.log("  OK  " + nom); return; }
  ECHECS++;
  console.log("  FAUTE  " + nom + (detail ? "  (" + detail + ")" : ""));
}

// Un stub dont le comportement est ecrit d'avance. "MOURIR" = un port
// fraichement ferme : le vrai fetch y recoit ECONNREFUSED, l'etat mesure.
function serveurStub(rep) {
  return new Promise((resolve, reject) => {
    if (rep === "MOURIR") {
      const s = http.createServer();
      s.listen(0, "127.0.0.1", () => {
        const port = s.address().port;
        s.close(() => resolve({ port, fermer: async () => {} }));
      });
      s.on("error", reject);
      return;
    }
    const s = http.createServer((req, res) => {
      if (!req.url.endsWith("/v1/models")) { res.writeHead(404); res.end(); return; }
      res.writeHead(rep.status, { "content-type": "application/json" });
      res.end(typeof rep.corps === "string" ? rep.corps : JSON.stringify(rep.corps));
    });
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      resolve({ port, fermer: () => new Promise((r) => s.close(() => r())) });
    });
    s.on("error", reject);
  });
}

// config : { "11434": {status, corps} | "MOURIR", ... }
// Le fetch injecte traduit l'URL d'usage vers le stub ephemere. Un port d'usage
// absent de la config refuse (ECONNREFUSED sur un port que l'OS n'a jamais ecoute).
async function jouer(config, attendant) {
  const map = {};
  const aFermer = [];
  for (const [usage, rep] of Object.entries(config)) {
    const stub = await serveurStub(rep);
    map[usage] = stub.port;
    aFermer.push(stub);
  }
  const fetchStub = (url, delaiMs) => {
    const m = url.match(/127\.0\.0\.1:(\d+)\/v1\/models$/);
    const usage = m ? m[1] : null;
    const port = usage !== null ? map[usage] : undefined;
    return fetch(`http://127.0.0.1:${port ?? 1}/v1/models`,
                 { signal: AbortSignal.timeout(delaiMs) });
  };
  try {
    const serveurs = await detecterServeursLocaux(fetchStub);
    const etat = await etatMoteurLocal(fetchStub);
    return { serveurs, etat };
  } finally {
    for (const s of aFermer) await s.fermer();
  }
}

// Le port 1 libre garanti : le port 1 sous un utilisateur non-root est refuse.
const MOURIR = "MOURIR";
const OLLAMA = { status: 200, corps: { data: [{ id: "qwen3:8b" }] } };
const CPP8080 = { status: 200, corps: { models: ["mistral-7b"] } };
const CPP1234 = { status: 200, corps: { data: [] } };

verifier("les ports d'usage sont ceux du contrat",
  JSON.stringify(PORTS_USAGE.map((p) => p.port)) === JSON.stringify([11434, 8080, 1234]));

const c1 = await jouer({ "11434": OLLAMA, "8080": MOURIR, "1234": MOURIR });
verifier("ollama seul : 1 trouve, modele rendu, message nul",
  c1.serveurs.length === 1 && c1.serveurs[0].moteur === "ollama"
  && c1.serveurs[0].modeles[0]?.nom === "qwen3:8b" && c1.etat.message === null);

const c2 = await jouer({ "11434": OLLAMA, "8080": CPP8080, "1234": CPP1234 });
verifier("les trois trouves, dans l'ordre des ports d'usage",
  JSON.stringify(c2.serveurs.map((s) => s.port)) === JSON.stringify([11434, 8080, 1234]));

const c3 = await jouer({ "11434": MOURIR, "8080": { status: 404, corps: {} }, "1234": MOURIR });
verifier("le 404 est un serveur VIVANT a inventaire vide",
  c3.serveurs.length === 1 && c3.serveurs[0].moteur === "llamacpp"
  && c3.serveurs[0].modeles.length === 0);

const c4 = await jouer({ "11434": MOURIR, "8080": MOURIR, "1234": MOURIR });
verifier("rien ne repond : AUCUN_MOTEUR_TROUVE + les trois voies nommees",
  c4.serveurs.length === 0 && c4.etat.message === MESSAGE_AUCUN_MOTEUR
  && MESSAGE_AUCUN_MOTEUR.includes("llama.cpp") && MESSAGE_AUCUN_MOTEUR.includes("Ollama")
  && MESSAGE_AUCUN_MOTEUR.includes("ligne") && MESSAGE_AUCUN_MOTEUR.includes("11434"));

// LA MORSURE : 11434 mute en 500. Si le detecteur compte les muets, ce cas
// rend 3 et rougit ; s'il est vrai, il rend 2 et le muet n'apparait pas.
const c5 = await jouer({ "11434": { status: 500, corps: {} }, "8080": CPP8080, "1234": CPP1234 });
verifier("morsure : le muet 500 n'est PAS trouve, les vivants restent",
  c5.serveurs.length === 2 && !c5.serveurs.some((s) => s.port === 11434));

// La morsure du Delai : un serveur qui NE REPOND JAMAIS (corps qui pend) doit
// mourir au delai, pas pendre le produit. On triche le stub : reponse jamais
// terminee + delai rabaisse par l'appel direct.
const lent = await new Promise((resolve, reject) => {
  const s = http.createServer(() => { /* jamais res.end() */ });
  s.listen(0, "127.0.0.1", () => resolve(s));
  s.on("error", reject);
});
{
  const portLent = lent.address().port;
  const fetchLent = (url) => fetch(`http://127.0.0.1:${portLent}/v1/models`,
                                   { signal: AbortSignal.timeout(300) });
  const t0 = Date.now();
  let aMeurt = false;
  try { await fetchLent(""); } catch { aMeurt = true; }
  const duree = Date.now() - t0;
  await new Promise((r) => lent.close(() => r()));
  verifier("morsure delai : un serveur qui pend meurt au delai (<2 s)",
    aMeurt && duree < 2000, "duree=" + duree + "ms");
}

console.log(ECHECS === 0 ? "\nJUGE SERVEURS LOCAUX: tout vert"
                         : "\nJUGE SERVEURS LOCAUX: " + ECHECS + " FAUTE(S)");
process.exit(ECHECS === 0 ? 0 : 1);
