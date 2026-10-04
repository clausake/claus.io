// Le contrat du compte-rendu de pret, juge contre le VRAI serveur.
//
// Pourquoi ce fichier existe alors que `ready-parity.test.ts` existe deja.
// Ce dernier juge le PARSEUR avec un faux objet `{port:3001,...}` qu'il ecrit
// lui-même : il prouve done que le lict est coherent avec une forme que LUI a
// choisie. Il ne prouve en rien que LE SERVEUR emet cette forme-la. C'est
// exactement la classe de faute deja consignée dans PHASES.md : un PASS juge sur
// une instance ou une donnee que le harnais a fabrique lui-même, vert quoi qu'il
// arrive (`typeof champ === 'number'` laisse passer un champ fige a 0).
//
// Ici les DEUX bouts sont reels :
//   - `src/services/ready.ts` est lance par le VRAI `server.ts` (spawn tsx) ;
//   - `electron/ready-parity.cjs` est le LECTEUR reellement utilise par
//     `electron/main.cjs` pour decider de l'URL de la fenetre.
// Les deux se rencontrent sur un serveur qui tient reellement un port.
//
// Les regles jugees, et pourquoi chacune est bloquante :
//   P1 la ligne COOKDRIVE_READY parait sur stdout du serveur  (sinon Electron
//      en dev ne recoit jamais le signal et la fenetre ne s'ouvre pas)
//   P2 le LECTEUR reel parse cette ligne et rend le port REEL  (la ligne sans le
//      parseur = un fichier mort ; le parseur sans la ligne = un harnais creux)
//   P3 le port de l'annonce est CELUI de l'objet server (listen) et non la
//      variable PORT de la fermeture recursive : les deux divergent des qu'un
//      cran est cede, et c'est justement ce qui doit etre rapporte
//   P4 le fichier de compte-rendu (voie production, ou le serveur tourne DEDANS
//      du process Electron et n'a aucun stdout a offrir) est un JSON LISIBLE par
//      le lecteur, et sa creation est ATOMIQUE : le pere le relit des qu'il
//      apparait, un JSON partiel se lirait comme un defaut du serveur
//   P5 `glisse` dit la verite contre le port demande
//   P6 l'en-tete d'identite porte le MÊME jeton que l'annonce : le controle
//      d'identite d'Electron et l'annonce doivent venir de la même source, sinon
//      la fenetre se ouvre sur un port que sa propre garde refuse
//
// Lancement : node scripts/probe-ready-parity.mjs   (le code de sortie EST le verdict)
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-ready-parity");
const require = createRequire(import.meta.url);
const R = require("../electron/ready-parity.cjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "OK  " : "FAUX"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

const portLibre = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

const TOKEN = "parity-" + process.pid;

async function lancerServeur({ port, readyFile }) {
  const data = join(OUT, "udata");
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  const env = {
    ...process.env,
    USER_DATA_PATH: data,
    // Identite desactivee : sonde de METIER (l'identite a sa porte verify:auth).
    COOKDRIVE_AUTH_OFF: "1",
    NODE_ENV: "test",
    PORT: String(port),
    COOKDRIVE_INSTANCE_TOKEN: TOKEN,
  };
  if (readyFile) env.COOKDRIVE_READY_FILE = readyFile;
  if (port === undefined) delete env.PORT; // sinon un PORT herite du shell dict un port
  const log = { buf: "" };
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (log.buf += d.toString()));
  child.stderr.on("data", (d) => (log.buf += d.toString()));
  return { child, log };
}

const tuer = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.on("exit", () => resolve());
    child.kill("SIGKILL");
  });

// La porte d'entree du LECTEUR cote Electron, pas une copie de sa logique.
function attendreLigne(log, maxMs = 60_000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function tour() {
      const info = R.lireLigneDePret(log.buf);
      if (info) return resolve(info);
      if (Date.now() - t0 >= maxMs) return resolve(null);
      setTimeout(tour, 200);
    })();
  });
}

