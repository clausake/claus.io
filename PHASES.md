# CookDrive — Journal des phases & continuité

> Ce fichier documente l'état du projet et ce qui reste à faire, pour la
> continuité du travail (y compris changement de modèle/cerveau : Qwen → DeepSeek).

## Stack
- Electron + React 19 + Vite + Tailwind
- Backend Express (Node) **monolithe** : `server.ts` (~4 666 lignes, ~60 routes)
- Frontend **monolithe** : `src/App.tsx` (~14 535 lignes, 20+ composants)
- `epicure.ts` : matching fuzzy ingrédients (edit distance) + chargement des embeddings
- SQLite locale, IA via **Ollama** (`localhost:11434`)

## Phases terminées (MERGÉES dans `main`, commit de référence `00e5194`)

### Phase 0 — Sécurisation licence + hardening serveur
- **Licence RSA asymétrique** : le SALT en clair est remplacé par une **clé publique**
  dans le binaire. La **clé privée** reste hors du bundle. Impossible de forger une
  clé d'unlock sans la privée. (`verifyLicenseKey` dans server.ts)
- **Suppression des "shadow files"** : l'app n'écrit plus la date d'installation
  dans de faux fichiers de télémétrie système (`Microsoft/CLR_v4.0/UsageLogs`,
  `INetCache/Content.Telemetry`, `~/.local/share/systemd/timers.log`,
  `Library/Caches/com.apple.Safari/SafeBrowsing/metrics.plist`, etc.).
  La date vit uniquement dans SQLite (`app_license`).
