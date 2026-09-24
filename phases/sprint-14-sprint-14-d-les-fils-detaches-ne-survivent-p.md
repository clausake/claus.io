## Sprint 14.d - les fils detaches ne survivent plus a leur harnais; la sonde juge-unite-vide jouait dans le vide et est branchee (24 sept.)

CONTEXTE : Article 4 des articles ouverts de docs/audit-2026-09-20.md (les
sondes sans porte) solde en trois commits : 933bd78 (conducteur des orphelines
+ la sonde du re-dispost), 0c02203 (le fillet qui tue le groupe, six sondes),
f8c6dbc (la cause nommee de la sonde py + son branchement). Trois portes
nouvelles sont entrees au DEFAUT de scripts/run-all-gates.py et a package.json
(regle 6, les deux ensemble) : verify:import-contract, verify:supplier-probe,
verify:juge-unite-vide. verify:installeur etait deja la.

DEFINITION DU DEFaut SOLDE : trois fils remanants (PID 2228278 jeton
`probe-spri` port 4321 ; 2237431 jeton `probe-docs-validate` port 4351 ;
456081 jeton `juge-x` port 3999) tenaient leurs ports figures depuis vingt
heures sous systemd --user (PPID 2201), leurs harnais etant morts. Ils
faisaient rougir verify:routes, verify:supplier-probe, verify:import-contract
et verify:documents-validate POUR RIEN. La cause est un seul mecanisme :
`child.kill()` / `server.kill("SIGTERM")` ne tue que le PID DIRECT ; le `tsx`
que ce fils engendre lui survit, adopte par systemd.

QUATRE ANGLES MORTS D'HARNAIS, CHACUN MUE, CHACUN REPARE :
1. LE KILL NE VISAIT PAS LE GROUPE. Les six sondes qui arment un serveur
   (probe-supplier-price-contract.mjs, probe-supplier-import-contract.mjs,
   probe-documents-validate-contract.mjs, probe-dashboard-voices.mjs,
   probe-post-inventory-voices.mjs, scripts/juge-unite-vide-post.py) portent
   desormais `detached: true` au spawn PUIS `process.kill(-pid, "SIGKILL")`
   du groupe entier au kill final ; cote python `start_new_session=True` +
   `os.killpg(child.pid, ...)`. Sans le detach, le kill du groupe tuerait
   AUSSI le harnais.
2. UN JETON FIGE FAIT JUGER L'ORPHELIN PAR SA PROPRE SUCCESSION : la boucle
   d'attente confronte `x-cookdrive-instance === TOKEN` et l'orphelin porte le
   MEME jeton, donc `pret=true` sans que la course ait installe quoi que ce
   soit ; elle semait sur l'instance d'un harnais mort. TEMOIN : deux courses
   a une heure d'ecart (gates-1801041 18:04, gates-1046060 19:05) rendaient
   des RESULTATS SEM_* IDENTIQUES et les bases tmp-probe-* restaient vides.
   Les jetons portent desormais une EPOCH (`-${process.pid}-${Date.now().
   toString(36)}`, la voie de routes.spec.ts).
3. `PORT_OCCUPE=1` SANS NOM ETAIT UN ANGLE MORT DU CAPTEUR : avant le spawn,
   si `portLibre` echoue, la sonde JOUE QUI tient le port (GET /api/settings,
   l'en-tete rendu) et rend `JETON_RENDU` vs `JETON_ATTENDU`. Verdict mesure
   (gates-298148) : `rc=5 PORT_OCCUPE=1 PORT=4321 JETON_RENDU="probe-spri"
   JETON_ATTENDU="probe-spri-mufv2cw6"`. La cause est nommee, plus rien a
   deviner.
4. LE FLUX DU FILS PARTAIT DANS DEVNULL : le verdict `SERVEUR_ABSENT=1` de
   scripts/juge-unite-vide-post.py etait muet depuis des jours. Le sillage est
   desormais dans `<OUT_DIR>/serveur.{out,err}.log` ; il a rendu le mot-visible
   en une course : `ERR_MODULE_NOT_FOUND .../scripts/server.ts`. La sonde est
   NEe dans scripts/ (933bd78) mais portait `PROJ = BASE` (son propre
   dossier) au lieu de `os.path.dirname(BASE)` : elle spawnait un serveur qui
   ne peut pas exister. TEMOIN DIFFERENCIEL : le MEME script copie hors du
   depot (seul `__file__` bouge) rendait `IDENTITE_OK=1` — c'est la
   comparaison des deux rendus qui a nomme le mot que la sonde cachait.

DEUX AUTRES CAUSES NOMMEES, MESUREES, NON HERITEES :
- Le port 24678 est le HMR de VITE (`hmrPort || 24678`, fige dans
  node_modules/vite) : un serveur spawn SANS `NODE_ENV=production` monte le
  middleware du dev et meurt si le port est pris — ici par le dev d'un AUTRE
  projet du poste (/home/clausake/Stefan/Volt-App-main, PID 1581074). Les
  mots « vite » et « HMR » n'apparaissent nulle part dans le verdict `SERVEUR
  PAS PRET`. Ce fils-la n'est JAMAIS un orphelin du depot : NEVER kill.
- Le veilleur d'attente de la sonde py etait a 30 s alors que le demarrage
  REEL rend `COOKDRIVE_READY` a ~61 s (chargement EpicureModel + 15
  migrations `[SCHEMA]`, mesure). Un `SERVEUR_ABSENT` qui etait une course de
  vitesse, pas un defaut de produit.

TUAGE D'UN ORPHELIN : JAMAIS a l'aveugle sur un PID. Verifier AVANT le kill,
par les octets de /proc : `readlink /proc/<pid>/cwd` == le depot, la cmdline
porte `server.ts` ou `tsx`, et `COOKDRIVE_INSTANCE_TOKEN` de
/proc/<pid>/environ est celui consigne. Les trois ont passe ce controle avant
SIGKILL ; le fils du dev de Stefan n'a pas ete touche.

PREUVES JOUEES (non heritees) :
- verify:import-contract rc=0 (gates-3779224) avec la SEMENCE PROUVEE de
  l'unite vide par ecriture directe en base (`open({filename, driver:
  sqlite3.Database})` + `UPDATE inventory SET unit = ''` +
  `pose.changes !== 1 -> rc=2` + relire `UNITE_EN_BASE=""`) :
  `SEM_POSE_UNIT_VIDE=1 I4_CODE=200 I4_NULL_AVEU=1`. La mutation du 400
  n'est PAS retiree : c'est le payload `unit:""` du POST /api/inventory qui
  atteint la branche du garde, pas la sonde.
- verify:supplier-probe, verify:import-contract, verify:documents-validate,
  verify:routes : rc=0 et `ROUGES=0` une fois les trois orphelins tues
  (gates-2388554 et gates-2418080).
- verify:juge-unite-vide rc=0 (gates-179636) : `IDENTITE_OK=1
  SEM_A_CODE=400 SEM_B_CODE=200 SEM_B_EXISTE=1`, et zero orphelin tsx du
  depot vivant apres la course (`pgrep cookdrive` rendu 0).
- Les huit orphelines de C4 sont JouEEs par scripts/_joue_orphelines.py avec
  l'idiome PROPRE de chaque harnais (MORD / VERDIT LUS / JOUEES), compte non
  par un regex unique : `JOUEES=1/1` par cible, `attendu_mini` exige et
  verifie par le conducteur (un « 0 verdicts » rendu sur une sonde qui rend
  « 14/14 MORDENT » est un angle mort du capteur, pas une absence).

Proprietaire : le pilote.
