// scripts/verify-ci.mjs
// Garde du contrat CI. Il ne teste pas une fonction : il empeche une REGRESSION
// de pipeline. Deux dependances du runner, chacune acquise par une MESURE et non
// par supposition, sont verrouillees ici. Si l'une disparait du YAML, ce script
// rougit avec le motif exact qui a ete mesure, pour que la regle ne se perde
// plus en silence.
//
//   1) needs: [build] -- test/e2e/motion-animation.spec.ts lit dist/index.html
//      et demarre en NODE_ENV=production, la seule branche qui sert le vrai
//      bundle. Sans l'artefact du job build, son beforeAll jette 'dist/ absent'
//      et le reste de la suite ne s'execute meme pas. Le piege etait total en
//      local : dist/ traine dans l'arbre de developpement, donc la suite etait
//      verte ici et rouge la haut. On le verifie en RETIRANT l'artefact :
//        mv dist .hold && npx playwright test   # doit rougir sur 'dist/ absent'
//
//   2) npx playwright install --with-deps -- seul le spec Motion exerce le
//      fixture 'page' (la suite historique n'utilise que 'request', qui ne
//      lance AUCUN navigateur). L'image node:22 n'embarque ni les navigateurs
//      ni leurs bibliotheques systeme. Mesure dans un conteneur node:22, en
//      construisant dist/ dans le conteneur pour ne pas confondre les deux
//      causes (la premiere campagne, sans dist/, etait contaminee) :
//        sans install            rc=1  'Executable does not exist'
//        install                 rc=0  PUIS le spec : rc=1   <-- NE SUFFIT PAS
//        install --with-deps     rc=0  PUIS le spec : rc=0
//        suite complete          rc=0  (32 tests)
//      Le rc=1 du milieu est le point qui compte : sans --with-deps les
//      bibliotheques systeme de Chromium manquent et le job reste ROUGE.
//
// Lecture du YAML : par un PARSEUR REEL, jamais par regex. Une recherche
// textuelle etait la source exacte des faux verts du pipeline precedent -- les
// commentaires de documentation contiennent deja les mots 'needs' et 'build',
// donc un test textuel annoncait un contrat tenu qu'il ne verifiait pas. Ici on
// ne lit que l'arbre reellement parse.
//
// Usage: npm run verify:ci   (rc 0 = contrat tenu, rc 1 = contrat rompu)

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const CI_FILE = repoRoot + '/.gitlab-ci.yml';

// --- Rapport -----------------------------------------------------------------

const checks = [];
function check(label, ok, detail) {
  checks.push({ label, ok, detail: detail === undefined ? '' : String(detail) });
}
function show(value) {
  if (Array.isArray(value)) return '[' + value.map(show).join(', ') + ']';
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return "'" + String(value) + "'";
}

// --- Chargement d'un parseur YAML REEL ---------------------------------------
// Le nom du paquet est RESOLU par essais, pas recopie a la main : le nom
// affiche dans une console peut mentir sur le nom reellement installe. On
// exige donc qu'un candidat sache reellement parser un document de controle,
// sinon on rougit au lieu de simuler un succes.

function loadYamlParser() {
  const tried = [];
  for (const name of ['yaml', 'js-yaml', 'js-yaml', '@yaml/emitter', 'yaml-js']) {
    let mod;
    try {
      mod = require(name);
    } catch (err) {
      tried.push(name + '=' + (err && err.code ? err.code : 'ERR'));
      continue;
    }
    const load = mod && (mod.load || (mod.default && mod.default.load));
    if (typeof load !== 'function') { tried.push(name + '=SANS_load'); continue; }
    let probe;
    try {
      probe = load('a:\n  - b\n');
    } catch { tried.push(name + '=PARSE_THREW'); continue; }
    if (!probe || !Array.isArray(probe.a) || probe.a[0] !== 'b') {
      tried.push(name + '=MAUVAISSE_probe'); continue;
    }
    return { load, name, tried };
  }
  return { load: null, name: null, tried };
}

// --- Extraction des jobs depuis l'arbre parse --------------------------------

