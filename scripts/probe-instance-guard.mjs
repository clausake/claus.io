// Sonde du contrat d'identite d'instance + du refus de translacion silencieuse
// du port impose. Une par comportement critique, garde dans scripts/.
//
// Pourquoi cette sonde existe. Deux defauts jumeaux, tous deux inventes par le
// meme harnais (le harnais de mutations de la chaine d'approvisionnement) :
//
//  1. TRANSLACION SILENCIEUSE. server.ts faisait PORT++ sur EADDRINUSE sans
//     rien dire. Un harnais qui IMPOSE un port pour juger une source MUTEE
//     voyait donc son serveur aller ecouter un cran plus loin, pendant que le
//     harnais jugeait qui repondait sur le port impose -- une AUTRE instance.
//  2. VERDICT SANS SOURCE. `res.ok` sur /api/settings prouve qu'UN serveur
//     repond, pas que c'est le notre. Le port est demande a l'OS puis referme :
//     n'importe qui peut le reprendre entre le test et le spawn.
//
// Les deux donnent un verdict VERT sur une source que le test n'a pas installee.
// C'est ce qui a fait annoncer « la mutation M5 ne mord pas » (8/9) alors que
// M5 mord (9/9, verifie hors lot : Expected 840 / Received 120 sur le check K).
//
// Chaque regle est prouvue dans ses DEUX directions : la forme correcte doit
// passer, la forme cassee doit rougir. Une seule moitie verte ne prouve rien.
//
// Lancement : node scripts/probe-instance-guard.mjs   (le code de sortie EST le verdict)
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rmSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-instance-guard");
const VERDICT = join(OUT, "verdict.txt");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNNING_RE = /Server running on http:\/\/127\.0\.0\.1:(\d+)/;
const HEADER = "x-cookdrive-instance";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let fail = 0;
const lines = [];
const check = (label, cond, detail) => {
  const line = `${cond ? "OK  " : "FAUX"}  ${label}${detail ? "   [" + detail + "]" : ""}`;
  console.log(line);
  lines.push(line);
  if (!cond) fail++;
};

// Un port demande a l'OS puis rendu, comme le font les specs.
const portLibre = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

/** Lance le VRAI serveur, capte stdout/stderr dans un fichier, rend sa promesse. */
function lancer({ port, token, tag }) {
  const data = join(OUT, "udata-" + tag);
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  const logPath = join(OUT, tag + ".log");
  const env = { ...process.env, USER_DATA_PATH: data, NODE_ENV: "test" };
  if (port !== undefined) env.PORT = String(port);
  if (token !== undefined) env.COOKDRIVE_INSTANCE_TOKEN = token;
  const log = { buf: "", path: logPath };
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const onChunk = (which) => (d) => {
    log.buf += d.toString();
  };
  child.stdout.on("data", onChunk("out"));
  child.stderr.on("data", onChunk("err"));
  const done = new Promise((resolve) => {
    let settled = false;
    child.on("exit", (code, sig) => {
      if (settled) return;
      settled = true;
      resolve({ code: code === null ? -1 : code, sig: sig || "" });
    });
  });
  return { child, log, done, data };
}