- **Middleware de licence déplacé au TOP** de `startServer()` : couvre 100 % des
  routes `/api/*` (l'ancien était contournable — posé après ~40 routes).
  Bloque les mutations (POST/PUT/DELETE/PATCH) si trial expiré + non unlocké.
- **helmet() + rate-limit global** sur `/api` (300 req / 15 min).
- **Multer durci** : `limits` (25 Mo max, 5 fichiers) + `fileFilter` (refus
  exécutables/scripts).
- Fix TS : cast `db.all()` (erreur `unit does not exist on unknown`).

### Phase 1 — Hygiène du dépôt + déps mortes + outil de licence
- **Renommage propre** des fichiers de données (plus d'espaces ni `(1)/(2)`),
  avec update des refs dans `epicure.ts` :
  - `embeddings.safetensors` → `embeddings.chem.safetensors`
  - `embeddings (1).safetensors` → `embeddings.cooc.safetensors`
  - `embeddings (2).safetensors` → `embeddings.core.safetensors`
  - `epicure_core (1).csv` → `epicure_core.csv`
  - ⚠️ Les 3 `.safetensors` ne sont **PAS** des doublons (md5 distincts) :
    ce sont 3 ensembles d'embeddings distincts (chem / cooc / core).
- **Git LFS** sur les binaires lourds (PDF guides + screenshots) via `.gitattributes`.
- **Retrait des dépendances mortes** : `@google/genai`, `jsdom`, `puppeteer`,
  `@aws-sdk/*`, `cors`.
- **CI** : `lint` (tsc) passé en `allow_failure:false`.
- `.gitignore` : `backup.zip`, `*.pem` (clé privée licence), `.lfs_cache`.
- **`scripts/sign-license.cjs`** : outil pour générer une clé d'unlock valide
  (signature RSA du `machineId` avec la clé privée).

## ⚠️ Fix CI crucial (à retenir)
Le `package-lock.json` est généré sur environnement **ARM64** (GB10). Il ne
contenait que les binaires natifs `arm64`. Le runner GitLab étant **x86_64**,
`vite build` échouait (`MODULE_NOT_FOUND` dans `rollup/dist/native.js`, puis
`lightningcss`). **Fix** : ajout des binaires natifs **x64** (+ darwin/win) de :
`@rollup/rollup-*`, `lightningcss-*`, `@esbuild/*`, `@tailwindcss/oxide-*`,
`@napi-rs/canvas-*` en `optionalDependencies` de `package.json`, puis
régénération du lock. Sans ça, le CI casse à chaque regen de lock sur ARM.

## 📌 À protéger (hors Git, volontairement)
- **Clé privée RSA de licence** : `/tmp/cookdrive_license_private.pem`
  (récupérer et ranger dans un coffre/vault). Jamais commitée.
  Pour générer une clé : `node scripts/sign-license.cjs <machineId> <cheminCléPrivée>`

## 🔐 Accès
- Repo : `https://gitlab.com/cookdrive-group/cookdrive-project`
- Token GitLab (clausake) : scope `read_repository` + `write_repository`
  (pas `api` → ne peut pas créer/merger des MRs via API, uniquement Git clone/push)

## 🚧 Phase 2 — EN COURS (architecture)
Objectif : rendre le projet **maintenable** (ne PAS toucher l'UI/esthétique).

> **État au 28 août** : point 1 (découpage `server.ts`) est **largement fait**,
> point 4 (tests + CI) est **en place**, point 3 (`strict`) est **activé**.
> Seul le point 2 (découpage `App.tsx`) reste à faire.
> ⚠️ **Le lint (`npx tsc --noEmit`) passe clean** à cet instant (0 erreur).

### 1. Découpage `server.ts` — ✅ FAIT
- `server.ts` : 4 666 → **151 lignes**. Ne fait que : express + middlewares
  globaux (helmet, json, rate-limit), init SQLite (`src/db/init.ts`), état
  licence, `app.use(router)` × 21, servir le frontend (vite dev / dist prod),
  écouter le port.
- 21 routeurs dans `src/routes/` : admin, ai, antiwaste, backup, dashboard,
  documents, epicure, haccp, health, inventory, licensing, menuplanning, menu,
  recipes, robots, search, settings, staff, supplierprices, suppliers + (les
  plus gros : menu 32 Ko, documents 21 Ko, haccp 18 Ko, recipes 11 Ko).
- Squelettes communs extraits :
  - `src/db/init.ts` (init + tables + migrations, 14 Ko)
  - `src/services/` (paths.ts, settings.ts)
  - `src/shared/` (fuzzy.ts, ollama.ts, upload.ts, util.ts)
  - `src/middleware/license.ts`
  - `src/prompts/menuPrompts.ts` (les ~30 prompts LLM)
- Dernier WIP corrigé : `supplierprices.ts` — le `fuzzyMatch` de
  `import-analyze` a été typé (`InvItem[]` + `bestMatch: InvItem | null`) pour
  être propre sous `strict`. Pattern à réappliquer ailleurs si on retombe sur
  des `never`/`any` : typer l'arg + la variable `bestMatch`.

### 2. Découpage `src/App.tsx` — ✅ FAIT (commit `b5acf35`)
- `App.tsx` : 10 559 → **934 lignes** (routing + état global uniquement).
- 13 vues extraites dans `src/components/` (un fichier par vue) :
  - `MenuAnalysis.tsx` (1753), `FichesTechniques.tsx` (2348),
    `DocumentManager.tsx` (1238), `InventoryAudit.tsx` (1231),
    `SettingsView.tsx` (945), `DashboardOverview.tsx` (550),
    `AntiWaste.tsx` (390), `ProductionPlan.tsx` (375),
    `CulinaryChat.tsx` (226), `RobotManagement.tsx` (180),
    `QualityControl.tsx` (158), `LandingPage.tsx` (47), `NavItem.tsx` (46)
- 7 helpers extraits dans `src/lib/helpers.tsx` (256 lignes) :
  `MediaDisplay`, `getSupplierForIngredient`, `gerer_flux_culinaire`,
  `translateIngredientHelper`, `translateAlertMessage`,
  `getCostModifier`, `getIngredientEffectivePrice`
- Barrel `src/components/views.ts` pour les imports centralisés.
- `HaccpModules.tsx` : import `MediaDisplay` déporté de `../App` → `../lib/helpers`.
- Données déjà dans `src/data/` : `translations.ts` (3676), `menuData.ts` (141),
  `ingredientTranslations.ts` (172).

### 2 bis. Lazy loading des 4 vues restantes — ✅ FAIT (Sprint 3)
`Haccp`, `Purchasing`, `EpicureStudio`, `StaffPlanning` étaient encore imports
statiquement dans `App.tsx` (→ chunk principal). Passés dans
`src/components/lazy-views.ts` comme les 11 autres.
- Chunk `index` : **866 → 712 kB** (gzip 268 → 231 kB) puis **676 kB** (gzip 218)
  apres extraction de `papaparse` + `qrcode.react` en chunks vendors.
- 16/16 vues sont desormais code-splittees ; le chunk principal ne reste lourd
  que de ses vendors (`react-dom` 525 kB, `motion-dom` 337 kB, `framer-motion`
  120 kB) — pas de win possible sans changer de lib d'animation.
- Outil ajoute : `scripts/build-analyze.mjs` (build avec sourcemaps) +
  `scripts/analyze-bundle.mjs` (top 25 modules d'un chunk via le sourcemap).

### 3. `strict: true` — ✅ ACTIVÉ (relâché)
- `tsconfig.json` : `"strict": true`. Mais `noImplicitAny: false` et
  `noImplicitThis: false` restent OFF : les `: any` existants (≈140 dans
  App.tsx) ne provoquent pas d'erreur. Le lint passe.
- Si on veut durcir plus tard : remettre `noImplicitAny: true` et dépiler les
  `: any` un routeur/App par App (le lint flaggera).

### 4. Tests + CI — ✅ EN PLACE
- `vitest.config.ts` + `test/unit/` (utils partagés : safeJsonParse, prix,
  matching flou, modèle Ollama).
- `playwright.config.ts` + `test/e2e/` (CRUD inventaire, licence, dashboard,
  HACCP). Serveur démarré via tsx sur port isolé.
- `.gitlab-ci.yml` : stages `verify` (lint + build) et `test`
  (unit-test vitest + e2e-test playwright).

## 🚧 Prochaine étape (pour le prochain chat)
> **Phase 2 + 6 améliorations post-Phase 2 + UI/UX Sprint 1 & 2 + Sprint 3
> (perf/coverage) terminés** (6 sept.).
> La CI est verte. Le code est maintenable, testé, et le design system est formalisé.

### UI/UX Sprint 3 — perf bundle + couverture API (6 sept.)
1. **Lazy loading des vues restantes** (voir « 2 bis » ci-dessus) : chunk
   principal 866 → 676 kB, gzip 268 → 218 kB.
2. **Couverture e2e des 6 routeurs orphelins** : `settings`, `ollama/status`,
   `supplier-prices` (CRUD + comparaison + garde 404), `admin/db-download`,
   `admin/guide-download`, `ai/chat`. Suite e2e : **13 → 27 tests**, tous verts.
   - ⚠️ `/api/agent/command` reste **non couvert** : il demarre un Chromium
     `headless:false` (pas de display sur le runner). Le couvrir sous xvfb dans
     un job dedie, pas dans cette suite.
   - Les tests `ollama/status` et `ai/chat` acceptent les **deux** branches
     (Ollama present ou absent) : le contrat verifie est « repond un statut
     explicite + un corps exploitable », pas la presence du modele.
3. **Dérive de doc corrigee** : le compte e2e etait annonce a 11 (reel 27), les
   `:any` a ~176 (reel 183).

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

## Sprint 5 — Refermer la chaine logistique (10 sept.)

### 5.1 Du plan de menu au stock : `besoin → commande → reception`

**Le defaut de la chaine, mesure et non raconte.** `GET /api/purchasing/forecast`
recopiait `besoin_recettes: 0` pour CHAQUE ligne sans jamais lire `menu_planning`.
La colonne « Besoin Recettes » du tableau Achats et la suggestion de commande
(`minStock - quantity + besoin_recettes`) ne dependaient donc d'AUCUN plan : le
cuisinier qui prepare le service du lendemain voyait une colonne a 0 et
commandait a l'oeil. C'etait de l'affichage, pas du metier.

Le besoin calcule desormais, par article : **SOMME sur les plats planifies de
(couverts x gramature par personne) / (rendement/100)**, sur la fenetre
`[aujourdhui, aujourdhui + horizon]` (horizon borne, defaut 14 j, `?horizon=`).
Deux conventions **decisionees** et non heritees :
- la fenetre **part d'aujourdhui** et non du seul jour courant : la base du client
  a ses plats en J+1..J+6 et RIEN au jour du jour (un besoin calibre sur le jour
  courant eut commande 0) ;
- l'**horizon est borne** : sans luy, un planning saisi sur trois semaines
  eut commande trois semaines de stock d'un coup.
La reponse passe de `tableau` nu a `{ items, window }` : le `window` est la piece
qui rend le chiffre **verifiable** (« besoin sur 14 jours a partir du … ») au lieu
d'un nombre sans origine.

**Les couverts vivaient dans `recipe_json`** (il n'y a PAS de colonne `couverts`)
et la voie d'ecriture les rendoit illegibles, par deus fautes de la famille « cle
dissociee entre ecriture et lecture » (la meme que `dailyLaborCost`, 4.11),
debusquees par le test et non par la lecture :
1. `MenuAnalysis` envoie `recipe_details` ; la route ne lisait que `recipe_json`
   → la colonne restait `null` pour toute saisie venue de l'ecran.
2. **Pire** : `JSON.stringify(recipe_json)` re-serialiait une deïa serialisée. Un
   seul parseur rend alors une **chaine**, dont `.couverts` est `undefined`, et les
   couverts retombent a **1** : le besoin sort divise par le nombre de convives
   (**120 au lieu de 2 400** pour 20 couverts x 120 g) — un chiffre plausible et
   faux, sans aucun rougitrement possible a l'ecran ni dans les logs.
Corrections : `normalizeRecipeJson()` (les deus noms de champ acceptes, **ne
re-stringifie pas**) ; `coversOf()` relit par ailleures le double-encodage DEJA
present dans les bases livrees (tolerance de la donnee legacy, pas cache de la
faute). Le « contre-controle » (ligne legataire) du spec est ce qui donne a la
mutation M5 de quoi rougir : sans luy, la mutation etait un no-op sur des
donnees fraiches et le harnais annoncait « ne mord pas » pour une faute qui etait
ailleurs.

**Le bon enregistroit le NOM au lieu de l'`inventory_id`** (`Purchasing.tsx` :
`items.map(i => ({ inventory_id: i.name, … }))`). Le document se cree, son detail
aussi, tout reste **VERT** et la jointure d'inventaire est creuse : le jour ou
quelqu'un valide ce document, l'`UPDATE inventory … WHERE id = <nom>` ne touche
AUCUNE ligne, sans la moindre erreur serveur. `POST /api/purchasing/order` resout
donc chaque ligne contre `inventory` et fait rougir une **400** si l'une ne resout
pas (`unknown_items` est rapporte) : la route est le contrat de la cle.

**La chaine s'arrestait au PDF : aucun chemin du bon vers le stock.** Le
cuisinier imprimait, rangeait, et devoit ressaisir la facture dans l'autre vue
pour que le stock bouge. Nouvelles routes : `GET /api/purchasing/orders` et
`POST /api/purchasing/orders/:id/receive`.
- **Idempotence** : une ligne deja receue en totalite n'est PAS recomptee
  (double-clic ou retry reseau ; le statut **reste** `RECEIVED`, donc rien ne
  rougit a l'ecran sans le garde).
- Le statut se juge sur le **solde cumule** et non sur le lot du coup : un no-op
  ne doit pas retrograder `RECEIVED` en `PARTIAL`.
- La reception **n'escrit pas** `unit_price` ni `supplier_prices` : le prix est la
  verite de la FACTURE, pas celle du bon. Les deus voies se battaient le meme
  champ et la derniere gagnante eust fausse le cout matiere pour des mois.

**Deus gardes ajoutees a `POST /api/documents/:id/validate`** (lui aussi un
mouvement de stock) : un document **deja valide** est refuse (409) — sans luy, un
double-clic sur « Valider » additionnait la marchandise **deus fois** ; un
`COMMANDE` **ne se valide pas** (409, liste blanche des types validationables) —
un bon porte des quantites *prevues* et non receues, validee par megarde puis
receptionnee il additionnait deus fois. Et cote UI, `handleValidate` avoit un
`if (res.ok)` **sans branche d'echec** : un refus ne faisoit RIEN a l'ecran, le
cuisinier cliquoit, rien ne bougeoit, il recliquoit — une route qui refuse doit
se **dire** (`toast` du message du serveur).

### 5.2 La vue (un panneau manquant est un echec, meme si les gates numeriques passent)

`Purchasing.tsx` : onglet « Reception » (badge de compte), detail des lignes
(designation, quantite commandee, recue) et bouton « Receptionner » derriere un
`ConfirmDialog` (point d'`alert()`). Le badge « hors inventaire » se juge sur
**`in_stock`** — la colonne qui dit la verite metier, et non sur
`inventory_id IS NULL` : une cle **peut** estee posee (le bon a ete cree quand
l'article existoit) et ne plus rien resoudre depuis. Pareillement, une ligne dont
l'article a quitte l'inventaire ne sera **jamais** receptionnable : la laisser
compter dans le solde, c'est un bon qui reste `PARTIAL` tousjours et qu'on ne peut
plus cloturer ; elle reste signalee a l'ecran et son `received_quantity` reste vide.

### 5.3 Mesures, preuves et pieges (le detail)

**Index** (`scripts/probe-index-forecast.py`) : `DATE(col)` est **non sargable** —
gain mesure **−0,6 %** (l'index ne peut pas s'appliquer sous une fonction). La
variante sargable donne un plan **PLEIN**
`SEARCH mp USING INDEX ix_menu_planning_date (date>? AND date<?)` (+67 %). Le filtre
porte DONC **les deus predicats** (mesme arbitrage que `staff_schedule` a deus
index) : l'un indexable pour la vitesse (p50 0,136 → 0,084 ms a 1 040 lignes),
l'autre en `DATE()` pour la justesse sur une date heritee non zero-paddee
(`'2026-9-15'` seroit exclu en comparaison binaire : un plat planifie qui ne
commande rien).

**Installe, pas degrade** (`scripts/probe-index-forecast-installe.py`, 14 checks) :
l'index existe en base, le plan l'exploite avec le predicat **plein**, la requete
emise rapporte des lignes (point de scan vide), `recipe_json` est du JSON lisible.

**Base reelle du client** (`npm run verify:forecast`, 9 checks, **aucune donne
semee**) : copie via `sqlite3.backup()` (WAL !), oracle Python independant, 9
articles avec un besoin non nul. ⚠ **Les compteurs de la graine mentent** : sans
`con.commit()`, la connexion qui a insere voit ses 1 040 rangees (verdicts VERTS)
et une connexion rouverte n'en voit AUCUNE — le bench rendoit des millisecondes
sur un scan vide. Le contre-controle par **seconde connexion** est desormais
obligatoire.

**Preuve negative** (`npm run verify:purchasing`) : **9/9 mutations mordent**
(rc=1 + le check vise nomme). Pieges rencontrez :
- un motif **recopie a la main** qui ne correspond plus laisse la mutation SANS
  EFFET tout en annoncant un verdict → les motifs sont derives par regex et le
  **compte d'occurrences est exige** (M3 : les deus bornes, la paire) ;
- une mutation qui declenche un **500 general** fait rougir TOUT le test et ne
  prouvait plus le garde vise → les mutations sont **semantiques** et non
  syntaxiques, la requete doit rester vivante ;
- elargir **une seule** des deus bornes est un **no-op voulu** (defence en
  profondeur) : la mutation porte sur la PAIRE ;
- **ports** : un port figure a la main + `kill(SIGTERM)` = le run suivant juge une
  instance **perimee** qui n'a pas la source mutee → la mutation ne rougit pas
  (rc=0 facte) et le harnais annonce a tort « ne mord pas ». Le port est **demande
  a l'OS** (`listen(0)`) et le run attend que l'OS l'ait rendu.

**Le harnais lui-meme** : `test.beforeAll` attendoit la **mort** du serveur
(`serveurFini = await new Promise(...)` resolu a l'`exit`) → hook timeout a 90 s
garanti ; et `const BASE = \`…${PORT}\`` evalue au niveau module **figeoit** `PORT`
a 0 → le port est ephemere, la base est assignee apres.

**La page blanche** (`scripts/diag-page.mjs`) : un test qui juge le **rendu** doit
demarrer en `NODE_ENV=production`. En dev, la CSP (`script-src 'self'`) bloque le
script *inline* de react-refresh, React n'entre pas, `#root` reste a 0 enfant :
`boutons: 0` en dev contre `boutons: 1` en production. Le harnais Motion avoit deja
consigne ce reglage ; le consignaire du nouveau spec l'a oublie, d'ou un faux
negatif qui accusoit l'onglet d'estre absent.

**Selecteurs** : les libelles portent l'accent circonflexe (« Réception ») et le
badge colle un chiffre au nom accessible (« Réception1 »). Un
`getByRole({ name: /Reception/ })` **sans accent** ne matche RIEN ; avec accent et
en recherche partielle, il matche AUSSI « Réceptionner ». La selection se fait donc
par DOM (`querySelectorAll` + `textContent`) et le **dialogue** se reconnait a son
**titre** — les deus boutons s'appellent « Réceptionner », le dialogue a un titre
unique (`closest('[role=dialog]')`).

### 5.4 Le harnais peut mentir : l'instance que le test juge n'est pas celle qu'il a lancee

`verify:purchasing` a rendu **8/9** dans un lot de sept portes lancees d'une
seule chaine, M5 (le re-parse du double-encodage) etant signale « ne mord pas ».
M5 mord. Verifie hors lot (sonde ponctuelle : `Expected: 840 / Received: 120`
sur le check K de la ligne double-encodee), puis deux passes seules du harnais :
**9/9** chaque fois. Le 8/9 etait un verdict rendu sur une instance que le test
n'avoit jamais chargee. Deux causes jumeaux, toutes deux dans l'infrastructure
de test et non dans le produit :

1. **Translacion silencieuse du port.** `server.ts` faisait `PORT++` sur
   `EADDRINUSE` sans rien dire. Un harnais qui IMPOSE un port pour juger une
   source MUTEE voyait donc son serveur partir ecouter un cran plus loin, pendant
   que le harnais interrogeoit le port impose — c'est-a-dire AUTRE chose.
   Preuve accidentelle saisie pendant la sonde : le serveur herite de
   `promo_resto` (qui demandoit `PORT=4173`) a fini **ecoute sur 3000**.
2. **Verdict sans source.** `res.ok` sur `/api/settings` prouve qu'UN serveur
   repond sur ce port ; il ne prouve pas que c'est le notre. Le port est demande
   a l'OS (`listen 0`) puis **referme** : entre le test et le `spawn`, n'importe
   qui peut le reprendre.

Le defaut est le pire de sa classe parce qu'il est **bidirectionnellement
silencieux** : un VERT comme un ROUGE peuvent etre rendus par une instance qui
n'a pas la source jugee. Un harnais de mutations qui annonce « cette faute est
indetectable par ce test » sur une telle instance est une AFFIRMATION FAUSSE, et
chaque decision prise dessus (ici : retirer la mutation M5 du harnais, ce que sa
premiere version avoit fait) est corrompue en amont.

**Corrections** (production + harnais, meme commit) :

- `server.ts` : un port **Explicitement demande** (`PORT` dans l'environnement)
  est un contrat. Plus de glissement : `process.exit(1)` en nomant la cause.
  Le defaut 3000, lui, garde le glissement (sinon `npm run dev` et Electron
  meurent au moindre port occupe — c'est le cote ou de la regle, prouve).
- `server.ts` : chaque reponse porte `X-Cookdrive-Instance`, pose par un
  middleware Monte AVANT `compression` (donc avant tout octet tamponne ; le flux
  SSE le rend aussi, verifie sur le fil). Jeton fourni par l'appelant via
  `COOKDRIVE_INSTANCE_TOKEN`, sinon genere (UUID) pour le diagnostic.
- `purchasing-chain.spec.ts` : la boucle d'attente confronte l'en-tete au jeton
  qu'elle a elle-même fourni, et **rougit immediatement** sur une divergence (le
  comparer a `null` rendu par une instance absente, et au jeton de l'intrus).
  Patienter ne rend jamais l'intrus plus conforme. Le message distingue desormais
  « instance perimee » de « serveur pas pret » — le premier est un defaut
  d'harnais, le second un defaut de produit.

**Deux sondes nouvelles, exposees en npm** (une par comportement critique) :

- `npm run verify:instance-guard` (`scripts/probe-instance-guard.mjs`) — **14/14**,
  chaque regle dans ses DEUX directions : identite rendue (200, route inconnue,
  flux SSE), identite generee et DISTINCTE entre deux instances, mort prononcee
  sur port impose + l'instance legitime tient toujours son port, et glissement
  tolere quand personne n'a demande le port.
- `npm run verify:instance-mord` (`scripts/probe-instance-garde-mord.py`) —
  **3/3**. C'est la preuve que le garde MORD : bras A controle (sans intrus, le
  spec est VERT — un controle rouge rend l'experience nulle, les deux bras
  jugeroient du vide) ; bras B garde armee, un intrus tient le port, le spec
  ROUGIT et NOMME « instance perimee » ; bras C garde DESARMEE (la confrontation
  retiree, exactement l'etat historique du fichier), le MEME scenario devient un
  **faux VERT**. Sans le bras C, le B ne pruve rien : un setup casse imite un
  garde qui mord. Ce qui discrimine, c'est la PAIRE B/C sur un scenario identique.

Pieges rencontres et consignes, pour les memoriser :

- **Ne jamais conclure d'un seul passage d'un harnais dans un lot.** Un
  `verify:*` rendu dans une chaine de sept portes partagees ne dispose pas des
  memes conditions d'isolement que seul. Avant de retirer une mutation au
  pretexto « elle ne mord pas », la rejouer SEULE et exiger le meme verdict ;
  a defaut de accord, la reiteration est la premiere regle des preuves.
- **La premisse d'une sonde n'est pas sa conclusion.** `probe-instance-guard`
  refusait de tourner si un TIERS tenoit deja le port 3000 — or « 3000 est
  occupe » est la premisse recherchee, non sa negation. En l'etat, la sonde
  produisoit un faux negatif et accusoit le produit a tort.
- **Une copie d'arbre n'est pas un clonage.** `os.makedirs(join(dst, rel))` et
  non `join(WORK, rel)` : WORK est la racine, dst le miroir de l'arborescence
  courante. Construit au mauvais niveau, le `copy2` suivant meurt d'un `ENOENT`
  sur un chemin parfaitement existant — un faux diagnostic de l'arborescence.
- **Un `fetch` n'est pas une `APIResponse` de Playwright.** `res.status` est une
  PROPRIETE (undici) et non une methode : appelee, elle jette un `TypeError` que
  le `catch` d'en bas avale, et l'attente tourne jusqu'au expiration du delai en
  rapportant un faux « serveur pas pret ».
- Les caracteres estranges ont une existence, donc des droits : un commentaire
  redige en UTF-8 peut porter des idees en CJK (U+5360, U+636E observes dans
  cette sonde) qui ne se voient pas a l'ecran. Detector par dump de codepoints
  (`ord(ch) > 0x2FFF`), jamais a l'oeil.

### Etat des portes (11 sept., HEAD Sprint 5.3 — garde d'instance)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **38** tests (5 fichiers) ·
  `npx playwright test` : **35 passed** (1 worker, 18,3 s — relire le de compte,
  un rc seul ne prouve pas qu'un test ait execute) · `npm run build` : ok.
- 10/10 preuves vertes, verdicts LUS et non inferes : `verify:perf` (p95 stats
  4,1 ms) · `verify:http` · `verify:sse` (latence capteur->client 6 ms) ·
  `verify:ratelimit` (429 a la 151e ecriture) · `verify:ci` **20/20** ·
  `verify:indices` · **`verify:purchasing` 9/9** (le 8/9 du lot etoit un faux
  negatif d'infrastructure) · **`verify:instance-guard` 14/14** ·
  **`verify:instance-mord` 3/3**.
- `verify:http` 5a confirme que le middleware d'identite, monte avant la
  compression, n'a pas reintroduit la tamponnade sur le flux SSE.

### Etat des portes (10 sept., HEAD Sprint 5.1)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **38** ·
  `npx playwright test` : **35** (deus nouveaux specs) · `npm run build` : ok.
- 10/10 preuves vertes : `verify:perf` (p95 stats 3,7 ms) · `verify:http` ·
  `verify:sse` · `verify:ratelimit` · `verify:bundle` · `verify:ci` **20/20** ·
  `verify:indices` · **`verify:purchasing` 9/9** · **`verify:forecast` 9/9** ·
  `probe-index-forecast-installe` **14/14** (+ `probe-put-yield`,
  `probe-index-forecast`).
- Nouveaux fichiers : `test/e2e/{purchasing-chain,reception-view}.spec.ts`,
  `scripts/{mutation-test-purchasing,probe-forecast-real,probe-index-forecast,
  probe-index-forecast-installe,probe-put-yield,diag-page}.{py,mjs}`.
  Nouveaux scripts npm : `verify:purchasing`, `verify:forecast`.

### Sprint 5.2 — la suite logique de la logistique (pour le prochain chat)
1. **Reception ligne par ligne** : l'UI ne poste que `{ received: [] }` (tout ou
   rien). Le champ `received_quantity` est prest ; il faut un input par ligne et la
   saisie des quantites reellement receues (livraison partielle : 3 kg sur les 5
   commandes).
2. **Reliquat / stockage** : `inventory` n'a point de date de perequemption consolidee
   avec la consommation reelle. Rapprocher `dlc`/`dluo` du `besoin_recettes` pour
   eviter le surstockage et le sous-stockage (pertes et dechets).
3. **Balance agee** : `document_items.received_quantity` n'est point controle contre
   la quantite commandee ; prevoir un ecart de reception tolere (avoir).

### Etat des portes (9 sept., HEAD Sprint 4.8)
- `npx tsc --noEmit` : 0 erreur · `vitest` : **38** · `playwright` : **32** ·
  `npm run build` : chunk d'entree **591.11 kB**.
- 7/7 preuves de contrat vertes : `verify:bundle` · `verify:http` ·
  `verify:perf` · `verify:sse` · `verify:ratelimit` · `verify:indices` ·
  **`verify:ci` 14/14** (nouveau, expose en script npm et branche dans `lint`).
- ⚠ Piege d'outillage rencontre pendant cette phase : les literals d'octets
  Python `b'...\xe9'` ne sont **pas** de l'UTF-8 (`\xe9` est l'octet latin-1
  isol de « é » ; l'UTF-8 est `\xc3\xa9`). Un tel octet rend le YAML
  **illisible** par tout parseur et par `git diff`, et l'erreur ne se voit ni a
  l'ecran, ni dans l'editeur : seul `bytes.decode('utf-8')` (ou le launch du
  job) la revele. Les fichiers contenant des accents sont donc ecrits par
  l'interpreteur en texte UTF-8 (`open(..., encoding='utf-8')`) et **verifies
  par re-decodage**, jamais par un literal d'octets.

### UI/UX Sprint 1 (commit `6fe1c44`)
1. **Design tokens @theme** : surfaces (4), texte (4), accent émeraude unique,
   statut (ok/warn/danger/info), catégories menu, ombres (3 niveaux).
   `brand-*` = alias d'`accent-*` (migration progressive).
2. **Lazy loading** : 11 vues en `React.lazy` + `Suspense`.
   Chunk index : 1081 → 860 kB (314 → 266 kB gzip). 11 chunks de vues séparés.
3. **A11y fixes** : `text-slate-550` (inexistant) → `text-text-faint`,
   plancher typographique 10px (`.text-caption`), focus ring global `:focus-visible`,
   `prefers-reduced-motion: reduce`.
4. **LED unique** : 4× `card-active-*` (120 lignes) → 1× `.card-led` via
   CSS variable `--led` + `color-mix()`. Variantes amber/blue/purple en 1 ligne.

### UI/UX Sprint 2 (✅ FAIT)
Selon `UI-UX-PROPOSALS.md` (section 3, propositions UX-2 à UX-8) :
1. **Toasts empilables + ConfirmDialog** (UX-2) : ✅ 51 `alert()` + 4 `confirm()`
   remplacés. `ToastProvider` dans `src/components/ui/Toast.tsx`,
   `ConfirmDialog` pour les suppressions (inventaire, fiches, capteurs, tarifs, docs).
2. **Composants `ui/`** (UX-8) : ✅ `Button.tsx`, `Modal.tsx`, `Input.tsx`,
   `Badge.tsx`, `Skeleton.tsx`, `Table.tsx`, `Toast.tsx` dans `src/components/ui/`.
   Barrel `index.ts` pour les imports centralisés.
3. **Skeleton screens** (UX-3) : ✅ `<Skeleton>`, `<SkeletonTable>`, `<SkeletonCard>`
   dans `ui/Skeleton.tsx`. Inventaire : spinner → SkeletonTable.
4. **Ctrl+K + raccourcis** (UX-4) : ✅ `Ctrl/Cmd+K` = focus recherche,
   `Alt+1-9` = onglet sidebar, `Esc` = fermer dropdowns.
5. **Réduction glassmorphism** (UX-6) : ✅ `whileHover y:-5` retiré (KPI + cartes menu),
   `duration-500` → `duration-150` (19 occurrences), `backdrop-blur-xl/2xl` → `-md`.
6. **Modales/tableaux fenêtre étroite** (UX-7) : ✅ `Modal` responsive (max-w-3xl,
   max-h-90vh, plein écran <640px). `Table` avec `overflow-x-auto` + `min-width: 640px`.
   Header : recherche déjà `hidden md:block` (icône sur mobile).

### Optionnel (si on veut aller plus loin)
- Durcir `noImplicitAny: true` et dépiler les ~175 `: any` restants.
- Tests e2e sur les routes restantes (admin, ai, voice, agent/command).
- Code-splitting plus fin : dynamic import des sous-vues dans MenuAnalysis/FichesTechniques.

### Améliorations post-Phase 2 (commits `9332e80` → `???`)
1. **Tests e2e étendus** : 7 → 13 tests (recettes, staff, search, anti-waste,
   epicure, menu-planning ajoutés).
2. **Validation des inputs API** : `src/middleware/validate.ts` avec helpers
   `requireString`, `requireNumber`, `requireArray`, `optionalString`.
   Appliqué sur haccp/documents, recipes, staff, menuplanning.
3. **Logging HTTP** : `src/middleware/http-logger.ts` (chaque requête logguée
   avec durée, /health exclu) + `src/middleware/error-logger.ts` (helper logError).
4. **Code-splitting Vite** : `manualChunks` dans vite.config.ts — jspdf,
   html2canvas, recharts sortis du chunk principal.
   Chunk index : 1908 kB → 1081 kB (571 → 314 kB gzip).
5. **Backup automatique DB** : `src/services/db-backup.ts` — copie horaire de
   `agent_culinaire.db` dans `backups/`, rotation 5 derniers.
6. **Health check enrichi** : `/health` renvoie maintenant `dbSize` (Ko),
   `diskFree` (Go), `memUsed` (Mo) en plus des champs Ollama.

### Optionnel (si on veut aller plus loin)
- Durcir `noImplicitAny: true` et dépiler les ~176 `: any` restants.
- Ajouter des tests e2e sur les routes restantes (backup, admin, ai, robots).
- Code-splitting plus fin : dynamic import des vues lourdes (MenuAnalysis,
  FichesTechniques) pour ne les charger qu'à l'ouverture du tab.

## 🔙 Points de retour (Git)
- `a701e70` = état **original** (avant toutes modifs)
- Chaque phase a ses commits ; `git revert <sha>` pour annuler proprement.

## 🧠 Note de continuité (changement de modèle)
Le travail Phases 0+1 a été fait avec **Qwen3 32B**. La Phase 2 est reprise
avec **DeepSeek v4** (plus fort en coding). Ce fichier fait le lien : tout ce
qui est nécessaire pour reprendre est ici. Ne pas refaire Phases 0/1, elles
sont mergées. Commencer la Phase 2 au point 1 (découpage server.ts).