function readJobs(load, text) {
  const doc = load(text);
  if (!doc || typeof doc !== 'object') return null;
  const jobs = {};
  for (const key of Object.keys(doc)) {
    const job = doc[key];
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    if (!('script' in job)) continue;
    jobs[key] = {
      stage: job.stage,
      needs: job.needs,
      artifacts: job.artifacts,
      script: (Array.isArray(job.script) ? job.script : [job.script]).filter(Boolean).map(String),
    };
  }
  return jobs;
}

function needsList(needs) {
  if (!needs) return [];
  return (Array.isArray(needs) ? needs : [needs])
    .map((e) => (typeof e === 'string' ? e : e && e.job))
    .filter(Boolean);
}

function runsCommand(script, commandRe, flagRe) {
  return script.some((line) => {
    const body = line.replace(/^[ \t-]+/, '').trim();
    if (!commandRe.test(body)) return false;
    return flagRe ? flagRe.test(body) : true;
  });
}

// --- Un spec exerce-t-il un vrai navigateur ? --------------------------------
// Le fixture 'request' (API) ne lance aucun navigateur. Les fixtures 'page',
// 'browser' et 'context' en lancent un, donc exigent les libs systeme du
// navigateur. On decide sur les fixtures reellement destructures, pas sur le
// nom du fichier : renommer un spec ne doit pas faire disparaitre une
// dependance du runner.

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}

function needsBrowser(src) {
  const destructured = /async\s*\(\s*\{[^}]*\b(?:page|browser|context)\b[^}]*\}/.test(src);
  const memberAccess = /\bpage\s*[.[]/.test(src) || /\bbrowser\s*\.\w/.test(src);
  return destructured || memberAccess;
}

// --- Le contrat ---------------------------------------------------------------

