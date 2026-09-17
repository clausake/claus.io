## Sprint 4 — Fiabilite du temps reel (8 sept.)

### 4.1 Rate-limit par categorie de surface (commit `aa83fb2`)
L'heritage (300 req / 15 min, un seul budget pour tout `/api`) etait un defaut de
conception, pas un reglage. **Mesure** : une tablette laisse sur l'onglet HACCP
emet ~29 req/min (capteurs 4 s + robots 5 s + alertes 30 s) et declenchait un 429
**GLOBAL** au bout d'environ 10 min, sans autre activite. Dans une cuisine,
l'app "mourait" pendant le service. Et a l'inverse, `/api/unlock` (la cle de
licence, signee RSA) disposait de 300 tentatives par fenetre.

- `src/middleware/api-rate-limiter.ts` : 5 budgets independants, une instance de
  `MemoryStore` par categorie (donc **aucune double comptabilite** : une requete
  traverse exactement un budget) :
  `read 600/5min`, `mutate 150/5min`, `delete 40/5min`, `auth 20/15min`,
  `ai 60/5min`. Exempts : `/api/sensors/stream`, `/api/trial-status`.
- En-tetes **draft-8** : le seul format qui publie le NOM du quota. Un 429 est
  donc diagnostiquable depuis le client sans interrogater le serveur.
  ⚠ `draft-7` ne publie PAS le nom — c'est ce qui a fait rougir la premiere
  verification de ce fichier.
- Invariant grave en test unitaire : `auth.limit < mutate.limit` (le brute-force
  de cle ne doit jamais couter moins cher qu'une saisie normale).
- ⚠ `express-rate-limit` n'est plus importe que dans ce middleware : l'import
  devenu mort a ete retire de `server.ts` (le projet a deja eu un incident de
  dead-import sur le loader CJS de tsx avec `undici`).
- Prouve par `scripts/verify-ratelimit.mjs` (5/5) : 500 lectures sans 429, 429 a
  la 21e tentative d'unlock, 429 a la 151e ecriture. 7 tests unitaires.

### 4.2 Push SSE des capteurs HACCP (remplace le polling 4 s)
Le serveur connait deja l'instant exact ou un capteur poste (le webhook
`/api/haccp/webhook/iot-report`) : il n'a pas besoin qu'on le lui demande.

- `src/services/sensor-hub.ts` : hub unique, `attach/publishReading/publishList/
  publishStale/heartbeat`. Reconnu au niveau du protocole (le header `Connection`
  est un header *hop-by-hop* que Node tient lui-meme et qu'un reverse proxy ne
  relai jamais : l'ecrire a la main etait un anti-pattern, retire).
- `GET /api/sensors/stream` (monte par Express **avant** le middleware Vite : le
  dev-server ne tamponne donc pas le flux) + instrumentation du webhook, du
  register et du delete de capteur.
- Le scan des capteurs **muets** (silence > 120 s, tour de 25 s) est l'alerte
  HACCP qui manquait : un capteur a pile morte etait indiscernable d'une chambre
  froide conforme. La LED devient ambre et **ne pulse plus** (le pulsation
  mentirait sur une mesure fraiche).
- **Pas de deduplication a l'emission** : un webhook poste est un fait HACCP, il
  est toujours diffuse (une chambre qui reste a 3.4 degres doit pouvoir
  rafraichir son horodatage). La premiere version avait une garde `lastHash`
  speculente qui, de plus, incluait `last_reading_at` (toujours nouveau) : elle
  n'absorbait jamais rien de legitime et pouvait masquer la releve d'un AUTRE
  capteur. Retiree. De meme, `publishStale([])` est publie : "plus aucun capteur
  muet" est un changement d'etat qui doit pouvoir de-fanionner le precedent.
- Cote client (`Haccp.tsx`) : un `EventSource` + un **filet** (re-synchronisation
  HTTP si aucun evenement depuis 20 s). `EventSource` se reconnecte seul mais ne
  signale pas ses blancs : sans le filet, un proxy qui tamponne gellerait le
  tableau sur des mesures de la veille.
- **Mesure** : latence capteur->ecran **13 ms** (contre 4000 ms de polling).
  Contrat grave en CI (Playwright n° 28) et en local (`scripts/verify-sse.mjs`).

### 4.3 Instrumentation de latence par route (`/health/perf`)
L'audit de perf devait se placer A L'EXTERIEUR pour obtenir des percentiles, parce
que `/health` ne connait aucun percentile. Sans mesure interne, toute decision de
perf est devinee ; avec elle, elle est mesuree dans l'app.

- `src/services/perf.ts` : collecteur d'anneau circulaire (`RING_SIZE` 256) +
  percentiles au rang exact (`rank = ceil(p/100*n)-1`). Trois invariants non
  negociables, chacun grave en test unitaire :
  1. mesure en `process.hrtime.bigint()` (microsecondes) et non `Date.now()` : sur
     un endpoint a p50 reel de ~2 ms, l'echelle milliseconde noie tout ;
  2. bucket par **motif** de route (`/api/inventory/:id`) et non par chemin brut :
     une cle par id ferait une serie par id (cardinalite non bornee) ;
  3. cardinalite BORNEE par construction (`MAX_ROUTES` 80, reste-agrege dans
     `*overflow*`) : la limite memoire ne depend pas de la justesse de l'heuristique.
- Le chemin chaud du logger reste O(1) : ni tri ni allocation par requete. Le tri
  est dans `snapshot()`, a la demande.
- SUBTILITE qui a fait echouer la premiere version : `http-logger` est monte
  AVANT les routeurs, donc `req.route` est vide a l'entree de la requete. Le motif
  n'est lisible que dans le callback `finish`. `req.route` porte aussi le prefixe
  de montage : on ne le fait confiance qu'apres avoir verifie que sa regex teste
  bien le chemin.
- `/health/perf` est EXCLU du logger : sans ca, le poll de sante injecterait sa
  propre mesure dans les stats qu'il est cense eclairer.
- 16 tests d'invariant dans `test/unit/perf.test.ts` (16 de plus que la porte
  precedente) + preuve terrain `node run verify:perf` (13/13 : percentiles coherents,
  30 ids agglutines sous UN motif, 6 series pour ~160 requetes).