async function attendreSante(base, maxMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(`${base}/api/settings`);
      if (r.ok) return r;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** Les en-tetes reellement observes sur le fil, filtres par prefixe. */
async function enTetesDe(base, path) {
  const r = await fetch(`${base}${path}`);
  const vus = [];
  r.headers.forEach((v, k) => {
    if (k.startsWith("x-cookdrive")) vus.push(`${k}=${v}`);
  });
  return { res: r, vus, valeur: r.headers.get(HEADER) };
}

const arret = async (s) => {
  try {
    s.child.kill("SIGTERM");
  } catch {}
  await Promise.race([s.done, new Promise((r) => setTimeout(() => r({ code: -9, sig: "timeout" }), 15_000))]);
  try {
    s.child.kill("SIGKILL");
  } catch {}
};

async function main() {
  // ==========================================================================
  // REGLE 1 — l'identite est rendue sur chaque reponse, telle que fournie
  // ==========================================================================
  const T1 = `sonde-t1-${process.pid}`;
  const p1 = await portLibre();
  const s1 = lancer({ port: p1, token: T1, tag: "t1" });
  const b1 = `http://127.0.0.1:${p1}`;
  const pret1 = await attendreSante(b1);
  check("R1-a le serveur a jeton demarre et repond", pret1 !== null, `port=${p1}`);
  if (pret1) {
    const vus1 = await enTetesDe(b1, "/api/settings");
    check("R1-b l'en-tete d'identite parait sur /api/settings", vus1.valeur === T1, vus1.vus.join(" | ") || "<aucun>");
    // Une reponse d'ERREUR doit aussi porter l'identite : c'est justement la
    // ou l'on veut savoir QUI a repondu. Un 404 de route inconnue vient du
    // middleware avant les routeurs, donc il est couvert.
    const vus404 = await enTetesDe(b1, "/api/route-qui-n-existe-pas");
    check("R1-c une route inconnue rend aussi l'identite", vus404.valeur === T1, `status=${vus404.res.status} ${vus404.vus.join(" | ") || "<aucun>"}`);
    // Le SSE, exclu de compression, doit garder l'identite (l'en-tete est pose
    // avant le premier write, donc avant que gzip ne tamponne quoi que ce soit).
    try {
      const rSse = await fetch(`${b1}/api/sensors/stream`, {
        headers: { Accept: "text/event-stream" },
        signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined,
      }).catch(() => null);
      check("R1-d le flux SSE rend l'identite", rSse !== null && rSse.headers.get(HEADER) === T1, rSse === null ? "<inacheve>" : `recu=${rSse.headers.get(HEADER)}`);
    } catch (e) {
      check("R1-d le flux SSE rend l'identite", false, String(e && e.message));
    }
  }
  await arret(s1);

  // ==========================================================================
  // REGLE 2 — sans jeton fourni, une identite unique est generee
  // ==========================================================================
  const p2 = await portLibre();
  const s2 = lancer({ port: p2, tag: "t2" });
  const b2 = `http://127.0.0.1:${p2}`;
  const pret2 = await attendreSante(b2);
  check("R2-a le serveur SANS jeton demarre", pret2 !== null, `port=${p2}`);
  let jeton2 = null;
  if (pret2) {
    const v2 = await enTetesDe(b2, "/api/settings");
    jeton2 = v2.valeur;
    check("R2-b une identite est generee d'office", jeton2 !== null && jeton2 !== "", `recu=${jeton2}`);
    check("R2-c l'identite generee est un UUID (bornee, non devinee)", UUID_RE.test(jeton2 || ""), `recu=${jeton2}`);
  }
  const p2b = await portLibre();
  const s2b = lancer({ port: p2b, tag: "t2b" });
  const b2b = `http://127.0.0.1:${p2b}`;
  const pret2b = await attendreSante(b2b);
  if (pret2b) {
    const v2b = await enTetesDe(b2b, "/api/settings");
    check("R2-d deux instances rendent des identites DISTINCTES", v2b.valeur !== jeton2 && !!v2b.valeur, `a=${jeton2} b=${v2b.valeur}`);
  } else {
    check("R2-d deux instances rendent des identites DISTINCTES", false, "seconde instance pas prete");
  }
  await arret(s2);
  await arret(s2b);

  // ==========================================================================
  // REGLE 3 — port EXPLICITEMEMENT demande : pas de translacion silencieuse
  // ==========================================================================
  const p3 = await portLibre();
  const s3a = lancer({ port: p3, token: "PREMIER", tag: "t3a" });
  const b3 = `http://127.0.0.1:${p3}`;
  const pret3a = await attendreSante(b3);
  check("R3-a le premier arrive sur le port demande", pret3a !== null, `port=${p3}`);
  const s3b = lancer({ port: p3, token: "SECOND", tag: "t3b" });
  const sortied = await Promise.race([
    s3b.done,
    new Promise((r) => setTimeout(() => r({ code: -9, sig: "toujours-vivant" }), 60_000)),
  ]);
  check("R3-b le second sur le MEME port meurt (pas de PORT++ cache)", sortied.code !== 0 && sortied.code !== -9, `code=${sortied.code} sig=${sortied.sig}`);
  // Le message doit NOMMER la cause : un mort silencieux ne se debogague pas.
  const brut3b = s3b.log.buf;
  check("R3-c la mort est prononcee explicitement", /EXPLICITLY requested/i.test(brut3b) && /EADDRINUSE|in use/i.test(brut3b), brut3b.split("\n").filter((l) => /port/i.test(l)).slice(0, 2).join(" // ") || "<rien capte>");
  // Et le premier, lui, reste VERT sur son port : il n'a rien vu de la mort de l'autre.
  const apr = await fetch(`${b3}/api/settings`).catch(() => null);
  check("R3-d l'instance legitime tient toujours son port", apr !== null && apr.ok && apr.headers.get(HEADER) === "PREMIER", apr === null ? "<plusieurs>" : `status=${apr.status}`);
  await arret(s3a);
  await arret(s3b);

  // ==========================================================================
  // REGLE 4 — port non demande (defaut 3000) : le glissement est TOLERE
  // C'est le cote ou la garde : sans lui, `npm run dev` et Electron meurent au
  // moindre port occupe. Il faut donc laisser le glissement quand PERSONNE n'a
  // demande le port Explicitement.
  //
  // ⚠ La premisse est « 3000 est occupe », pas « NOUS tenons 3000 ». Si un tiers
  // le tient deja (un serveur de dev oublie, un autre harnais), la premisse est
  // SATISFAITE et la sonde reste valable : c'est justement la situation que l'on
  // veut juger. Refuser de tourner dans ce cas-la est un faux negatif de sonde,
  // et il a ete observe: le 3000 de cette machine etait tenu par un serveur herite.
  // ==========================================================================
  const squatter = await new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(3000, "127.0.0.1", () => resolve(s));
  }).catch(() => null);
  {
    const s4 = lancer({ tag: "t4" }); // PAS de PORT : le defaut 3000 est occupe
    const t0 = Date.now();
    let port4 = null;
    while (Date.now() - t0 < 60_000) {
      const m = RUNNING_RE.exec(s4.log.buf);
      if (m) {
        port4 = Number(m[1]);
        break;
      }
      const fini = await Promise.race([
        s4.done.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 1)),
      ]);
      if (fini) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const tenuPar = squatter !== null ? "la sonde" : "un tiers (serveur herite)";
    check("R4-a sans PORT demande, le serveur glisse d'un cran", port4 !== null && port4 !== 3000, `3000 tenu par ${tenuPar} / ecoute=${port4}`);
    if (port4 !== null) {
      const r4 = await fetch(`http://127.0.0.1:${port4}/api/settings`).catch(() => null);
      check("R4-b le glissant est bien vivant (200 sur son port reel)", r4 !== null && r4.ok, r4 === null ? "<inacheve>" : `status=${r4.status}`);
    } else {
      check("R4-b le glissant est bien vivant (200 sur son port reel)", false, "port jamais capte: " + s4.log.buf.slice(-300));
    }
    await arret(s4);
    if (squatter !== null) squatter.close();
  }

  console.log("-".repeat(78));
  console.log(`  ${fail === 0 ? "VERDICT : toutes les limites prouvées dans les deux directions" : "VERDICT : " + fail + " sonde(s) en echec"}`);
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(VERDICT, lines.join("\n") + "\n\nfail=" + fail + "\n", "utf-8");
  } catch {}
  return fail === 0 ? 0 : 1;
}

process.exitCode = await main();
process.exit(process.exitCode);