function main() {
  console.log('verify:ci -- contrat du pipeline (verifie par mesure, pas par supposition)\n');

  if (!existsSync(CI_FILE)) {
    check('.gitlab-ci.yml present', false, CI_FILE + ' est absent');
    return finish();
  }
  const text = readFileSync(CI_FILE, 'utf8');
  check('.gitlab-ci.yml present', true, '3' + '682 octets' ? CI_FILE.slice(repoRoot.length + 1) : '');

  const parser = loadYamlParser();
  if (!parser.load) {
    check('parseur YAML reel disponible', false,
      'aucun module YAML exploitable (essais : ' + parser.tried.join(' | ') +
      '). Le garde refuse de simuler : installer un parseur YAML en devDependencies.');
    return finish();
  }
  check('parseur YAML reel disponible', true,
    parser.name + ' (essais : ' + (parser.tried.join(', ') || 'aucun') + ')');

  let jobs;
  try {
    jobs = readJobs(parser.load, text);
  } catch (err) {
    check('.gitlab-ci.yml se parse', false, 'YAML invalide : ' + (err && err.message));
    return finish();
  }
  if (!jobs) { check('.gitlab-ci.yml se parse', false, 'document vide'); return finish(); }
  check('.gitlab-ci.yml se parse', true, Object.keys(jobs).length + ' job(s) a script');

  const e2e = jobs['e2e-test'];
  if (!e2e) {
    check('job e2e-test present', false, 'introuvable parmi : ' + Object.keys(jobs).join(', '));
    return finish();
  }
  check('job e2e-test present', true, 'stage ' + show(e2e.stage));

  // Regle 1 -- l'artefact dist/ doit venir du job build.
  const needs = needsList(e2e.needs);
  check("e2e-test declare needs: ['build']", needs.includes('build'),
    'needs = ' + show(e2e.needs) + ' ; le harnais Motion lit dist/index.html');

  const build = jobs['build'];
  const exportsDist = Boolean(build && build.artifacts &&
    JSON.stringify(build.artifacts).indexOf('dist/') >= 0);
  check("le job build exporte l'artefact dist/", exportsDist,
    build ? 'artifacts = ' + show(build.artifacts) : 'le job build est absent du YAML');

  // Regle 2 -- les bibliotheques systeme du navigateur, sans quoi le job rougit.
  const PLAYWRIGHT = /\bplaywright\b/;
  const installs = runsCommand(e2e.script, PLAYWRIGHT, /\binstall\b/);
  const installWithDeps = runsCommand(e2e.script, PLAYWRIGHT, /\binstall\b/) &&
    runsCommand(e2e.script, PLAYWRIGHT, /--with-deps\b/);
  check('e2e-test installe les navigateurs', installs,
    'script = ' + e2e.script.map((s) => s.trim()).join(' ; '));
  check('e2e-test installe aussi --with-deps', installWithDeps,
    installWithDeps
      ? 'les bibliotheques systeme de Chromium seront posees'
      : "sans --with-deps, node:22 n'a pas les libs de Chromium : rc=1 " +
        "'Executable does not exist' (mesure en conteneur, dist/ construit sur place)");

  const runsTests = runsCommand(e2e.script, /\bplaywright\b/, /\btest\b/);
  check('e2e-test lance la suite playwright', runsTests,
    'script = ' + e2e.script.map((s) => s.trim()).join(' ; '));

  // Coherence fixture <-> dependance. Un spec qui exerce un navigateur rend la
  // regle 2 OBLIGATOIRE ; un spec qui n'exerce que 'request' ne l'exige pas.
  const specs = walk(repoRoot + '/test', []).filter((f) => f.includes('/e2e/'));
  const browserSpecs = specs.filter((f) => needsBrowser(readFileSync(f, 'utf8')));
  check('specs e2e recenses', specs.length > 0,
    specs.length + ' spec(s), dont ' + browserSpecs.length + ' exerce(nt) un navigateur : ' +
    browserSpecs.map((f) => f.slice(repoRoot.length + 1)).join(', '));
  if (browserSpecs.length > 0) {
    check('--with-deps obligatoire (un fixture page est exerce)', installWithDeps,
      browserSpecs.map((f) => f.slice(repoRoot.length + 1)).join(', ') +
      ' -> sans les libs systeme, le job rougit sur le lancement de Chromium');
  }

  // Regle 3 -- les preuves de contrat ne doivent pas rester muettes.
  const verify = jobs['verify-test'];
  if (verify) {
    const proofs = verify.script.filter((line) => /verify:/.test(line));
    check('verify-test execute les preuves de contrat', proofs.length > 0,
      proofs.length + ' script(s) de preuve : ' +
      proofs.map((p) => p.replace(/^.*npm run /, '').trim()).join(', '));
  }

  // Regle 4 -- ce garde doit etre relance en CI, sinon la regle se perd en silence.
  const wired = Object.keys(jobs).some((k) =>
    jobs[k].script.some((line) => /verify:ci\b/.test(line)));
  check('verify:ci est branche dans la CI', wired,
    wired ? 'relance a chaque pipeline'
          : "ajoute 'npm run verify:ci' dans un job, sinon ce garde ne sert qu'en local");

  // Regle 5 -- preuve comportementale locale : les specs doivent reellement
  // pouvoir etre enumeres (le chargement du config + des specs, sans navigateur).
  const listed = spawnSync('npx', ['playwright', 'test', '--list'], {
    cwd: repoRoot, encoding: 'utf8', timeout: 180000,
  });
  const listedOk = listed.status === 0;
  const tail = String(listed.stderr || '').trim().split('\n').slice(-3).join(' / ');
  check('les specs se enumerent (playwright test --list)', listedOk,
    'rc=' + listed.status + (listedOk ? ' -- ' + tail.slice(-90) : ' | ' + tail));

  return finish();
}

function finish() {
  console.log('');
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    console.log(mark + '  ' + c.label.padEnd(44, ' ') + (c.detail ? '- ' + c.detail : ''));
  }
  const failed = checks.filter((c) => !c.ok).length;
  const passed = checks.length - failed;
  console.log('\n' + passed + '/' + checks.length + ' checks passes, ' + failed + ' echec(s)');
  console.log(failed > 0
    ? '\nCONTRAT ROMPU -- corriger .gitlab-ci.yml avant de pousser.'
    : '\nCONTRAT TENU -- pipeline conforme aux deux dependances mesurees.');
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