### 4.4 Compression HTTP + cache des assets content-hashed
Les deux dettes que `audit-perf` signalait sont soldees : `compression` etait absent
de `package.json` et les assets haches etaient servis en `max-age=0`.

- **gzip** (`compression` + `@types/compression`) : `threshold` 1 ko (sous ce plancher
  le CPU coute plus cher que les octets economies), filtre delegue a
  `compression.filter` pour ne pas dupliquer la liste des Content-Type compressibles.
- ⚠ **LE POINT QUI FAIT MAL** : `text/event-stream` est exclu de la compression.
  gzip met un flux en tampon ; sur le SSE des capteurs, cela reintroduirait la
  latence que la phase 4.2 a supprime (4000 ms -> 13 ms). Le contrat est grave en CI
  (Playwright) et en local (`verify:http`).
- **Cache** : les assets Vite portent le hash de contenu dans leur nom, donc
  `max-age=1 an + immutable` est sur. `index.html` reste `no-cache` (pas de hash dans
  son nom) : c'est lui qui libere un nouveau bundle. `express.static` recoit
  `maxAge`/`immutable` + un `setHeaders` qui force `no-cache` sur tout ce qui n'est
  pas `/assets/`.
- ⚠ Le `filter` de compression ne s'extrait PAS par `compression().filter` (le type
  `RequestHandler` de @types ne l'expose pas) : c'est `compression.filter`, exporte
  par le namespace. Erreur TS2339 a la premiere tentative.
- Mesure reelle, sur socket BRUTE et non par `fetch` : `fetch` (undici) declare
  `Accept-Encoding` et decompress tout seul, donc il masque le poids du fil et
  transforme la mesure de compression en preuve creuse. Gain : **85 734 -> 18 783
  octets** (ratio 0,219) sur `/api/epicure/vocab-list`, corps gzip verifie decodable
  et identique a la variante `identity`.
- `scripts/verify-http.mjs` (17 checks, dont la revalidation du HTML par `If-None-Match`
  -> 304, l'absence de compression sur le SSE avec une vraie releve sortie en 4 ms, et
  l'identite des en-tetes entre un client Electron et Chromium) est lance par
  `npm run verify:http` — il exige `npm run build` prealable, car la suite e2e roule
  en mode dev (middlewares Vite) et n'exerce donc jamais la branche `express.static`.

### 4.5 Audit de perf mesongeur (le bloc rate-limit)
Le bloc n° 4 d'`audit-perf.mjs` avait ete **laisse faux** par le passage au
rate-limit par categorie (commit `aa83fb2`) : il recalculait encore avec le vieux
budget global de 300/15 min et annoncait un 429 au bout de ~10 min d'onglet HACCP
ouvert. Decision de perf prise sur ce chiffre = une journee perdue. Trois defauts
corrignes, chacun avec sa raison :
- les budgets et les frequences sont **dus dans le module**, pas recopies (un
  audit qui recopie est deja faux ; `parseBudgets` echoue des que la forme change
  au lieu de deviner). Le `const MIN = 60_000` doit etre resolu : lu comme 5, il
  faisait annoncer un budget de 720 000 req/min.
- le debit des sections precedentes est **retire** du rang du 429 : le limiteur ne
  connaft qu'une cle IP, les sections 2-3 ont deja consomme le meme quota. Lu brut,
  le 429 a la 528e passait pour un budget de 600 mal applique (528 + 74 = 602 ~ 600).
- le calcul « temps avant verrou » etait une **erreur de raisonnement** : une
  fenetre glissante se reinitialise, donc on compare `debit x fenetre` a `limit`,
  et non `limit / debit`. Reponse reelle : 75 req par fenetre de 5 min pour 600 ->
  **le verrou ne se declenchera jamais en passif** (8x de marge).
- l'en-tete attendu etait faux : `draft-8` publie le **nom** du quota + le restant
  + le delai (`"read-in-300000"; r=0; t=299`), pas le quota absolu (celui-la est
  draft-7, desactive par `legacyHeaders: false`).

### 4.6 Poids du bundle d'entree (-84 823 octets)
- Passage de la variante lourde a la variante legere (`m`) sur les 8 fichiers qui
  animaient, + `LazyMotion` dans `src/main.tsx` avec un **loader asynchrone**
  (`src/motion-features.ts`). Conformement a la doc officielle Motion : la
  version lourde ne peut pas etre allegee par le bundler au-dela de ~34 ko.
- Aucun geste lourd dans l'app (recherche verifiee : aucun `whileHover`, `drag`,
  `layout`, `LayoutGroup`) : `domAnimation` suffit. Le DnD de `MenuAnalysis` est
  du DnD HTML5 natif (`React.DragEvent`), pas un geste Motion -> `domMax` etait
  inutile.
