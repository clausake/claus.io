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
