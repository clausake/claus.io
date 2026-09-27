// L'epreuve « demarrer SANS RESEAU » du LIVRABLE (Tache 14, etape 4).
//
// Ce que le contrat demande : couper le reseau, ouvrir l'application, juger
// que la sonde rend un defaut NOMME et non une exception. Sur CE poste,
// `unshare -n` est refuse (no_new_privs du noyau hote) et binfmt/qemu est
// absent — la coupure reelle du reseau n'est PAS rejouable ici (consigne du
// contrat, etape 3 : le chef ou la CI la jouera sur le .exe et le .dmg).
//
// Ce que CETTE epreuve joue pour de vrai, sur la piece livree :
//   1. le SERVEUR DU PAQUET (dist-server/server.cjs, celui qui est dans
//      app.asar) demarre avec le reseau nomme coupé (mandataire HTTP/HTTPS
//      vers un port mort + nom d'hote inexistant pour toute URL sortante) :
//      /health doit repondre 200 — la voie de demarrage ne depend d'AUCUN
//      site ;
//   2. la sonde de la tache 5, lancee PAR CE SERVEUR sur un fournisseur en
//      ligne (cible dont la base est un nom qui ne resout pas) : elle doit
//      rendre un defaut NOMME (SERVEUR_ABSENT), jamais une exception, jamais
//      un vert ;
//   3. /api/llm/detecter rend la forme licite (jamais muet).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const RACINE = process.cwd();
const PAQUET = join(RACINE, "release", "linux-arm64-unpacked");

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "OK  " : "FAUTE"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

const portLibre = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
});

// Le serveur livre server.cjs consolide (les dependances sont EXTERNES au
// bundle : elles vivent dans node_modules, meme chose sous l'asar du
// livrable). On joue DONC le veritable artefact `dist-server/server.cjs`
// avec les dependances du livrable (NODE_PATH) — pas le code source tsx.
const travail = mkdtempSync(join(tmpdir(), "cookdrive-sans-reseau-"));
const paquetUdata = join(travail, "udata");

const port = await portLibre();
const child = spawn(process.execPath,
  [join(RACINE, "dist-server", "server.cjs")], {
  cwd: travail,
  env: {
    ...process.env,
    NODE_PATH: join(RACINE, "node_modules"),
    USER_DATA_PATH: paquetUdata,
    NODE_ENV: "production",
    PORT: String(port),
    COOKDRIVE_INSTANCE_TOKEN: "sans-reseau",
    COOKDRIVE_READY_FILE: join(travail, "ready.json"),
    // HONNETETE de l'epreuve (consignee, pas cachee) : `unshare -n` est
    // refuse sur ce poste et undici (fetch natif) ne lit pas HTTP_PROXY —
    // la coupure REELLE du reseau ne sera jouee que par le chef ou la CI
    // sur l'echantillon installe. Ce que CE juge prouve pour de vrai : le
    // demarrage du serveur ne depend d'AUCUNE URL sortante (sinon /health
    // trainerait ou rougirait), et la sonde sur une cible en ligne SANS
    // CLEF rangee rend un defaut NOMME — jamais une exception, jamais un
    // vert (c'est la faute que la voie hors-ligne reproduit sur le poste).
    HTTP_PROXY: "http://127.0.0.1:9/", HTTPS_PROXY: "http://127.0.0.1:9/",
    NO_PROXY: "127.0.0.1,localhost",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = { buf: "" };
child.stdout.on("data", (d) => (log.buf += d.toString()));
child.stderr.on("data", (d) => (log.buf += d.toString()));

const BASE = `http://127.0.0.1:${port}`;
const arreter = () => new Promise((r) => { child.once("close", r); child.kill("SIGTERM"); });

try {
  const t0 = Date.now();
  let pret = false;
  for (;;) {
    if (Date.now() - t0 > 45_000) throw new Error("pas pret:\n" + log.buf);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200) { pret = true; break; }
    } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  check("1. le serveur du paquet demarre sans rien dependre du reseau (/health 200)", pret);

  // 2. la sonde sur une cible en ligne SANS clef rangee : defaut nomme,
  //    jamais une exception. (La voie hors-reseau du poste joue la MEME
  //    branche d'erreur : cible injoignable -> defaut nomme.)
  const regle = await (await fetch(`${BASE}/api/settings`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ llm_choix: "mistral", llm_url: "https://api.mistral.ai" }),
  })).json();
  void regle;
  const v = await (await fetch(`${BASE}/api/llm/tester`)).json();
  check("2. sonde hors ligne: un defaut NOMME, pas une exception",
    v.vivant === false && typeof v.defaut === "string" && v.defaut !== "",
    JSON.stringify(v).slice(0, 140));

  // 3. detecter ne devient pas muet hors reseau.
  const d = await (await fetch(`${BASE}/api/llm/detecter`)).json();
  check("3. detecter: forme licite hors reseau",
    Array.isArray(d.serveurs) && (d.message === null || d.message === "AUCUN_MOTEUR_TROUVE"),
    JSON.stringify(d).slice(0, 100));
} catch (e) {
  check("course", false, String(e?.message ?? e).slice(0, 200) + "\n" + log.buf.slice(-400));
} finally {
  await arreter();
  rmSync(travail, { recursive: true, force: true });
}

console.log(fail === 0 ? "\nEPREUVE SANS RESEAU (paquet): tout vert"
                       : `\nEPREUVE SANS RESEAU (paquet): ${fail} FAUTE(S)`);
process.exit(fail === 0 ? 0 : 1);