- ⚠ **DEFAUT SILENCIEUX attrape par le harnais, pas par le build** : la 1ere
  version (remplacer la balise sans enrouler l'arbre dans le fournisseur) laissait
  l'element anime **fige a `opacity: 0`** — `tsc` vert, build vert, les 30 tests de
  `routes.spec` verts, et un ecran partiellement vide pour l'utilisateur. Seul
  Chromium l'a vu (le harnais a rougi avant le commit)
  (`test/e2e/motion-animation.spec.ts`, mesure l'opacite calculee du reel `dist`).
- ⚠ **FAUX GAIN refuse** : une regle `manualChunks: { "vendor-motion":
  ["motion/react", ...] }` rassemblait les features dans un chunk rendu
  statiquement accessible -> cite dans `index.html`, donc charge au demarrage : le
  gain tombait a ~40 ko. La regle est retiree, avec sa raison ecrite dans
  `vite.config.ts` : c'est Rollup qui doit decider.
- **Mesure avant/apres sur le meme harnais** (git stash + rebuild + relle) :
  chunk d'entree **675 935 -> 591 112 octets**, total du chargement initial
  identiquement **-84 823** (les vendors lourds etaient deja separe). Le chunk des
  features (`motion-features-*.js`, 38 ko / 14 ko gzip) n'est PAS dans `index.html`.
- ⚠ **Le controle visuel etait indispensable et n'allait pas de soi** : captures
  avant/apres comparrees, 4 zones differentes (max 234/255). En portan le delai de
  stabilisation a 4x, le delta tombe a **0,000 % (max 11)** : c'etaient des
  animations saisies en cours de jeu. Sans ce contre-echantillon, on aurait either
  signale une fausse regression, either laisse passer une vraie.
- `scripts/verify-bundle.mjs` (`npm run verify:bundle`, 6 checks) verrouille :
  plafond du chunk d'entree, existence du chunk de features, absence de son
  chargement initial, presence de son import dynamique, et absence de tout import
  de la variante lourde dans `src/` (un import oublie annule le gain pour toute
  l'app sans rien casser de visible).

### 4.7 Les routes « lentes » n'etaient PAS un probleme d'index (1 index sur 6 retenu)
Aucun `CREATE INDEX` n'existait dans `src/db/init.ts` et six routes sortaient en
p95 de 3 a 8 ms. L'intuition (« pas d'index donc c'est lent ») etait FAUSSE, et
l'affirmer sans mesure aurait ajoute 6 index payants a l'ecriture pour rien.
`scripts/ab-indices.py` (`npm run verify:indices`) tranche l'affaire :

- **Volume d'abord, verdict ensuite.** Sur la base de demarrage (2 lignes
  versionnees), un scan de table coute des microsecondes : la mesure ne pouvait
  rien dire. Le harnais seede donc un volume de resto (180 articles, 6000 tarifs,
  4000 plannings, 2500 factures, 3000 releves) et **verifie ses propres
  compteurs en base** : `id TEXT PRIMARY KEY` n'est pas auto-incremente, donc un
  `INSERT` qui omet `id` REUSSIT et ne seme RIEN. Sans ce garde, tout le verdict
  portait sur une base vide.
- ⚠ **Le p95 HTTP ne peut pas trancher.** Le bruit inter-bloc y est de 9 a 11 ms
  pour un effet d'index attendu de ~10 ms : trois reglages differents du nombre
  de passages y changeaient le verdict (une fois "GAIN REEL", une fois "NON
  CONCLUANT" sur la MEME route). La decision est donc prise sur la **couche SQL
  pure** (`sql_bench`, hors HTTP), ou le bruit tombe a la resolution de l'horloge.
  Le p95 HTTP est quand meme rapporte, comme contexte, avec sa marge de bruit.
- Deux pieges de harnais corriges en route, chacun grave en commentaire dans le
  script : (a) `tsx` est lance par **node** et non par `sys.executable` — lance
  par python, le shim shell meurt d'un `SyntaxError` qui se lit « serveur pas
  pret » ; (b) chaque bloc demarre un processus NEUF, donc sans echauffement
  (statements prepares + cache de pages froids) le verdict depend de l'ordre des
  bras et non de l'index.
- Trois passes de suite, meme classement : un seul candidat depasse le seuil de
  15 % de gain SQL.

| index candidat | p95 SQL sans | avec | gain | decision |
| --- | --- | --- | --- | --- |
| `temperature_logs(recorded_at DESC)` | 0,171 ms | 0,031 ms | **+82 %** | **RETENU** |
| `supplier_prices(inventory_id)` | 5,796 | 5,792 | +0,1 % | refuse |
| `staff_schedule(day)` | 0,094 | 0,094 | +0,4 % | refuse |
| `staff(active)` | 0,015 | 0,015 | -0,5 % | refuse |
| `documents(date)` | 0,351 | 0,376 | -7,0 % | refuse |
| `supplier_prices(supplier_id)` | (idem jointure) | | | refuse |

- Seul le gagnant est installe, dans `src/db/init.ts` : `SELECT * ... ORDER BY
  recorded_at DESC LIMIT 50` etait un scan complet + tri temporaire
  (`USE TEMP B-TREE`); l'index donne un parcours deja trie et le `LIMIT 50`
  arrete la lecture apres 50 clefs. Verifie sur **base neuve** et sur **base
  existante** (le cas des clients deja installes) : l'index reapparait apres un
  redemarrage ou on l'a supprime, et le plan de la route dit `SCAN temperature_logs
  USING INDEX ix_temperature_logs_recorded`.
- ⚠ `CREATE INDEX IF NOT EXISTS` est ici une **obligation** et non une comfort :
  `initDatabase()` tourne a chaque demarrage sur la base du client. Le `try/catch`
  ne fait pas echouer le demarrage si le moteur est trop vieux pour un index DESC :
  la requete reste correcte, seulement plus lente.
- Les 5 refuses sont **la decision**, pas un oubli : un index non prouve est une
  dette de plus a chaque ecriture (le webhook IoT des capteurs HACCP ecrit en
  continu), et le cout d'ecriture des 6 etait deja mesure (sous la resolution de
  l'horloge, +23 % sur un nombre trop petit pour etre significatif).

### Etat des portes (8 sept., HEAD Sprint 4)
- `npx tsc --noEmit` : 0 erreur · `npx vitest run` : **38** · `npx playwright test` :
  **32** (SSE + 2 compression + 2 opacite Motion) · `npm run build` : chunk d'entree
  **591.11 kB** (591 112 octets) / les vendors lourds restent en chunk separe.
- Verify terrain : `verify:ratelimit` 5/5 · `verify:sse` · `verify:perf` 13/13 ·
  `verify:http` 17/17 · `verify:bundle` 6/6 · `verify:indices` (A/B + plan).
- Prochaine cible reelle (mesuree, pas supposee) : `/api/dashboard/stats` fait
  **12 appels `db.all/get` par tour** (dont 7 agregats) et c'est ce qui fait son
  p95, pas les scans. La reduction du nombre d'appels — ou la mise en cache de
  l'agregat — est le levier, pas un index.
- Nouveaux fichiers : `src/middleware/api-rate-limiter.ts`,
  `src/services/sensor-hub.ts`, `src/services/perf.ts`,
  `test/unit/{rate-limiter,perf}.test.ts`,
  `test/e2e/motion-animation.spec.ts`, `src/motion-features.ts`,
  `scripts/{verify-ratelimit,verify-sse,verify-perf,verify-http,verify-bundle,audit-perf}.mjs`.
- Les 4 verify sont exposes en scripts npm (`verify:perf`, `verify:http`,
  `verify:sse`, `verify:ratelimit`, `audit:perf`) : un reglage de perf se prouve
  avec un de ces scripts, pas dans une conversation.
- ⚠ `scripts/audit-perf.mjs` reste l'outil de mesure du temps reel : le lancer
  avant de toucher au polling, au cache ou au rate-limit. Ce qu'il revele ENCORE :
  le chunk d'entree a 591 kB (vendors `react-dom` surtout) et le p95 de
  `/api/dashboard/stats` (voir 4.7 : il n'etait PAS du aux index).

### 4.8 Le contrat du pipeline est VERIFIE par un script, plus raconte (Sprint 4.8)
Deux dependances du runner portaient le pipeline, connues seulement par des
commentaires dans `.gitlab-ci.yml`. Un contrat ecrit en prose se perd : le
commentaire de `needs: [build]` avait deja ete reecrit trois fois, et chaque
reecriture etait l'occasion d'un oubli. `scripts/verify-ci.mjs`
(`npm run verify:ci`, 20 checks) le verrouille desormais par execution.

- ⚠ **Une regex sur le YAML donnait un faux vert.** Les commentaires de
  documentation contiennent deja les mots `needs` et `build` : un test textuel
  « le YAML mentionne-t-il needs ? » annoncait un contrat tenu qu'il ne
  verifiait pas. Le garde ne lit donc QUE l'arbre reellement parse, par un
  **parseur YAML reel** (`js-yaml`, resolu par essais et non recopie a la main :
  le nom affiche dans une console peut mentir sur le nom installe), et il
  **rougit au lieu de simuler** si aucun parseur exploitable n'est disponible.
- Les deux regles verrouillees, chacune acquise par MESURE et non par
  supposition (motifs graves dans l'en-tete du script) :
  1. `e2e-test.needs: [build]` — le harnais d'opacite Motion lit
     `dist/index.html` et demarre en `NODE_ENV=production`. Prouve en RETIRANT
     l'artefact (`mv dist .hold && npx playwright test` → rougit sur
     « dist/ absent »), pas en le laissant trainer dans l'arbre local.
  2. `npx playwright install --with-deps` — seul `motion-animation.spec.ts`
     exerce le fixture `page` (la suite historique n'utilise que `request`, qui
     ne lance **aucun** navigateur). Mesure dans un conteneur `node:22`,
     `dist/` construit sur place pour ne pas confondre les deux causes :
     sans install `rc=1` · `install` seul `rc=0` **puis le spec `rc=1`** ← le
     point qui compte, `install --with-deps` `rc=0` et les 32 tests passent.
- La regle 2 n'est pas applinee aveuglement : le garde **detecte les fixtures
  reellement destructures** (`page`/`browser`/`context` vs `request`). Renommer
  un spec ne peut donc pas faire disparaitre la dependance, et un suite 100 %
  `request` n'exigerait pas l'install des navigateurs.
- ⚠ **Un garde qui ne mord pas ne vaut rien.** Test negatif, 4 fautes injectees
  dans des copies isolees (`/tmp`, `node_modules` symlinke) : retirer
  `needs: [build]`, retirer `--with-deps`, falsifier l'artefact `dist/`,
  debrancher `verify:ci` du YAML. Les 4 → `rc=1` avec le check fautif nomme.
  Un garde jamais essaye en faute est une decoration.
- ⚠ **Deux dependances invisibles localement, desormais verrouillees par le garde**
  (lecture du lockfile, pas de lintention) :
  1. `js-yaml` etait un **emprunt a l'arbre transitive** d'`electron-builder`
     (via `app-builder-lib`/`builder-util`/`dmg-builder`, tout en `dev`).
     `npm ci` l'installait par chance et non par contrat : il suffisait qu'un
     ancetre devienne `optional` pour que le job `lint` rougisse sur
     `npm run verify:ci` sans qu'AUCUN test local ne puisse le voir. Corrige
     pour de vrai : `js-yaml` est declare en `devDependencies` (`4.3.2`, la
     meme revision que le lockfile) et le garde verifie desormais qu'il est
     **declare**, pas seulement qu'il est present dans `node_modules`.
     Prouve par test negatif : retirer la declaration => `rc=1` sur le check
     `parseur YAML DECLARE dans package.json`.
  2. les **binaires natifs x64** du build. Le `package-lock.json` est genere sur
     ARM64 ; si une entrees `*-linux-x64*` disparait, `vite build` casse en CI
     (`MODULE_NOT_FOUND`) alors que tout est vert ici. Le garde recense les 5
     entrees du lockfile ET les 5 declarations en `optionalDependencies`. Prouve
     par test negatif : supprimer `lightningcss-linux-x64-gnu` du lockfile =>
     `rc=1` sur le check `lockfile: binaires natifs x64 presents`.
  Piege rencontre en ecrivant ces checks : `!('node_modules/' + n) in pkgs`
  n'est PAS `!(cle in pkgs)` -- la precedance fait de `!chaine` un booleen puis
  le compare par `in`, donc le check etait **toujours vert** (un PASS creux,
  exactement ce que ce projet refuse). La forme correcte parente l'expression
  ENTIERE : `!(('node_modules/' + n) in pkgs)`. Seul le test negatif revele un
  check creux -- `node --check` ne voit pas la precedance.

- Le garde tourne dans le job **`lint`** (et non `e2e-test`) : il doit pouvoir
  rougir **avant** qu'on paie l'install des navigateurs. Choix verifie par probe
  et non suppose : `npx playwright test --list` rend `rc=0` et enumere les 32
  tests meme avec `PLAYWRIGHT_BROWSERS_PATH` pointe sur un repertoire vide —
  l'enumcration des specs ne lance pas de navigateur.

### 4.10 Un job e2e rouge etait AVEUGLE : la preuve n'etait pas collectee
Le pipeline #2833166731 a rendu un job en echec **sans aucune trace
exploitable** : impossible de dire pourquoi sans reproduire. Cause structurelle,
et non un hasard : `e2e-test` ne declarait **aucun** `artifacts`, donc GitLab
jetait `test-results/` au moment meme ou il devenait utile.

- **Le mot qui decide est `when: always`.** Par defaut GitLab ne collecte les
  artefacts que si le job reussit — le defaut est donc exactement l'inverse de
  ce qui sert. Sans lui, declarer `test-results/` ne change rien sur un rouge.
- **Encore faut-il que Playwright PRODUISE quelque chose.** Verifie par sonde
  (un test volontairement faux, une fois sur `request`, une fois sur `page`) :
  sans reglages, un echec ne laisse qu'`error-context.md` (799 o) et **rien de
  visuel** ; avec `screenshot: 'only-on-failure'` + `trace: 'retain-on-failure'`
  + `outputDir: 'test-results'`, un echec du fixture `page` laisse
  `test-failed.png` (4 254 o) + `trace.zip` (4 394 o, rejouable) + `error-context.md`.
  La trace se rejoue ensuite hors GitLab, ce qui rend le debuggage possible sans
  acces au runner.
- Ces reglages ne coutent rien a la suite historique : elle n'utilise que le
  fixture `request`, qui ne lance **aucun** navigateur, donc ni capture ni trace.
  Le seul spec qui paie est celui du harnais Motion — celui dont on a besoin.
- Les trois regles sont desormais **verrouillees par le garde** (`verify:ci`,
  17 → 20 checks) et les trois **mordent** (test negatif : retirer `when: always`
  du YAML, retirer les `paths`, retirer les reglages du config → `rc=1` avec le
  check fautif nomme a chaque fois).
- ⚠ Le garde a failli etre **creux** a l'ecriture : `!('node_modules/' + n) in pkgs`
  n'est pas `!(cle in pkgs)` — la precedance fait un booleen puis un `in` sur
  autre chose, donc le check etait **toujours vert**. `node --check` ne voit pas
  ca (syntaxe seule). Un PASS qui ne peut pas etre un FAIL n'est pas une mesure.

### Etat des portes (10 sept., HEAD Sprint 4.11)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **38** ·
  `npx playwright test` : **33** (le KPI de main d'oeuvre est entre) ·
  `npm run build` : ok (chunk d'entree inchangé).
- 6/6 preuves de contrat vertes : `verify:perf` 13/13 (**p95 stats = 4,6 ms**, la
  route corrige est reste sous le seuil) · `verify:http` 17/17 · `verify:sse` ·
  `verify:ratelimit` 5/5 · `verify:bundle` 6/6 · `verify:ci` **20/20**.
- Preuves propres a la phase (hors suite, lancees a la main) :
  `scripts/probe-labor-cost-zero.py` (ROUGE avant le correctif / VERT apres),
  `scripts/mutation-test-labor.py` (5/5 mutations mordent),
  `scripts/probe-index-installe.py` (les DEUX index posés, chaque branche PLEINE),
  `scripts/negative-test-verify-indices.py` (le nouveau garde du harnais d'index
  mord : rc=1 en nommant la requete fautive).
- Nouveaux fichiers : `test/e2e/kpi-labor-cost.spec.ts`,
  `scripts/{probe-labor-cost-zero,mutation-test-labor,probe-forme-filtre,
  probe-index-reel,probe-join-stats,negative-test-verify-indices}.py`.
  `scripts/__pycache__/` est desormais gitignoré.
- ⚠ Deux sondes (`probe-index-staffday.py`, `probe-nplus1.py`) portent desormais
  un bandeau « NE PAS SE FIER AU VERDICT » en tete : elles sont gardees comme
  preuve de la faute de methode, pas comme reference. La regle qui en sort, et
  qui vaut pour toute future decision d'index : rejouer la requete que le CODE
  EMET (branches d'un UNION ALL comprises) sur des donnes dans la forme que
  l'ECRITURE de l'app produit, et exiger un plan PLEIN par branche.

### 4.9 Le parseur YAML etait un emprunt transitive (dependance invisible)

### 4.11 Le KPI « cout journalier » etait faux chez le client (et l'index
### instalé en payait la moitie)

**Le defaut, prouvé par execution et non par lecture.** Le tableau de bord rend
`dailyLaborCost: 0` en permanence. Sonde sur le serveur REEL du client (port 4173,
base `promo_resto/udata`, le 2026-09-10) : **6 vacations saisies pour ce jour**
dans `staff_schedule`, reponse `{"dailyLaborCost":0}`. La cause est un desaccord
de cle entre l'ecriture et la lecture :

- `POST /api/staff` (`src/routes/staff.ts:72`) ecrit `day = dayOrDate` **et**
  `date = dayOrDate` avec la MEME valeur, et l'appelant (`StaffPlanning.tsx`,
  `UI_TO_EXACT_DATE`) lui passe des **dates ISO** → la base du client a
  `day='2026-09-16'`, `date='2026-09-16'`, et **0 rangee** portant un nom de jour ;
- `src/routes/dashboard.ts` filtrait `WHERE staff_id = ? AND day = ?` avec
  `daysOfWeek[new Date().getDay()]` = `"thursday"`.

Le filtre ne pouvait donc jamais rien rapporter. Aucun test ne le voyait : le
test e2e existant (`test/e2e/routes.spec.ts:102-107`) verifie la FORME du JSON
(`typeof body.totalStockValue`) et le `CRUD staff` assert sur `staff.ts` —
**la requete du KPI n'est exercee par aucun test**. Un test qui lit un fichier
source au lieu de rejouer le comportement est un faux negatif.

**Le correctif, arbitré par mesure et non par gout.** Trois formes de filtre
comparees a 150 001 rangees, ABBA echauffe, contre un oracle Python independant
(`scripts/probe-forme-filtre.py`) :

| forme | p50 | plan | justesse |
| --- | --- | --- | --- |
| `staff_id=? AND date=?` seul | 0,148 ms | index PLEIN | **FAUX** (rate les bases heritees) |
| `(a) OR (b)` | 140,14 ms | `SEARCH (staff_id=?)` | juste |
| **deux SELECT `UNION ALL`** | **7,57 ms** | index PLEIN des deux cotes | juste |

L'`OR` est un piége silencieux : il empeche SQLite d'exploiter la **seconde**
colonne d'un index composite (le predicat `date` tombe du plan) — 18,5 fois plus
lent, pour un resultat **identique**. Le `UNION ALL` est retenu. Garde ajoute au
passage : `start_time`/`end_time` sont NULLables au schema, et `''.split(':')`
produit un `NaN` que `JSON.stringify` serialise en `null` — le KPI se vide sans
aucune erreur serveur.

**Le consensus du 09/09 etait moitie faux, et corrige.** Il consignait
« `staff_schedule(staff_id, day)`, +86,7 % RETENU ». Sa sonde semait `day` avec
des **noms de jour**, la ou l'app ecrit `day = date = "<ISO>"` : elle a installe
un index sur la colonne de la branche RARE en laissant la branche CHAUDE sans
index. Re-mesure de la requete reellement emise (`scripts/probe-index-reel.py`) :

| etat d'index | p50 du tour complet |
| --- | --- |
| aucun | 548,6 ms |
| `(staff_id, day)` seul — l'etat instalé | 83,7 ms |
| `(staff_id, date)` seul | 6,9 ms |
| **les DEUX** | **0,159 ms** (les 4 etats rendent le MEME compte de lignes) |

Soit **527x** devant l'etat precedent, pour un cout d'ecriture mesure de
+0,0009 ms/insertion (le planning s'ecrit a la main, pas par webhook). Les DEUX
index sont instalés dans `src/db/init.ts`, `IF NOT EXISTS` (idempotence obligee:
la migration tourne a chaque demarrage sur les bases deja livrées).

Le harnais fautif est **repare a la source** et non contourne :
`scripts/ab-indices.py` seme desormais les DEUX formes (`ISO/ISO` et
`NOM/NULL`) avec des **colonnes nommees**, et son nouveau garde rougit si une
requete du bench ne rapporte **aucune ligne** — le « refuse par mesure (+0,4 %) »
du 09/09 etait precisement un scan vide chronometré.

**La forme N+1 est gardee, decidee et non supposee.** Remplacer la boucle par une
jointure (41 declarations → 1) ne gagne que **0,11 ms/tour** une fois l'index en
place (0,144 vs 0,034) : sous tout seuil decisionnel, pour un changement qui se
paie en risque de faute. Le premier verdict « jointure −12,3 % » etait un artefact
(seed a 0 ligne + predicats differents entre les deux bras).

**Preuves attacheses.** `scripts/probe-labor-cost-zero.py` : sonde de regression
comportementale sur copie de la base reelle du client (8 checks, ligne de base lue
AVANT injection, contre-controle negatif, jour voisin exclu, branche heritee,
creneau vide ≠ NaN) — **rouge avant le correctif, vert apres**.
`scripts/mutation-test-labor.py` : 5 fautes injectees dans des COPIES isolees
(`node_modules` symlinké), **les 5 mordent** (rc + le check vise nomme) ; la
falsification des DEUX index laisse la sonde **verte**, ce qui prouve que l'index
est une optimisation et non la source de la justesse. Deux de mes propres checks
avaient ete rattrapes par ce harnais (fragments de nommage qui ne correspondaient
a aucun libelle reel ; une mutation qui creait un 500 et faisait tout rougir, ce
qui ne prouvait plus le garde vise).

### 7.6 Les quatre portes de perf/SSE/cache jugoient QUI REPOND, pas leur instance

Decouverte en relisant les sources, pas par un rouge: `verify:sse`, `verify:perf`,
`verify:http`, `verify:ratelimit` tiennent chacun un **PORT FIGE** (4126-4129) et
attendoient leur serveur sur `r.ok` **sans confronter le jeton d'instance**.
`server.ts` rend `COOKDRIVE_INSTANCE_TOKEN` (sinon son propre `crypto.randomUUID()`),
et `scripts/probe-instance-guard.mjs` chasse deja la meme classe de faute pour les
SPECS e2e — mais pas pour ces quatre portes, que `verify:all` comte comme vertes.
Un `server.ts` orphelin (fils qu'un harnais a laisse vivre, ou serveur d'un AUTRE
projet du poste: `ps` en montroit sept, dont deux de `Stefan/Volt-App-main`) repond
sur le port et le harnais le juge comme etant le sien.

Correctif: les quatre attestent desorais sur l'en-tete (`pret` exige le jeton
ATTENDU), separent la cause « instance PERIMEE » (ce n'est pas MON serveur) de
« serveur pas pret », et **sortent en dur** (`process.exit(1)`, et non le
`setTimeout(..., 200)` qui pouvoit laisser le compte continuer).

Preuve de morsure: `npm run verify:instance-mord-harnais`
(`scripts/probe-garde-instance-harnais-mord.py`) — **12/12**, par porte:
`control VERT / faute imposteur ROUGE + cause nommee / restaure VERT`, avec un
vrai faux serveur qui repond un AUTRE jeton. Sortie de la branche faute:
`ECHEC instance PERIMEE sur le port 4126 : l'en-tete dit « imposteur-... », ce
harnais attend « verify-ratelimit »`.

Trois fautes d'harnais rattrapees PAR CES PROPRE CONTROLES, a retenir:

1. **Le jeton mis a cote de l'objet `env` au lieu de dedans.** `spawn(..., {env:
   {...}}, COOKDRIVE_INSTANCE_TOKEN: ...)` en fait un champ d'options IGNORE par
   le fils: le serveur retombait sur son `randomUUID` et la porte **rougissot sur
   SON PROPRE fils** (`l'en-tete dit « 84f0cc30-… », ce harnais attend
   « verify-perf »`). C'est la branche `control (attendu VERT)` qui l'a dit — le
   controle sans faute est ce qui empeche un harnais casse de crier « la mutation
   mord ». Verifie depuis par octets: `dedans_env=True, hors_env=0`.
2. **Un predicat a nommure inverse est un bug qui ne rougit pas.** `liberer(port)`
   retournait `connect() != 0`, donc `not liberer()` etait vrai quand la connexion
   REUSSISSOT: l'attente « imposteur en place » pouvoit se satisfaire d'un port
   LIBRE. Renomme `port_pris()` + semantique droite.
3. **« Le port est occupe » n'est pas « c'est mon imposteur qui y est ».** Le
   predicat d'imposteur etait satisfait par n'importe quel detenteur, **y compris
   le fils du run precedent** que `child.kill("SIGTERM")` (le wrapper `tsx` laisse
   un petit-fils) n'avoit pas encore tue: l'imposteur ne pouvot pas binder, et la
   porte jugeait le fils rémanant — qui porte, lui, le BON jeton. Verdict
   rendu: « la mutation ne mord pas » (**11/12**), pour une faute d'harnais. La
   correction n'est pas de toucher au garde: c'est `jeton_sert(port)` (l'IDENTITE
   de ce qui répond) + `attends_port_libre()` avant d'installer l'imposteur + un
   `srv.on("error")` qui fait MEURIR l'imposteur sur `EADDRINUSE` (sans lui il
   restot vivant sans servir, et le harnais croisait binder). Le garde, lui,
   n'a jamais eu tort: **il a fallu l'imposteur manuel pour le savoir**, et le
   verdict `12/12` dit que « ne mord pas » etait mien.

Ne PAS mettre cette porte dans `DEFAUT` de `run-all-gates.py`: elle relance
ELLE-MEME les quatre portes et exige les ports LIBRES, ce qui est exactement la
condition de contention qu'un lot séquentiel produit (fils residuel) → rouge
flou. Elle se lance seule. Le contrat general est le meme que pour l'instance:
**un PASS rendu par une instance qui n'est pas la tienne n'est pas une mesure.**