async function main() {
  const port = await portLibre();
  const readyFile = join(OUT, "ready.json");
  rmSync(readyFile, { force: true });

  const { child, log } = await lancerServeur({ port, readyFile });
  let annonce = null;
  let fichier = null;
  try {
    // P1/P2 : l'annonce du serveur, relue par le parseur de l'Electron.
    annonce = await attendreLigne(log);
    check("P1 le serveur emet une ligne COOKDRIVE_READY parseable", !!annonce, log.buf.split("\n").find((l) => l.includes("COOKDRIVE_READY")) || "<aucune ligne>");

    // P4 : la voie production (compte-rendu fichier), lue par le lecteur reel.
    fichier = await R.attendreCompteRendu(readyFile, { deadlineMs: 8_000, intervalMs: 100 });

    const base = `http://127.0.0.1:${port}`;
    let sante = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      try {
        const r = await fetch(`${base}/api/settings`);
        if (r.ok) { sante = r; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    check("P2 le port annonce est le port IMPOSE et ouvert", !!annonce && annonce.port === port, `annonce=${annonce?.port} attendu=${port}`);
    check("P3 l'annonce porte le bon jeton d'instance", annonce?.instance === TOKEN, `annonce=${annonce?.instance}`);
    check("P3-b le l'annonce dit qu'elle n'a pas glisse (port impose obtenu)", annonce?.glisse === false, `glisse=${annonce?.glisse}`);
    check("P4 le compte-rendu fichier existe et est parse par le lecteur ELECTRON", !!fichier && fichier.port === port, JSON.stringify(fichier));
    check("P4-b fichier et stdout sont d'ACCORD (deux canaux, une source)", !!annonce && !!fichier && annonce.port === fichier.port && annonce.instance === fichier.instance, `stdout=${annonce?.port}/${annonce?.instance} fichier=${fichier?.port}/${fichier?.instance}`);
    check("P4-c pas de residu partiel sur le chemin du compte-rendu", !existsSync(readyFile + ".tmp-" + child.pid), "tmp-" + child.pid);
    check("P6 le controle d'identite de l'Electron passe sur le serveur REEL", (await R.verifierIdentite(base, TOKEN, { timeoutMs: 4000 })) === true, `token=${TOKEN}`);
    check("P6-b et ROUGIT contre un faux jeton (le garde mord)", (await R.verifierIdentite(base, "pas-le-notre", { timeoutMs: 4000 })) === false);
    check("P5 urlDeLaFenetre donne l'URL réellement ouverte", R.urlDeLaFenetre(annonce) === base, R.urlDeLaFenetre(annonce));
    check("G l'API repond sur ce port (le serveur est vivant, pas un fantome)", sante !== null, `status=${sante?.status}`);
    check("G-b le serveur n'a PAS glisse : le port impose est un contrat", log.buf.includes(`Server running on http://127.0.0.1:${port}`), log.buf.split("\n").find((l) => l.includes("Server running")) || "<aucun log>");
  } finally {
    await tuer(child);
  }

  // P3 en situation de GLISSEMENT : le defaut 3000 est tenu par un TIERS, le
  // serveur (qui n'a rien demande) cede un cran. C'est LE cas que l'annonce
  // doit attraper, et le seul ou la variable PORT et le port reel different.
  //
  // ⚠ On ne peut pas exiger de monter nous-mêmes l'imposteur : sur ce poste 3000
  // est DEJA tenu par une autre application (promo_resto), donc notre `listen`
  // rend EADDRINUSE. Ce n'est pas un defaut du produit, c'est la PRECONDITION du
  // test, deja remplie par le hasard du poste. Les deux cas sont donc egaux face
  // au contrat : « j'ai du lier moi-même » ou « c'etait deja pris par un tiers »
  // signent la même situation — 3000 occupe sans que le serveur l'ait demande.
  let imposteur = null;
  let tenuPar = "imposteur du test";
  try {
    imposteur = await new Promise((resolve, reject) => {
      const s = createServer();
      s.once("error", reject);
      s.listen(3000, "127.0.0.1", () => resolve(s));
    });
  } catch (e) {
    tenuPar = "tiers deja present sur le poste";
    check("S la precondition est reunie (3000 occupe par quelqu'un d'autre)", /EADDRINUSE/.test(String(e)), String(e));
  }
  if (imposteur || tenuPar !== "imposteur du test") {
    try {
      const { child: c2, log: log2 } = await lancerServeur({ port: undefined, readyFile: null });
      const a2 = await attendreLigne(log2);
      if (!a2) {
        // Une sonde qui rougit sans dire pourquoi n'est pas une preuve : on rend
        // l'etat brut du flux de CETTE tentative avant de porter le verdict.
        check("S-diag flux de la tentative sans PORT", false, [
          "lignes=" + log2.buf.split("\n").filter((l) => l.trim() !== "").length,
          "ready=" + log2.buf.includes("COOKDRIVE_READY"),
          "inuse=" + (log2.buf.match(/in use/gi) || []).length,
          "running=" + (log2.buf.match(/Server running on \S+/g) || []).join(","),
          "exit=" + c2.exitCode,
        ].join(" "));
      }
      check("S-b sans PORT demande, l'annonce signale le GLISSEMENT", !!a2 && a2.glisse === true, `${tenuPar} // ${JSON.stringify(a2)}`);
      check("S-c le port annonce est bien celui qui ECOUTE (pas le 3000 demande)", !!a2 && a2.port !== 3000 && (await fetch(`http://127.0.0.1:${a2.port}/api/settings`).then((r) => r.ok).catch(() => false)), `${tenuPar} // annonce=${a2?.port}`);
      await tuer(c2);
    } finally {
      if (imposteur) imposteur.close(() => {});
    }
  }

  console.log(fail === 0 ? "PRÊT : parite serveur/lecteur verifiee" : `ECHEC ${fail} check(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("sonde plante:", e);
  process.exit(1);
});
