# CookDrive — Journal des phases & continuité

> Ce fichier documente l'état du projet et ce qui reste à faire, pour la
> continuité du travail (y compris changement de modèle/cerveau : Qwen → DeepSeek).

## Stack
- Electron + React 19 + Vite + Tailwind
- Backend Express (Node), **decoupe** : `server.ts` (258 lignes) + 20 routeurs branchés dans `src/routes/`
- Frontend : `src/App.tsx` (952 lignes, routage + etat global); les vues vivent dans `src/components/` (19 vues)
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
- 20 routeurs dans `src/routes/` : admin, ai, antiwaste, backup, dashboard,
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
- `App.tsx` : 952 lignes aujourd'hui (`wc -l`) — routage + etat global uniquement.
- 19 vues extraites dans `src/components/` (un fichier par vue) :
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

## Sprint 4 — Fiabilite du temps reel (8 sept.) -> `phases/sprint-04-sprint-4-fiabilite-du-temps-reel-8-sept.md` (33521 octets, 505 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 11 - HACCP: deux regles que le produit laissait au client, et un harnais qui contamine ses propres bras (16 sept.) -> `phases/sprint-11-sprint-11-haccp-deux-regles-que-le-produit-l.md` (7976 octets, 123 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 12 - Recettes: les portes entieres de la route qui gardait un 200 muet (19 sept.) -> `phases/sprint-12-sprint-12-recettes-les-portes-entieres-de-la.md` (7246 octets, 95 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 13.1 - Dashboard/stats: la DELTA du champ critigue au lieu d un nombre fige (20 sept.) -> `phases/sprint-13-1-dashboard-stats-la-delta-du-cham.md` (4038 octets, 69 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 13 - Dashboard: la route du creneau rendait une SEMAINE FACTICE sur zero ligne (20 sept.) -> `phases/sprint-13-sprint-13-dashboard-la-route-du-creneau-rend.md` (4809 octets, 80 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 10 - `verify:forecast` : une porte rouge qui ne jugeait rien, et un mode qui ment sur ses donnees (13 sept.) -> `phases/sprint-10-sprint-10-verify-forecast-une-porte-rouge-qu.md` (12755 octets, 222 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 9 - Les lignes a la creation: les DEUX portes restantes de `document_items` (13 sept.) -> `phases/sprint-09-sprint-9-les-lignes-a-la-creation-les-deux-p.md` (8650 octets, 155 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 8 - POST /api/inventory/consume : la route que personne ne jugeait (12 sept.) -> `phases/sprint-08-sprint-8-post-api-inventory-consume-la-route.md` (18292 octets, 300 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 7 - La colonne de prix fournisseur a TROIS portes d'ecriture, et une seule etait garde (12 sept.) -> `phases/sprint-07-sprint-7-la-colonne-de-prix-fournisseur-a-tr.md` (10493 octets, 167 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 6 - Le port de la fenetre et la voie d'ecriture d'inventaire, juges (12 sept.) -> `phases/sprint-06-sprint-6-le-port-de-la-fenetre-et-la-voie-d-.md` (9879 octets, 154 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 5 — Refermer la chaine logistique (10 sept.) -> `phases/sprint-05-sprint-5-refermer-la-chaine-logistique-10-se.md` (21920 octets, 339 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## 🔙 Points de retour (Git)
- `a701e70` = état **original** (avant toutes modifs)
- Chaque phase a ses commits ; `git revert <sha>` pour annuler proprement.

## 🧠 Note de continuité (changement de modèle)
Le travail Phases 0+1 a été fait avec **Qwen3 32B**. La Phase 2 est reprise
avec **DeepSeek v4** (plus fort en coding). Ce fichier fait le lien : tout ce
qui est nécessaire pour reprendre est ici. Ne pas refaire Phases 0/1, elles
sont mergées. Commencer la Phase 2 au point 1 (découpage server.ts).
## Sprint 14 - Audit du 20 sept. : deux portes que nul n'appelait, cinquante-sept routes sans garde, une ecriture muette (23 sept.) -> `phases/sprint-14-audit-du-20-sept-deux-portes-que-n.md` (3137 octets, 41 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 14.b - la voie bulk de l'auditeur : un 404 cru en succes, et deux ancres devenues ambigues (23 sept.) -> `phases/sprint-14-sprint-14-b-la-voie-bulk-de-l-auditeur-un-40.md` (3086 octets, 48 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 14.c - les trois generations de menu retirees, l'analyse conservee (24 sept.) -> `phases/sprint-14-sprint-14-c-les-trois-generations-de-menu-re.md` (3067 octets, 49 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 14.d - les fils detaches ne survivent plus a leur harnais (24 sept.) -> `phases/sprint-14-sprint-14-d-les-fils-detaches-ne-survivent-p.md` (5864 octets, 91 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 14.e - les orphelines jugees une a une, et cinq branchees (24 sept.) -> `phases/sprint-14-sprint-14-e-les-orphelines-jugees-une-a-une-.md` (4778 octets, 94 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 14.f - la porte D1 etait rouge une fois par nuit, et c'etait vrai (25 sept.) -> `phases/sprint-14-sprint-14-f-la-porte-d1-etait-rouge-une-fois.md` (12783 octets, 244 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15 - Cle en main LLM, choix OCR hors ligne (26 sept.) -> `phases/sprint-15-sprint-15-cle-en-main-llm-choix-ocr-hors-lig.md` (5613 octets, 95 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15.b - extraResources pose : le consigne de la tache 7 etait trop timide (26 sept.) -> `phases/sprint-15-sprint-15-b-extraresources-pose-le-consigne-.md` (1190 octets, 22 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15.c - le moteur de recherche de l'IA locale, et la porte au jumeau deterministe (26 sept.) -> `phases/sprint-15-sprint-15-c-le-moteur-de-recherche-de-l-ia-l.md` (3319 octets, 55 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15.d - le panneau Intelligence : le bouton Tester joue la vraie sonde, et la fuite de la clef est fermee au POST (26 sept.) -> `phases/sprint-15-sprint-15-d-le-panneau-intelligence-le-bouto.md` (5576 octets, 90 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15.e - l'assistant, le coffre, le juge OCR et le livrable juge sur piece (27 sept.) -> `phases/sprint-15-sprint-15-e-l-assistant-le-coffre-le-juge-oc.md` (5839 octets, 104 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.

## Sprint 15.f - le contrat d'extraction et la locale DECLAREE (taches 15-16) (27 sept.) -> `phases/sprint-15-sprint-15-f-le-contrat-d-extraction-et-la-lo.md` (5070 octets, 88 lignes)

> Archive verbatim. Ne pas relire sauf si un test, un verdict ou une consigne cite nommement ce sprint.


## Sprint 16.a - l'onglet Ingenierie des Menus devient le chat, les fiches se rangent en trois cartes (27 sept.) -> `phases/sprint-16-sprint-16-a-l-onglet-ingenierie-des-menus-de.md` (4166 octets, 68 lignes)
## Chantier 1 — Auth & identite : l'UI React, la garde de session et la page comptes du maitre (04/10)

### La decision jouee

Le chantier 1 s'ouvre sur le backend seul (9313f23) : 14 regles A/B/C jugees
par `verify:auth`, mais l'app rendait encore TOUT son metier a quiconque
chargeait index.html — l'API etait gardee, l'UI pas. Ce sprint ferme la
boucle : plus AUCUNE vue ne monte sans session, et la page comptes n'existe
que pour le maitre.

### Ce qui a ete ecrit

- `AuthGate.tsx` (141 l.) : la garde. Au boot, fetch `/api/auth/me` ; 401 ->
  fetch `/api/auth/etat` pour distinguer SETUP (0 user : ecran creation du
  compte maitre) de LOGIN (users existants : ecran connexion). Session
  expiree en cours de route -> retour login (session revoquee -> 401).
- `EcranIdentite.tsx` (138 l.) : setup/login en un ecran, lazy chunk dedie
  (c000e92 : index 492.7 ko < plafond 620 ko).
- `AccountsView.tsx` (306 l.) : la page comptes du MAITRE SEUL — liste,
  creation, reset mot de passe, desactivation, via `lib/cdFetch.ts` (le
  wrapper qui porte le signal de logout).
- `App.tsx:390` : `<AuthGate onUser={setUser}>` enveloppe l'app entiere ;
  LazyViews.AccountsView branche sur les entrees maitre (1005/1010).
- `routes/auth.ts` (f1a4f7d) : `/api/auth/me` rend un user de HARNAIS
  ({id: harnais, role: maitre}) sous `COOKDRIVE_AUTH_OFF=1` UNIQUEMENT — sans
  l'env, 401 AUTH_REQUISE conservee. Debloque les 15 specs e2e metier (qui
  bootent avec l'env) SANS affaiblir la porte verify:auth (qui juge SANS
  l'env, 14/14 rejoue). Au passage : `/api/auth/etat` etait DECLAREE DEUX
  FOIS par la recuperation du sandbox — la seconde etait morte, dedoublonnee.

### Les portes (toutes mesurees le 04/10)

- `verify:auth` 14/14 (3 runs) — la gate juge ACTIVE.
- `verify:routes` 46/46, `verify:reception` vert (voir piege ci-dessous),
  tsc 0 erreur, vitest 158/158, build 492.7 ko.
- CI VERTE pipeline 2916804006 sur e6c4482, poussee.

### Piege a retenir (2 h perdues)

`verify:reception` rouge avec « onglet Reception absent — boutons : [Creer
le compte maitre] » : on a soupconne la gate d'auth. Cause REELLE : le
conteneur n'avait PAS le chromium de playwright (executable absent, erreur
lancee avant meme le boot du serveur) — et l'ecran capture etait celui du
BUNDLE STALE d'avant c000e92. Remede : `npx playwright install chromium`.
Lecon : quand un spec e2e rend « le mauvais ecran », verifier d'abord que le
navigateur et le bundle dist/ sont du JOUR avant d'incriminer la logique.

### Nettoyage du 04/10

Supprimes du workspace (jamais versionnes, verifies par git log -- <chemin> :
aucun commit ne les a jamais portes) : le fichier `1` (un eval JS casse de la
veille du 26/09) et 50 probes .txt mortes (test/14e-*, test/14f-*,
test/gates-*, test/routes-*, etc.) — des journaux perissables qui n'avaient
rien a faire hors .gitignore. `git status` est PROPRE.
## Chantier 2 — Audit trail : la table audit_log, le helper logAudit et la porte verify:audit (07/10)

### La decision jouee

Le chantier 2 suit la feuille de route §8 : une table `audit_log` (actor_id,
actor_kind humain/agent, route, action, entite, timestamp, payload avant/apres),
UN SEUL point d'entree `logAudit()` et une porte `verify:audit` qui juge par
DELTA en base — pas par un rendu de route. La tracabilite HACCP (regl. (CE)
n°852/2004 art. 5) est obligatoirement tracee : temperature (A1), lots (A8),
nettoyage (A9), actions correctives (A10).

### Ce qui a ete ecrit

- `src/services/audit.ts` : `createAuditLogger(db)` ->
  `logAudit(req, res, {route, action, entite, payload})`. L'ecriture audit NE
  FAIT JAMAIS echouer la route metier (try/catch + console.error).
  `actorDe(res)` distingue humain/agent/harnais/anonyme — sous
  `COOKDRIVE_AUTH_OFF=1` (harnais e2e), actor=harnais pour que les contrats
  juges sous harnais ecrivent quand meme. `logAuditRacine()` + `setAuditDb()`
  pour les deux routeurs racine non factorises (settings/backup).
- `src/db/init.ts` : table `audit_log` (CHECK actor_kind IN
  humain/agent/harnais/anonyme, payload TEXT JSON, timestamp datetime('now'))
  + 2 index (ts, entite). Pas de purge automatique — la tracabilite sanitaire
  doit survivre aux mois d'exploitation.
- Les 20 routeurs branchements : 60 mutations couvertes (compte verifie :
  logAudit=60 sur 62 routes mutables ; les restantes, `POST
  /api/inventory/analyze`, `POST /api/recipes/scan` et `POST
  /api/supplier-prices/import-analyze`, sont des analyses IA SANS ecriture en
  base — une lecture n'est pas journalisee, sinon la table explose et l'audit
  ne dit rien). server.ts fabrique UN logger et le passe aux factories ;
  signature des factories mise a jour.
- `src/middleware/auth.ts` : la gate §8 pose le fondement chantier 3 —
  `ECRITURES_AGENT` (Set : /api/suggestions). L'agent reste refuse
  (403 AGENT_LECTURE_SEULE) sur TOUTE mutation hors ses futures ecritures.
- Les clefs secretes ne passent JAMAIS dans le journal : /api/clef journalise
  le FAIT du rangement (fournisseur seul), /api/settings journalise les NOMS
  de colonnes, pas les valeurs.

### La porte

- `verify:audit` (scripts/verify-audit.mjs) : juge le serveur REEL (spawn tsx,
  USER_DATA_PATH isole, port OS alloue, garde fantomes /proc). C1 les
  LECTURES n'ecrivent pas ; A1..A12 chaque mutation testee doit poser sa
  ligne audit (route+action+entite juges) : HACCP
  temperature/inventaire CRUD/recettes CRUD/fournisseurs/lot HACCP/nettoyage
  HACCP/action corrective HACCP/menu-planning/staff ; B1 actor_kind du jeu
  ferme ; B2 route posee sur chaque ligne. 27 checks, 3 runs verts
  consecutifs.
- `verify:audit-mord` (scripts/negative-test-audit.py) : la morsure — retire
  le logAudit de POST /api/staff, rejoue la porte, exige ECHEC sur A12, puis
  RESTAURE par git checkout (garde ARBRE_SALE : refuse de muter un arbre non
  propre). Branchable au lot apres le commit de ce chantier (elle exige un
  arbre propre par construction).
- `run-all-gates.py` DEFAUT : verify:audit ajoute APRES verify:auth.

### Verifie le 07/10

tsc 0 erreur, vitest 158/158, build 492.7 ko (< plafond 620), verify:audit
27/27 x3, verify:auth 14/14, verify:routes 46/46.

### Pieges a retenir

- `logAudit` journalise `req.path` : la valeur en base est le chemin REEL de
  la requette (`/api/inventory/1791377225272`), pas le gabarit de la route
  (`/api/inventory/:id`). La premiere version de verify:audit cherchait le
  GABARIT et rougissait a tort. La porte juge desormais par chemin reel — un
  journal qui porte le gabarit serait une reponse recitee, pas une trace.
- Le re-ancrage du 2d1b3c1 avait PROMIS le stub 16.a sans jamais l'ecrire :
  PHASES.md sur disque portait le segment chaud, l'ancre b68eac56 jugeait le
  recolle AVEC stub. Le disque etait dechire (la porte verify:split rougissait
  avec raison). Repare ici : stub pose + nouvelle ancre calculee par la boucle
  du juge. Leçon : une consigne « pose le stub » se VERIFIE par grep du stub
  avant le commit, pas par le sha du manifest seul.

### Morsure jouee (07/10, apres commit 2a13d09)

`verify:audit-mord` VERTE : la mutation (logAudit retire de /api/staff) fait
rougir A12 (`ECHEC A12 audit_log create staff`), la restauration git checkout
ramene l'arbre propre. La porte ne peut pas rester verte par hasard. Branchee
au DEFAUT du lot.
## Chantier 3 — Boîte de réception de suggestions : l'agent propose, l'humain exécute (07/10)

### La decision jouee

Le chantier 3 ferme la boucle §8 : l'agent (Hermes) a maintenant SA voie
d'ecriture — la table `suggestions` et rien d'autre. Il PROPOSE avec une
action PRE-REMPLIE (route + payload) ; le maitre APPLIQUE a SA signature
(la route cible est rejouee EN INTERNE par le serveur, le payload passe par
le contrat complet de SA route : validation, transactions, audit trail du
chantier 2) ou REJETE avec motif OBLIGATOIRE. Une suggestion ne touche
JAMAIS le metier elle-meme.

### Ce qui a ete ecrit

- `src/db/init.ts` : table `suggestions` (id, type, priorite basse/normale/
  haute, titre, explication, action_route, action_payload JSON, statut
  nouveau/applique/rejete, motif_rejet, applique_par, created_at, decided_at)
  + index statut.
- `src/routes/suggestions.ts` : POST /api/suggestions (agent ou maitre ; le
  staff est refuse STAFF_LECTURE_SEULE), GET libre + GET :id, POST
  :id/appliquer (MAITRE SEUL), POST :id/rejeter (MAITRE SEUL, motif requis).
- **Liste blanche ROUTES_CIBLES** : l'agent ne peut pas pre-remplir une
  action vers /api/unlock ou /api/users — la boite n'est pas une voie de
  contournement de la gate §8. Refuse a la CREATION (400 ROUTE_INCONNUE) ET
  a l'application (409 si la liste a bouge).
- `src/middleware/auth.ts` : l'exemption §8 `ECRITURES_AGENT` est ACTIVE
  (postait morte depuis le chantier 2, voir piege ci-dessous) — l'agent
  passe la gate sur /suggestions et NULLE PART ailleurs.
- L'application s'appelle LUI-MEME (fetch 127.0.0.1:PORT + le cookie du
  maitre) : la mutation reelle porte SA signature, journalisee dans
  audit_log par la route cible elle-meme. Une cible qui refuse laisse la
  suggestion 'nouveau' et NOMME le refus (CIBLE_REFUSEE + cible_corps) —
  pas de demi-succes.

### La porte

- `verify:suggestions` (scripts/verify-suggestions.mjs) : 25 regles sur le
  serveur REEL AVEC identite active (setup maitre, comptes agent/staff
  crees par le spec). A1 l'agent propose (201) ; A2/A3 anonyme et staff
  refuses ; A4 les payloads invalides et les routes hors liste blanche
  sont refuses NOMMES ; A5 la suggestion est relue en base ; B1 l'agent ne
  tranche pas (403) ; B2 l'application rejoue VRAIMENT la cible (DELTA
  temperature_logs avant/apres) + applique_par pose ; B3/B4 rejet avec
  motif obligatoire relu en base ; B5 deja decidee = 409 ; B6 une cible
  qui refuse laisse 'nouveau' ; C1 lecture libre ; D1 l'application est
  tracee dans audit_log.
- `verify:suggestions-mord` (scripts/negative-test-suggestions.py) : la
  morsure — vide la liste blanche ROUTES_CIBLES, rejoue la porte, exige
  ECHEC sur A4c, puis RESTAURE (garde ARBRE_SALE).
- `run-all-gates.py` DEFAUT : verify:suggestions ajoute APRES verify:audit-mord.

### Verifie le 07/10

tsc 0 erreur, vitest 158/158, build 492.7 ko, verify:suggestions 25/25
x2, verify:auth 14/14, verify:split vert (ancre recalculee).

### Pieges a retenir

- **La gate sessionGate est montee sous /api** : req.path y est RELATIF
  ("/suggestions"), pas absolu. La premiere version de ECRITURES_AGENT
  comparait a "/api/suggestions" — l'exemption n'a JAMAIS matche et
  l'agent etait refuse sur sa propre boite (403 AGENT_LECTURE_SEULE sur
  A1). Lecon : une exemption se PROUVE par la porte qui la juge, pas par
  sa lecture.
- Le harnais manipule les sessions via le jar de cookies : APRES un test
  avec session staff, la creation du compte agent doit SE RECONNECTER
  maitre, sinon POST /api/users rend 403 MAITRE_REQUIS et toute la suite
  du contrat tombe en cascade. Un echec en cascade sur un spec = chercher
  LA session qui fuit avant d'incriminer le produit.
- La DELTA B2 se juge sur la route cible REELLEMENT rejouee
  (/api/haccp/temperature -> temperature_logs), pas sur un compteur de la
  table suggestions : une application qui marquerait 'applique' sans
  rejouer la cible resterait un PASS creux.

### Morsure jouee (07/10, apres commit 5fad2b4)

`verify:suggestions-mord` VERTE : le check de la liste blanche neutralise
(`if (false)`) fait rougir A4c (`ECHEC A4c ... status=201`), restauration OK.
La boite ne peut pas redevenir une voie de contournement sans rougir.
Branchee au DEFAUT du lot.

## Chantier 6 — Portes des deux modes : COOKDRIVE_AGENT_OFF, la boucle §8 de bout en bout (07/10)

### La decision jouee

Le produit a DEUX modes depuis l'origine (§8). Le chantier 6 les rend JUGES :
- **Sans agent** : `COOKDRIVE_AGENT_OFF=1` (env de lancement, pas de harnais)
  ferme la boite de suggestions (404 MODE_SANS_AGENT — pas un 403, le mode
  n'a pas d'agent du tout) ET l'exemption §8 de la gate (un compte agent
  residuel ne peut RIEN ecrire, 403 partout). Le CRUD humain reste COMPLET :
  rien n'est degrade.
- **Avec agent** : la boucle §8 jugee de bout en bout avec un CERVEAU FACTICE
  DETERMINISTE — le spec joue l'agent par SA VOIE API reelle (login + POST
  suggestions), exactement ce qu'Hermes empruntera. JAMAIS de LLM reel en
  CI : le contenu de la suggestion est fixe, ce qui est juge est la BOUCLE
  (proposer -> trancher -> la cible rejouee), pas l'intelligence.

### Ce qui a ete ecrit

- `src/routes/suggestions.ts` : garde MODE_SANS_AGENT en tete de POST (404).
- `src/middleware/auth.ts` : l'exemption §8 est FERMEE quand AGENT_OFF=1
  (la condition s'inverse proprement : `agentAutorise = role === agent &&
  AGENT_OFF !== 1 && exempt`).
- `scripts/verify-mode-manuel.mjs` : 20 regles — M1 boite fermee, M2 le CRUD
  humain complet (inventory CRUD + recipes + suppliers + haccp temperature),
  M3 lectures libres, M4 l'audit trail ne depend pas du mode, M5 l'agent
  residuel refuse partout, M6 l'historique de la boite reste lisible.
- `scripts/verify-mode-agent.mjs` : 20 regles — A1 l'agent propose x3, A2
  il n'ecrit pas le metier (4 routes x 403), A3 il lit tout, B1 le maitre
  applique (DELTA temperature_logs), B2 rejette avec motif, B3 le staff ne
  tranche pas, C1 le staff garde son CRUD terrain, D1 propose/applique/
  rejete traces dans audit_log.
- `scripts/negative-test-modes.py` : les DEUX morsures — garde mode
  neutralise -> M1 rougit ; exemption morte -> A1a rougit. Restauration
  git checkout apres chaque (garde ARBRE_SALE).
- `run-all-gates.py` DEFAUT : verify:mode-manuel + verify:mode-agent
  (les morsures restent hors lot, jouees a la main comme les autres).

### Verifie le 07/10

tsc 0, verify:mode-manuel 20/20 x2, verify:mode-agent 20/20 x2, morsures
M1 + A1a rougissent, verify:all 0 rouge.

### Piege a retenir

- La premiere condition de la gate etait `agent && AGENT_OFF !== 1 &&
  !exempt` : avec AGENT_OFF pose, `false && ...` = JAMAIS 403 — l'agent
  passait le CRUD METIER en 200. La negation etait a l'envers : fermer
  l'exemption doit FERMER la voie, pas OUVRIR les autres. La forme correcte
  calcule `agentAutorise` (l'agent a le droit) et refuse quand il est faux.
- Une morsure qui retire une ligne `if (...) { return ...; }` casse la
  SYNTAXE (le bloc d'apres se retrouve dans le try/catch) — esbuild rougit
  AVANT le produit. La mutation doit rester syntaxiquement valide :
  `if (false) {` neutralise la SEMANTIQUE sans casser l'arbre.
## Chantier 4 — Moteur de surveillance : des règles déterministes vers la boîte de suggestions (08/10)

### La décision jouée

Le moteur de surveillance est un SERVICE PUR : des règles DÉTERMINISTES lisent
la base et produisent des propositions pré-remplies (route + payload) déposées
dans la boîte de suggestions (chantier 3). ZÉRO LLM ici — l'intelligence
viendra au chantier 5, la SURVEILLANCE est mécanique. Le moteur n'écrit
JAMAIS le métier (§8) : il propose, l'humain exécute.

### Les règles (chaque suggestion porte sa preuve dans l'explication)

- R1 **rupture imminente** : quantity <= minStock + marge_rupture (le seuil
  est une UNITÉ, pas un pourcentage : un minStock à 0 ne doit pas diviser).
- R2 **stock mort** : quantity = 0 sur un article à prix > 0 (valeur dormante).
- R3 **DLC proche** : batches.expiration_date <= J + jours_dlc (registre
  sanitaire, regl. (CE) 852/2004 art. 5).
- R4 **températures HACCP** : le DERNIER relevé de chaque equipment hors
  bornes [temp_min, temp_max] — le dernier ÉTAT est ce que l'humain doit
  voir, pas l'historique.
- R5 **anti-gaspillage** : les lots à DLC proche avec quantity > 0 regroupés
  en une suggestion 'menu'.
- **Déduplication par clé** (règle+objet+jour) à DEUX niveaux : la ROUTE
  lit les clés déposées aujourd'hui en base, le SERVICE filtre les doublons
  intra-scan. Une clé est préfixée dans l'explication ([cle] ...), format
  jugeable sans colonne supplémentaire.

### Les seuils du maître

`marge_rupture` (5), `jours_dlc` (3), `temp_min` (-20), `temp_max` (60) —
dans AppSettings, modifiables par POST /api/settings, relus par
GET /api/surveillance/seuils. Un seuil ABSENT reprend son défaut (jamais
undefined dans une règle). S9 juge que jours_dlc=30 élargit réellement le
périmètre (un lot J+10 passe de silencieux à alerté).

### Le scan

POST /api/surveillance/scan — MAÎTRE ou AGENT (son rôle §8 "SURVEILLE et
INFORME" : le scan n'écrit que dans SA table). STAFF refusé. Sous
COOKDRIVE_AGENT_OFF=1, l'agent perd le scan aussi. L'exemption gate
`/surveillance/scan` est ajoutée à ECRITURES_AGENT (chemin RELATIF — piege
du chantier 3 respecté).

### La porte

- `verify:surveillance` (scripts/verify-surveillance.mjs) : 24 règles —
  S1 anonyme/staff refusés ; S2..S6 chaque règle jugée par DELTA sur
  suggestions relu en base avec son action pré-remplie vérifiée ; S7
  déduplication (rejouer → 0 déposée) ; S8 le moteur n'a JAMAIS touché le
  métier (articles/lots/relevés semés INTACTS) ; S9 seuils configurables ;
  S10 seuils actifs lus ; D1 scan tracé dans audit_log. Le terrain est SEMÉ
  par l'API du dépôt, jamais à la main.
- `verify:surveillance-mord` (scripts/negative-test-surveillance.py) : la
  morsure neutralise le filtre de dédup de la ROUTE (S7a rougit :
  déposées=5 au second scan). Celle du SERVICE seul est masquée par la
  couche route (mesuré — voir piège).
- Au lot DEFAUT (verify:surveillance + verify:surveillance-mord), la règle 6
  exige les deux (capteur-orphelines rougit sinon).

### Vérifié le 08/10

tsc 0, vitest 158/158, build OK, verify:surveillance 24/24 x2, morsure S7a
rougit + restauration, verify:auth/suggestions/mode-manuel/mode-agent tous
verts (aucune régression).

### Pièges à retenir

- **La déduplication vit DEUX fois** (route + service) : une morsure sur le
  service seul est MASQUÉE par la couche route (S7a restait vert, mesuré).
  Le contrat juge le COMPORTEMENT de bout en bout — la morsure doit viser la
  couche qui fait la décision OBSERVABLE. Leçon générale : une morsure qui
  ne rougit pas peut vouloir dire que la mutation a été absorbée par une
  seconde couche de défense, PAS que la porte est morte.
- La morsure `if (false) {` : retirer une ligne `if (...) { return }` d'un
  bloc try/catch casse la syntaxe (esbuild rougit AVANT le produit) —
  neutraliser la sémantique, jamais l'arbre.
- Une suggestion déposée deux fois le même jour pour le même objet fait
  exploser la boite : la clé est dans le CONTENU jugeable ([cle] en tête
  d'explication), pas dans une colonne de plus — une migration de moins.

## Chantier 5 — Hermes cerveau outillé : contexte → consigne → LLM injecté → suggestions (08/10)

### La décision jouée

Le dernier chantier de la feuille de route : le cerveau de Hermes LIT le
produit et PRODUIT des suggestions. L'architecture suit la règle du
transport injecté (Tache 4, Sprint 15) : le service est PUR, le "cerveau"
(cerveau: consigne -> texte JSON) est INJECTÉ — **JAMAIS de LLM réel en
CI** (la porte injecte le cerveau factice déterministe), Ollama local en
production, un fournisseur de la liste blanche optionnel.

### Ce qui a été écrit

- `src/services/hermes.ts` (PUR, jugeable sans réseau) :
  - `construireContexte(db)` : le contexte lisible — schéma résumé +
    dashboard (articles/critiques/alertes/valeur) + rupture + DLC proches +
    dernières températures. Un appel SQL par famille, jamais un dump (budget
    de contexte du LLM, AGENTS.md "Limites").
  - `construireConsigne(ctx)` : le prompt système DÉTERMINISTE (jugé par la
    porte), qui exige le JSON des propositions.
  - `parseSuggestions(texte)` : la réponse LLM -> propositions VALIDÉES.
    Une route hors liste blanche est rejetée NOMMÉE (le LLM ne contourne pas
    la liste du chantier 3), un JSON illisible est un refus NOMMÉ.
  - `cerveauFactice()` : le cerveau déterministe — il lit le contexte encodé
    DANS la consigne et répond toujours pareil.
- `src/routes/hermes.ts` : POST /api/hermes/reflechir (maître ou agent ; le
  staff est refusé ; AGENT_OFF coupe l'agent) — construit le contexte,
  injecte le cerveau (factice sur demande du corps ou COOKDRIVE_HERMES_
  FACTICE=1, Ollama sinon), valide, dépose dans la boîte (dédup
  route+titre). LLM muet/jetable -> 502 CERVEAU_INJOIGNABLE, nommé.
  GET /api/hermes/contexte : le contexte PUR (lecture libre, l'UI le lit).
- `src/routes/suggestions.ts` : ROUTES_CIBLES EXPORTÉE — le chantier 5
  valide contre LA MÊME liste (une seule source de vérité).
  `/api/purchasing/order` ajoutée (elle existait mais était absente de la
  liste — mesure: la première exécution a rejeté route_inconnue).
- `src/middleware/auth.ts` : exemption §8 /hermes/reflechir (le cerveau
  n'écrit que SA table).

### La porte

- `verify:hermes` (scripts/verify-hermes.mjs) : 13 règles sur le serveur
  RÉEL — H1 anonyme/staff refusés ; H2 la boucle complète tourne avec le
  cerveau factice joué PAR L'AGENT (sa voie §8) ; H3 DELTA en base (les
  propositions de l'agent relues avec leur action pré-remplie) ; H4 la
  liste blanche est la même que la boîte ; H5 déduplication ; H6 le cerveau
  n'a JAMAIS touché le métier (terrain semé INTACT) ; H8 le contexte PUR ;
  H9 AGENT_OFF coupe le cerveau pour l'agent (SECOND serveur — l'env est de
  lancement, pas changeable à chaud) mais le MAÎTRE le garde ; D1 tracé.
- `verify:hermes-mord` (scripts/negative-test-hermes.py) : la morsure
  neutralise le compteur de déposition (`if (false) { deposees++; }`) ->
  H3a rougit. Restauration PROUVÉE (leçon chantier 4).
- Au lot DEFAUT (verify:hermes + verify:hermes-mord, règle 6).

### Vérifié le 08/10

tsc 0, vitest 158/158, build OK, verify:hermes 13/13 x2, morsure H3a
rougit + restauration OK, verify:suggestions/mode-manuel/mode-agent tous
verts (aucune régression), capteur-orphelines vert.

### Pièges à retenir

- **PORT=0 ne marche pas avec ce harnais** : le serveur bind un port
  aléatoire mais la boucle d'attente sonde le port ÉCRIT dans l'env — un
  env1.PORT écrasé APRÈS la création de l'objet faisait attendre la sonde
  sur le mauvais port (serveur "pas prêt" avec un serveur VIVANT ailleurs).
  Le port alloué est écrit dans env AVANT le spawn : une seule source de
  vérité. (Mesure du premier run : 40s perdues.)
- **rmSync AVANT openSync du stderr** : l'ordre inverse supprimait le
  répertoire sous le fd ouvert — le log restait vide et le diagnostic
  impossible (leçon héritée du chantier 6, rejouée ici).
- **ROUTES_CIBLES divergait de la réalité** : /api/purchasing/order existait
  dans suppliers.ts mais pas dans la liste — le cerveau factice proposait
  une action LÉGITIME et la liste la rejetait route_inconnue. La liste est
  maintenant exportée et partagée, mais l'inventaire des routes cibles doit
  être refait à chaque nouvelle route d'écriture.
- La morsure `if (false) await db.run(...)` casse la syntaxe esbuild
  (TransformError avant le produit) — même leçon que le chantier 6 :
  neutraliser la SÉMANTIQUE (`if (false) { compteur; }`), jamais l'arbre.
- Une égalité de ligne `l == ANCRE` sans rstrip("\n") ne matche JAMAIS
  (la ligne brute porte son retour chariot) — même piège que le chantier 4.

## Chantier 7 — Hygiène TypeScript : zéro :any au backend, la porte compteur (08/10)

### La décision jouée

La feuille de route §8 est close ; le "fond de liste" (AGENTS.md:123) est la
dette technique. Le chantier 7 attaque le SOCLE : les `:any` du BACKEND
(routes/services/middleware/db/shared) — le métier jugeable, là où un type
libre peut faire taire un contrat. Les composants UI (140 `:any`) restent
hors périmètre : ils ne jugent rien, ils affichent.

**Le seuil est un PAS, pas un mur** : `tsc --strict` d'un coup casse 3500
lignes d'UI sans que personne ne puisse relire. La porte juge le compteur
FIGÉ au niveau atteint (0 au backend) — un seuil ne peut qu'ÊTRE
RÉABAISSÉ par un commit qui l'accompagne, jamais augmenté.

### Ce qui a été écrit

- **22 `:any` backend typés, fichier par fichier** :
  - `db/init.ts` (2) : `cryptoMod: any = crypto as any` -> `cryptoMod = crypto`
    (le double cast était inutile, le module natif a les méthodes).
  - `haccp.ts` (4) : les maps SSE -> `StaleSensor` / `SensorReading` (les
    types existaient déjà dans sensor-hub.ts, ils n'étaient pas importés).
  - `health.ts` (2) : `statfs` casté vers sa forme réelle (pas dans tous les
    typages), `OllamaModelInfo` importé.
  - `inventory.ts` (5) : callbacks bulk/consume -> `unknown` + Record.
  - `menu.ts` (1), `recipes.ts` (4) : payload -> `Record<string, unknown>`.
  - `supplierprices.ts` (1) : interface `SupplierPriceGroup` extraite (le
    `Record<string, any>` des groupes de comparaison).
  - `suppliers.ts` (1) : `parsed: unknown` + accès `Record<string, unknown>`.
- **`verify:types`** (scripts/verify-types.py) : le compteur, avec les
  commentaires EXCLUS de la regex — la porte juge le code, pas la doc (au
  premier run, le commentaire « cast cible, pas any » de health.ts comptait 1).
- **`verify:types-mord`** : un `:any` réintroduit rougit. Au lot DEFAUT
  (règle 6), restauration prouvée.

### Vérifié le 08/10

tsc 0, vitest 158/158, build OK, verify:types 0/0, morsure rougit +
restauration OK, verify:routes 46/46, verify:hermes + verify:surveillance
verts (aucune régression), capteur-orphelines vert.

### Piège à retenir

- **Un compteur de regex compte les COMMENTAIRES** : `// cast cible, pas
  any` matchait `: any`... et rougissait le backend SAIN. La regex retire
  d'abord `/* ... */` et `// ...` — un juge qui lit la doc au lieu du code
  n'est pas un juge.
- Les `:any` des composants UI (140, dont 59 dans FichesTechniques.tsx)
  restent HORS périmètre : ils affichent, ils ne jugent pas. Les typer
  demanderait un chantier UI à part (les composants consomment des types
  inférés de la base, le chantier 8 le fera en découpant).
## Chantier 8 — Découpage de FichesTechniques.tsx : 2425 -> 1550 lignes, le modal extrait (08/10)

### La décision jouée

Le "fond de liste" (AGENTS.md:123) pointait FichesTechniques.tsx à 2425
lignes. Le chantier le découpe SANS changer le comportement : les portes
e2e jugent le même produit (verify:routes 46/46, verify:recipes 24/24,
verify:reception vert), le bundle est IDENTIQUE à l'octet près (492.70 ko —
le découpage ne doit rien coûter).

### La cartographie (mesurée avant de couper)

Cinq responsabilités identifiées dans les 2425 lignes :
1. **exportSingleRecipeToPDF** (l.243-317) : jsPDF/autoTable, PUR sauf
   `t`/`guestCounts`/`getIngredientEffectivePrice`.
2. **handleFileScan** (l.113-242) : OCR IA, couplé au state — RESTE dans le
   composant (son extraction demanderait un state manager).
3. **CRUD** (saveRecipe/handleSaveToBook/deleteRecipe/generateSteps) :
   fetches API, couplés — RESTENT.
4. **appartientDossier** (l.615-630) : PUR — extractible tel quel.
5. **Modal** (l.1508-2319) : 812 lignes de JSX, 15 deps comptées une à une
   par grep du bloc (et non devinées).

### Ce qui a été écrit

- `src/lib/fiches.ts` (144 l.) : `appartientDossier` (PUR, jouable au test)
  + `exportSingleRecipeToPDF` (le module reçoit `labels`/`guestCount`/
  `prixEffectif` en paramètres — il ne connaît ni React ni le composant).
  Le composant garde un wrapper de 6 lignes qui passe les deps.
- `src/components/RecipeModal.tsx` (876 l.) : le modal extrait. **ZÉRO state
  propre** — tout arrive en props, les handlers du parent passés tels quels.
  Le JSX est déplacé octet pour octet. `outerModalScrollRef` (le parent y
  reset le scrollTop) et `modalScrollRef` (interne) passent en props —
  l'effect de scroll du parent reste INTACT.
- FichesTechniques.tsx : 2425 -> 1550 lignes (-875), le state reste ENTIER
  chez le parent.

### Vérifié le 08/10

tsc 0, vitest 158/158, build 492.70 ko (identique), verify:routes 46/46,
verify:recipes 24/24, verify:reception vert, registre recipes
ANCRE_ES_ALL_VERT (les ancres ne citent pas le JSX déplacé), verify:all
82 portes 0 rouge.

### Pièges à retenir

- **Compter les deps par grep du bloc AVANT de couper** : le modal "utilise
  tout le composant" était une impression — le grep a rendu 15 deps exactes
  et a réfuté 8 supposées (expandedRecipes, cartItems, showNotification...
  n'y figurent PAS). Une extraction prop-par-prop inventée aurait cassé le
  build une fois sur deux.
- **Les refs du modal traversent la frontière** : `outerModalScrollRef`
  appartient au parent (l'effect y reset le scroll à l'ouverture) — le
  passer en props, pas le recréer, sinon l'effect du parent mute un ref
  que personne ne lit.
- **Le JSX déplacé octet pour octet** : la tentation de "nettoyer au
  passage" est le risque n°1 d'un découpage — les portes e2e jugent le
  rendu, un attribut perdu rougit ailleurs. Déplacer d'abord, nettoyer
  jamais (ou dans un commit séparé jugé séparément).
- Le gain est en LISIBILITÉ (1550 + 876 + 144 = 2570 lignes > 2425) : le
  découpage AJOUTE des lignes (props, imports) et gagne en responsabilité
  par fichier. Un chantier de découpage ne se juge pas au total de lignes.
## Chantiers 10a-10f — ZÉRO :any dans tout le src/ (13/10)

### La décision jouée

Après le backend (chantier 7, 22 `:any` typés, seuil 0) et le découpage UI
(chantiers 8-9), la dette `:any` restante était 100 % UI : 152 occurrences
réparties sur 14 composants + 4 dans lib/helpers + 2 dans App + 1 dans
translations. Le chantier les élimine TOUS sans changer le comportement :
les portes e2e jugent le même produit.

### La méthode (répétée fichier par fichier, preuve par les champs réels)

Pour chaque composant : grep des `:any` → lecture des champs réellement
accédés → interface nommée (jamais de type inline dupliqué quand le type
traverse une frontière) → compilation → gardes optionnels seulement là où
le type le révèle (jamais de `!` masquant un vrai bug).

### Interfaces créées (source unique par domaine)

- **Recipe / RecipeIngredient / CartItem / FicheScanneePayload /
  FicheIngredient** (FichesTechniques + RecipeModal + ProductionPlan) :
  la fiche molle issue d'OCR/chat/saisie — formes variables documentées
  (`nom OU name OU ingredient`, `qte OU quantite`).
- **StaffMember / Shift** (StaffPlanning) : planning hebdo.
- **Sensor / HaccpLog** (Haccp) + exports PDF types (HaccpModules).
- **PurchaseOrder / OrderItem / ForecastItem / ImportMatch /
  PriceHistoryEntry** (Purchasing).
- **Document / Item / UploadResult** (DocumentManager + DocumentUpload —
  type partagé exporté, pas dupliqué).
- **Optimisation** (RecipeModal) : conseil meilleur prix.
- **MediaDisplayProps / PricedIngredient** (lib/helpers) +
  `TRANSLATIONS: Record<string, Record<string, string>>`.

### Pièges à retenir

- **Object.values sur Record renvoie unknown[] dans cette config TS** :
  remplacé par `for (const k of Object.keys(obj)) { obj[k] }` — le typage
  traverse proprement (StaffPlanning calculateHours/Cost).
- **Le cast `{} as Record<K,V>` brouille l'inférence d'Object.entries** :
  annoter le reduce générique `reduce<Record<string, number>>((acc…`
  et laisser le cast `{}` tomber.
- **Un callback flèche qui rend du JSX ouvre avec `(`, pas `{`** :
  l'ouverture `{` + fermeture `),` compile un jour et casse le suivant
  (DocumentManager groupedDocuments).
- **Les index de Record refusent `undefined`** : `const rid = recipe.id || ""`
  dans le composant, puis `rid` partout (RecipeModal) — un seul point de
  garde, zéro propagation.
- **Le type partagé s'exporte, il ne se copie pas** : UploadResult vit
  dans DocumentUpload et DocumentManager l'importe — sinon les deux
  évoluent en divergent.
- **`e.message` sur unknown** : `e instanceof Error` (jamais `(e as any).message`).

### Vérifié le 13/10

tsc 0, vitest 158/158, build 483.58 ko (seuil 620 ko), verify:routes 46/46,
verify:recipes 24/24, verify:reception vert, verify:types ANY_BACKEND=0
(seuil 0), morsure negative-test-types OK (la porte rougit si un `:any`
revient), bundle < 620 ko.

### Le chiffre

`:any` dans src/ : 152 (composants) + 7 (lib/App/data) = **159 → 0**.
Sept commits poussés (10a → 10f), chaque fichier validé par les portes
avant le suivant.


## Chantier 11 — PORTE UNIQUE de génération LLM : le réglage devient effectif (14/10)

### La décision jouée

Le Sprint 15 avait construit la couche fournisseur (liste blanche 5 cloud,
sonde, transport injecté) mais les 12 routes métier appelaient
`ollama.generate()` DIRECTEMENT : le choix `llm_choix` des Réglages n'était
effectif qu'au DIAGNOSTIC (bouton Tester), jamais à la GÉNÉRATION. Le chef qui
choisissait Mistral générait encore sur Ollama sans le savoir — le réglage
mensonger est pire que l'absence de réglage.

### Ce qui a été écrit

- `src/shared/llm.ts` (porte unique) : `generer(DemandeGeneration)` lit
  `llm_choix` et dispatch — "ollama" (API native, vision, repli Tesseract),
  "llamacpp"/"vllm"/"openai-compatible" (adaptateur /v1/chat/completions
  UNIQUE : vLLM, llama.cpp-server, SGLang, LM Studio parlent tous cette API),
  fournisseur cloud de la liste blanche (base VERROUILLÉE par la liste,
  clef lue dans l'environnement SEULEMENT — dérivée du nom : OPENAI_API_KEY...).
- Erreurs NOMMÉES (LlmInjoignable : URL_ABSENTE, CLEF_ABSENTE, CLEF_REFUSEE,
  HTTP_xxx, generation muette) — jamais un 200 muet.
- vLLM (port 8000) rejoint PORTS_USAGE : détection auto au premier démarrage.
- 12 routes métier branchées : ai, hermes, recipes, documents, haccp, menu,
  inventory, antiwaste (+ health rend la cible active dans son message).
- La vision (images) supportée sur les DEUX voies : Ollama images[] natif,
  OpenAI-compatible messages[] multi-parties. Repli Tesseract conservé.

### Le piège du chantier

La VISION n'est pas uniforme : l'API OpenAI porte les images via
messages[].content multi-parties, Ollama via generate.images[]. L'adaptateur
unique masque cette différence — la route métier ne doit JAMAIS savoir.

### Vérifié le 14/10

tsc 0, vitest 158/158 (test ports mis à jour : 4 ports dont vLLM),
build 483.60 ko, verify:routes 46/46, verify:recipes 24/24,
verify:reception vert, verify:types 0 :any, verify:haccp 10/10,
verify:hermes vert. Le README reste vrai : Ollama par défaut, aucune donnée
cloud tant que le chef ne choisit pas un fournisseur de la liste.


## Chantier 12 — Juges de la porte unique LLM : la morsure du réglage effectif (14/10)

### La décision jouée

Le chantier 11 a écrit la porte (src/shared/llm.ts) mais n'avait AUCUN juge
dédié : si une future évolution réintroduisait le défaut historique (le
dispatch qui ignore `llm_choix`), aucune porte ne rougirait — le réglage
redeviendrait mensonger en silence. Un chantier sans juge est un chantier
à moitié fait.

### Ce qui a été écrit

- `test/unit/llm-porte.test.ts` (12 règles, transport réseau mocké — la
  règle du transport injecté) :
  1. llm_choix ABSENT = Ollama par défaut (nommé dans l'erreur)
  2. llamacpp sans URL = URL_ABSENTE, ZÉRO appel réseau
  3. llamacpp avec URL = POST /v1/chat/completions reçu (corps + modèle)
  4. vLLM licite (port 8000)
  5. cloud hors liste = HORS_LISTE_BLANCHE, zéro appel (rien n'a fui)
  6. cloud sans clef ENV = CLEF_ABSENTE
  7. clef en header Bearer + base VERROUILLÉE par la liste blanche
  7b. l'URL saisie ne peut PAS remplacer la base (anti evil-proxy)
  8. réponse muette = erreur nommée (jamais un vide rendu)
  9. vision multi-parties (image_url base64)
  10. MORSURE du contrat : deux réglages différents = deux serveurs appelés
  11. reglageActuel() jamais undefined

- `scripts/negative-test-llm-porte.py` (la morsure) : réintroduit le défaut
  historique DANS la porte (le dispatch force Ollama sans lire le réglage),
  exige que le test 10 ROUGISSE, restaure avec garde ARBRE_SALE. Le motif de
  mutation est l'ANCRE `export async function generer(...)` — l'ancre unique
  comptée avant mutation.

- `run-all-gates.py` : verify:llm-porte + verify:llm-porte-mord au lot DEFAUT.
  84 portes désormais (82 + 2).

### Le piège du chantier

La morsure d'une PORTE DE COMPORTEMENT (pas un compteur de texte) exige de
muter le CODE, pas une ligne : la mutation réécrit `generer()` pour forcer
Ollama. Le juge qui rougit doit être le test de contrat SPÉCIFIQUE (le n°10),
pas « n'importe quel test cassé » — un test qui casse pour une raison
indifférente n'est pas une morsure, c'est du bruit.

### Vérifié le 14/10

tsc 0, vitest 170/170 (158 + 12), build 483.60 ko, verify:llm-porte 12/12,
verify:llm-porte-mord MORSURE OK (arbre restauré), verify:all 84 portes
0 rouge. CI GitHub verte sur 53653f2 (chantier 11 suite).

## Chantier 13 — La barre latérale des onglets n'était PLUS RENDUE depuis le chantier 9 (15/10)

### Le défaut joué
`src/components/Sidebar.tsx` a été EXTRAIT d'App.tsx au chantier 9 (`9a0f7fb`,
« Sidebar extrait d'App.tsx (1030→781 l.) ») — mais jamais re-rendu : le
`<aside>` supprimé n'a pas été remplacé par `<Sidebar ... />`. Mesures du 15/10 :
`grep -n "Sidebar" src/App.tsx` ne rendait que 4 lignes, toutes `isSidebarOpen`
(56, 398, 401, 432) ; `git show 9a0f7fb:src/App.tsx | grep Sidebar` ne rend
aucune occurrence de `<Sidebar`. L'app a donc navigué des semaines par
RACCOURCIS CLAVIER seulement (Alt+1..), sans aucun onglet visible.

### Pourquoi aucune porte ne l'a vu
Les specs e2e n'empruntent PAS la barre latérale : `reception-view.spec.ts:284`
navigue par `Alt+6`, avec un commentaire qui dit « moins de dépendance à l'ordre
des éléments de la sidebar » — alors que la sidebar n'existait pas. Une porte qui
CONTOURNE un élément ne prouve pas cet élément.

### Ce qui a été écrit
- `src/App.tsx` : `<Sidebar … />` rendue à la place exacte du `<aside>` supprimé
  (juste avant l'overlay mobile), + son import. 18 lignes ajoutées, 0 retirée.
- `src/components/Sidebar.tsx` : `Lock` ajouté à l'import lucide-react (il était
  UTILISÉ ligne 245 mais jamais importé — voir le piège) ; `isUnlocked` rendu
  optionnel (il l'est dans App.tsx : `isUnlocked?: boolean`).
- `src/components/DashboardOverview.tsx` : la valeur par catégorie est arrondie à
  2 décimales (`195.95000000000002` → `195,95`).
- `public/screenshot-dashboard.png` : recapturée avec les 13 onglets visibles.

### Le piège du chantier — tsc est AVEUGLE aux noms qui collisionnent avec le DOM
`<Lock />` non importé et `npx tsc --noEmit` rendait **rc=0** : `Lock` est une
**interface de `lib.dom.d.ts`**, donc le nom EXISTE pour le vérificateur de types ;
à l'exécution c'est un `ReferenceError`. Latent car la bannière « Essai Terminé »
ne se rend que si l'essai a expiré. Contrôle mesuré : une sonde `<ZzzUndefined />`
ROUGIT (rc=2) — l'aveuglement ne porte donc que sur les collisions de noms
(Lock, Text, …), pas sur tout JSX. Deuxième leçon : `echo "rc=$?"` APRÈS un pipe
rend le rc du pipe (`head`), pas celui de tsc — le premier « tsc rc=0 » de ce
chantier était cette faute, remesurée sur fichier.

### Le piège de la capture — le contrat des champs, pas l'intuition
Deux recaptures montraient un stock à **0** parce que le semis envoyait
`min_stock` / `price` : le contrat est
`{name, quantity, unit, category, minStock, unit_price}` (`src/routes/inventory.ts:95,99`).
Idem factures : `/api/documents` refuse en 400 NOMMÉ toute ligne sans
`original_name` (`ligne_sans_designation`). Équipe : `/api/staff` attend
`schedule: {"<ISO>": [{start, end}]}` et le dashboard lit `staff_schedule` sur la
date du jour (`src/routes/dashboard.ts:86`).

### Vérifié le 15/10
tsc 0, vitest 170/170, build 492.97 ko (< 620), verify:routes 46/46,
verify:reception 1/1, verify:dashboard 7/7, verify:bundle TOUT PASS,
verify:split OK. Capture : `aside` présent, 13 onglets lus dans le DOM,
« Tableau de bord » ×2 (nav + en-tête), 0 erreur de page, aucune valeur
flottante non arrondie.

## Chantier 14 — La licence d'essai et les clés RSA sont RETIRÉES (15/10)

### La décision jouée
claus.io est publié sous EUPL-1.2 pour un usage professionnel GRATUIT. Le produit
gardait pourtant tout le dispositif d'essai : au bout de 30 jours,
`licenseMiddleware` refusait en 403 `TRIAL_EXPIRED` TOUTE mutation tant qu'une clé
RSA signée par l'éditeur n'était pas posée, et la sidebar affichait « Essai
Gratuit — Il vous reste {days} jours ». Un logiciel libre qui bloque ses écritures
derrière une clé de l'éditeur contredit à la fois sa licence et son README.
Décision du client : retirer ENTIÈREMENT (pas neutraliser).

### Fichiers SUPPRIMÉS
- `src/routes/licensing.ts` (GET /api/trial-status, POST /api/unlock)
- `src/middleware/license.ts` (le blocage 403 des mutations)
- `scripts/sign-license.cjs` (générateur de clés ; la clé privée restait chez l'éditeur)

### Ce qui a été nettoyé
- `src/db/init.ts` : `LicenseState`, `verifyLicenseKey()`, la clé publique RSA en
  dur, la table `app_license`, le machineId (dérivé des MAC) et l'`install_date`.
  `initDatabase()` ne rend plus d'état `license`.
- `server.ts` : les deux imports, `app.use("/api", licenseMiddleware(...))` et
  `licensingRouterFactory(...)`.
- `src/middleware/api-rate-limiter.ts` : la règle `path === "/api/unlock" → auth`
  et l'exemption `/api/trial-status`.
- `src/App.tsx` : états trial/unlock, le fetch `/api/trial-status`, `handleUnlock()`
  et l'écran plein « Période d'Essai Terminée » (2616 octets).
- `src/components/Sidebar.tsx` : les deux bandeaux (Essai Gratuit / Essai Terminé)
  et la prop `trialStatus`.
- `src/components/SettingsView.tsx` : la « Section Licence » (2926 octets),
  `fetchLicense()`, `handleUnlock()`.
- `src/data/translations.ts` : 12 clés × 5 langues = 60 lignes (trialEndedTitle,
  freeTrial, trialDaysLeft, trialExpired, machineId, machineIdSupport,
  licenseKeyPlaceholder, enterActivationKey, exLicense, configTrialDesc,
  clausIsActivated, loadingLicense).

### Le piège du chantier — les portes qui jugeaient le dispositif retiré
Trois portes mesuraient la licence elle-même et auraient rendu « vert » un lot
AMPUTÉ de sa mesure si on les avait supprimées sans les réécrire : le brute-force
de `/api/unlock` (verify:ratelimit), l'exemption `/api/trial-status` (unitaire du
rate-limiter, verify:http, gzip e2e) et deux tests e2e du routeur. Le brute-force
est DÉPLACÉ sur la seule surface de brute-force qui reste (`/api/auth/login`,
bucket auth 20/15 min) — l'invariant « la connexion est plus stricte qu'un POST
métier » survit ; les petits GET de remplacement sont `/api/auth/etat` ; l'exemple
de route hors liste blanche passe de `/api/unlock` à `/api/users`
(`test/e2e/routes.spec.ts` 46 → 44 tests).

### Vérifié le 15/10
tsc 0, vitest 170/170, build 488.81 ko (< 620), verify:routes 44/44,
verify:http TOUT PASS, verify:ratelimit rc=0, verify:suggestions TOUT VERT,
verify:suggestions-mord rc=0 (arbre propre), verify:auth rc=0,
verify:dashboard 7/7, verify:reception rc=0, verify:bundle rc=0.

### Piège du 15/10 — « le screenshot est sans les onglets » alors que le FICHIER est bon
Rapporté DEUX fois. Mesures : l'URL du README (`github.com/.../raw/main/public/…`)
répond 302 vers `media.githubusercontent.com` et sert bien le nouveau fichier
(217746 octets, 1680x1080, sha256 `4361c020…` == fichier local), et la page
rendue pointe dessus. Le défaut n'était donc pas le fichier mais la COPIE EN
CACHE du lecteur : une image est servie avec `cache-control: max-age=300`, donc
un navigateur qui a ouvert le README avant la recapture continue de montrer
l'ancien PNG au MÊME chemin. Remède déterministe : le `src` porte
`?v=2026-10-15` — GitHub PRÉSERVE la chaîne de requête (vérifié par l'API
`/markdown` : `src="public/screenshot-dashboard.png?v=2026-10-15"`), donc l'URL
change et le cache ne peut plus servir l'ancienne image. À faire évoluer à
chaque recapture.
Deuxième leçon : l'image est stockée en **git LFS** (`public/*.png`), donc
`raw.githubusercontent.com` rend un POINTEUR de 131 octets — c'est la redirection
de `/raw/` vers `media.githubusercontent.com` qui rend le PNG. « raw est cassé »
n'est pas un défaut du README.
Troisième leçon : à `width="840"` les libellés de la barre latérale sont
minuscules (9 px) — ce qui peut faire croire qu'ils manquent. L'image passe à
1200 px.

### 15/10 — CI rouge sur verify:sse : un controle qui jugeait la PREMIERE frame du tampon
CI a rougi `verify:sse` (job gates : PORTES=84 ROUGES=1) alors que la porte etait
verte sur le poste : `ECHEC ajout de capteur pousse une liste contenant le
nouveau`, SANS detail — donc `waitFor("sensors")` avait bien rendu une frame,
mais une frame sans le nouveau capteur.
Cause etablie par lecture puis reproduction : `haccp.ts`
(POST /api/haccp/iot-sensors) fait `res.json()` PUIS `publishList(...)`
(res.json l.277, diffusion l.280-285). Un 200 ne garantit donc pas que la frame
est partie. Sur un runner lent, la frame des deux enregistrements d'amorcage
(l.155-156) arrive APRES l'attache du flux et reste au tampon ; `waitFor` (qui
rend des qu'une frame de ce nom existe) la rendait immediatement et jugeait la
mauvaise liste — faux rouge, produit en faute pour rien.
Reproduction a volonte : copie de la porte + un capteur temoin enregistre apres
l'attache du flux -> ancienne logique ECHEC / nouvelle PASS, 2 frames 'sensors'
dont la 1re sans 'newcomer'.
Remede : le point 5 juge la PROPRIETE (« une frame 'sensors' contenant
'newcomer' arrive en 4 s ») et non l'existence d'une frame. Le point 4 passe au
meme regime (`waitCount` au-dessus du niveau de reference, on ne juge que la
frame posterieure au post) : le minuteur publie 'stale' toutes les 25 s, donc une
frame anterieure au post pouvait etre jugee a sa place.
Falsifiabilite (morsure) : `publishList` neutralise -> ECHEC sur le seul point 5
avec `frames 'sensors' recues=0`, rc=1 ; restaure -> TOUT PASS rc=0 (2 runs).

## Chantier 15 — Découpage de FichesTechniques.tsx, 2e passe : les deux vues extraites (15/10)

### La décision jouée

Le fond de liste (AGENTS.md:123) pointait FichesTechniques.tsx à 1620 lignes —
le chantier 8 l'avait laissée à 1550, les chantiers 10a/10b l'avaient fait
remonter (typage des callbacks). Le fichier portait DEUX responsabilités de
rendu de plus que le state : la grille du mode « categories » et la vue
« livre » A-Z.

### La cartographie (mesurée avant de couper)

- bloc A (l.762-1130, 369 l.) : grille des fiches du dossier (mode categories).
- bloc B (l.1133-1574, 442 l.) : barre A-Z + fiches sauvegardées (mode book).
- Deps énumérées par grep du bloc, puis RE-ENUMÉRÉES par les erreurs tsc (le
  premier scan en avait raté : X, addIngredient, removeIngredient, ALPHABET,
  saveRecipe — les symboles dans des callbacks multi-lignes).

### Ce qui a été écrit

- `src/components/FichesGrilleCategories.tsx` (462 l.) et
  `src/components/FichesVueLivre.tsx` (542 l.) : JSX déplacé OCTET POUR OCTET,
  zéro state propre, handlers du parent passés tels quels, ALPHABET copié
  (constante locale).
- FichesTechniques.tsx : 1620 -> 853 lignes (-767), le state reste ENTIER chez
  le parent, le ternaire `!selectedCategory` aussi.

### Le piège du chantier — les interfaces ne se copient pas, elles se déduisent

Les interfaces `Recipe`/`RecipeIngredient` de FichesTechniques ne compilent pas
telles quelles dans les composants extraits : le JSX déplacé traite `recipe.id`,
`recipe.ingredients` et `recipe.source_image_url` comme PRÉSENTS, ce que le
parent tolérait par le narrow du ternaire `!selectedCategory` (une prop
`string | null` ne traverse pas la frontière d'un composant : TS ne narrow pas
à travers les enfants). Interfaces des extraits resserrées au contrat réel des
recettes de la base (id: string, ingredients: RecipeIngredient[],
source_image_url?: string) + sondes tsc pour trancher (la sonde posée dans le
composant d'origine rougit TS2538/TS2322 : le narrow venait bien du ternaire).

### Vérifié le 15/10

tsc rc=0 (mesuré direct, sans pipe), vitest 170/170, build 488813 o (IDENTIQUE
à l'octet près), e2e routes+recipes+reception 69/69, verify:all rc=0
(PORTES=84 ROUGES=0).

## Chantier 16 — Audit UI/UX : le banc des 13 onglets a trouve deux defauts invisibles (15/10)

### La demande

Le client demande : « l'interface UI/UX, tu l'as verifiee ? » Reponse honnete
avant ce chantier : NON — les portes jugeaient des routes et des panneaux cibles
(reception, recipes, dashboard), jamais l'integralite de la navigation. Un
onglet entier pouvait etre vide sans qu'aucune porte rougit. C'est exactement
ce qui s'etait produit (le defaut 2 ci-dessous).

### Le banc (ce qui a ete ecrit)

- `test/e2e/ui-tabs.spec.ts` : spec Playwright qui demarre SON serveur en
  production (port libre, NODE_ENV=production obligatoire — en dev la CSP bloque
  react-refresh et la page est blanche, lecon de reception-view.spec.ts), seme
  des articles reels, passe la landing comme un utilisateur, puis ouvre LES 13
  ONGLETS de la sidebar et juge pour chacun : du contenu rendu (>80 caracteres)
  + une console PROPRE (zero pageerror, zero erreur console).
- Portes nouvelles (regle 6 : package.json + DEFAUT) :
  - `verify:ui-tabs` — le banc ci-dessus (13/13).
  - `verify:csp-inline` — le hash du script inline de dist/index.html doit etre
    autorise par la CSP de server.ts (morsure faite : modifier le script ->
    rc=1 avec le hash a reporter, restaurer -> rc=0).
- server.ts : la CSP autorise desormais le script inline par SON hash
  (`'sha256-bWNh3YTBgq0ftjA41Bp/xlsgGSwtjfZEdeS2cQbJMT4='`) — pas
  d'`unsafe-inline`, la CSP reste stricte pour tout le reste.

### Defaut 1 (trouve par le banc) — le garde-fou « ecran de secours » etait mort

dist/index.html embarque un script inline qui affiche un ecran de secours quand
React ne monte pas (#root vide). La CSP de helmet (`script-src 'self'`) le
bloquait : `Refused to execute inline script` sur CHAQUE chargement en
production. Le garde-fou etait mort depuis l'arrivee de helmet, sans qu'aucune
porte ne le voie — aucune ne jugeait le navigateur. Repare par hash + porte
verify:csp-inline pour que le silence soit impossible.

### Defaut 2 (trouve par le banc) — l'onglet Fiches rendait un ECRAN VIDE

Mesure : cliquer « Fiches Techniques » => React #130 (element type undefined),
l'ecran restait vide, l'app entiement perdue. Bissection par neutralisation
(grille -> crash persiste ; vue livre -> crash persiste ; RecipeModal -> plus de
crash) : `RecipeModal.tsx:1` importait `AnimatePresence` de **react** (ou il
n'existe pas) au lieu de **motion/react**. Le composant valait `undefined` des
le premier rendu du modal. Introduit au chantier 8 (08/10, extraction du modal)
et MASQUE ensuite par le bug de la sidebar non rendue (chantier 13) : l'onglet
etait injoignable, donc le crash etait latent. La reparation de la sidebar
(b30bc79) l'a rendu VISIBLE — et aucune porte ne l'a vu jusqu'au banc.
Repare : import de motion/react + `selectedRecipeForModal?.id` (garde null, la
prop etant typee `Recipe | null` — le type mentait : `Recipe` non-null alors que
le parent passe null).

### Lecons

- `tsc` ne peut pas attraper `import { X } from "react"` quand X n'existe pas :
  l'import est `any` (noImplicitAny: false) et l'element JSX `undefined` — seul
  le navigateur rougit. La porte `verify:ui-tabs` est LE capteur.
- Un defaut latent se revele par la reparation d'un autre defaut : le banc doit
  exister AVANT, pas apres.
- La CSP de helmet s'applique aussi aux scripts inline legitimes : tout script
  inline nouveau doit passer par verify:csp-inline.

### Vérifié le 15/10

tsc rc=0, vitest 170/170, build OK, verify:ui-tabs 13/13, verify:csp-inline
rc=0 (morsure rc=1), verify:http TOUT PASS (la CSP n'a pas casse les en-tetes),
e2e routes+reception 45/45.

## Chantier 17 — « Continuer sans IA » : l'assistant n'est plus une porte d'IA obligatoire (15/10)

### La demande du client

Sur le parcours réel (mobile, tunnel) : « C'est quoi cette lecture de facture ?
Quelle utilité logique ? Le logiciel doit être accessible sans IA. » Reponse :
l'épreuve OCR sert (mesurer les capacités réelles de la machine avant de compter
dessus), mais elle était présentée comme UN PREREQUIS — en contradiction avec le
contrat produit « l'app est complète en saisie manuelle ». Une machine sans
moteur restait bloquée à l'écran 3.

### Ce qui a été écrit

- Assistant.tsx : un bouton « Continuer sans IA » à l'écran du moteur, séparé
  visuellement (le contrat : un choix à part entière, pas un échec de
  détection). Il saute clef ET épreuve (rien à juger sans moteur) et mène à un
  écran de confirmation explicite (« le test de lecture s'y trouve aussi »).
- src/services/assistant.ts : `consignerDemarrage("sans")` consigne le
  démarrage SANS épreuve (`install_termine_le` + `fournisseur_choisi: "sans"`
  + `llm_choix: "sans"`). Le contrat « sans épreuve reussie, rien n'est
  consigné » ne concerne que l'IA : on ne consigne pas une intelligence
  qu'on n'a pas équipée.
- src/shared/llm.ts : `generer()` avec `llm_choix=sans` jette
  `LlmInjoignable("sans IA", "IA_DESACTIVEE")` — nommé, jamais un appel.
  `cibleActuelle()` rend « Sans IA (saisie manuelle) ».
- src/routes/ai.ts : IA_DESACTIVEE rend 503 avec un message clair dans la
  langue de l'app (« IA désactivée : l'application fonctionne en mode
  manuel... ») — pas un « bug technique » : l'opérateur a CHOISI ce mode.
- src/shared/fournisseur/{types,reglage-llm}.ts : `sans` rejoint les valeurs
  licites de `llm_choix` ; la sonde rend le défaut nommé IA_DESACTIVEE.
- SettingsView.tsx : la 4e carte « Sans IA » au panneau Intelligence (la voie
  est activable/révocable ici à tout moment).
- test/unit/llm-porte.test.ts : morsure « 2 bis » — generer() avec `sans`
  jette IA_DESACTIVEE et n'appelle RIEN (urlsJouees vide).
- test/e2e/sans-ia-contract.spec.ts : le parcours de bout en bout AVEC auth
  active — landing, création de compte, bouton « Continuer sans IA », aucune
  épreuve demandée, « Terminer » armé, consignation écrite (fournisseur "sans"),
  sidebar rendue.

### Le piège du chantier — un corps de réponse ne se lit qu'une fois

La première version de `terminer()` lisait le corps DEUX fois (le défaut, puis
`ok`) : un second `res.json()` sur la même Response jette « body already
read », le catch le taisait, et un SUCCÈS était rendu en erreur générique
« CONSIGNATION_IMPROUVABLE » — mesuré par le spec (CONSIGNER_REP: 200, écran
inchangé). Réparé : un seul `res.json()`, le succès jugé d'abord, le défaut
nommé par statut (401/412) puis par corps.

### Vérifié le 15/10

tsc rc=0, vitest 171/171 (morsure 2 bis comprise), build OK, verify:ui-tabs
13/13, e2e routes+reception+sans-ia 45/45, parcours curl : consigner "sans"
sans épreuve -> 200 ok:true, chat en mode sans -> 503 message clair.

## Chantier 18 — Le doublon « Chat Culinaire » : un seul chemin par onglet (15/10)

### La demande du client

« Je ne comprends la logique : 2 onglets affichés en même temps. J'ai demandé
que le chat soit présent en Ingénierie Menu, donc il va disparaître comme
onglet. En Ingénierie Menu sera donc ce chat avec IA, la possibilité de
peaufiner des recettes et l'option de les sauvegarder. »

### La mesure (le défaut était réel)

La sidebar contenait DEUX entrées vers le MÊME onglet : « Ingénierie des
Menus » (section Opérations, l.97) et « Chat Culinaire » (section Intelligence
artificielle, l.186) — toutes deux `setActiveTab("menus")`. Résultat visible :
deux onglets actifs affichés en même temps (les deux surlignés en vert sur la
capture du client). Le chat était DÉJÀ rendu dans MenuAnalysis (l.458,
`vue="chat"` par défaut) — l'entrée autonome était un doublon pur.

### Ce qui a été écrit

- Sidebar.tsx : l'entrée « Chat Culinaire » est RETIRÉE (avec le commentaire du
  pourquoi) ; l'import MessageSquare devenu inutile est retiré.
- MenuAnalysis.tsx : le défaut mobile trouvé au passage — la colonne du chat
  (`flex-1`) était ÉCRASÉE à 0 px par les cartes sur petit écran (le conteneur
  `flex` en ligne sans flex-col) : l'atelier était invisible sur téléphone.
  Réparé : `flex-col lg:flex-row`, hauteur minimum 520 px du chat en mobile,
  overflow-y en mobile ; titre resserré (text-2xl md:text-3xl, p-4 md:p-8).
- lazy-views.ts : l'export lazy autonome CulinaryChat retiré (MenuAnalysis
  l'importe directement — un seul chemin).
- ui-tabs.spec.ts : la liste passe à 12 onglets + un NOUVEAU jugement
  permanent : « pas de doublon de navigation » (l'entrée Chat Culinaire doit
  être absente de la sidebar, et le chat doit être visible DANS Ingénierie des
  Menus).

### Le piège du chantier — un commentaire JSX n'est pas le premier élément d'un ternaire

Le commentaire `{/* ... */}` placé juste après `{vue === "chat" ? (` cassait la
compilation (TS1005) : un commentaire JSX est un NŒUD, il ne peut pas précéder
l'expression d'un ternaire. Déplacé avant le `{vue === ...}`. (Deuxième leçon
du même chantier : reconstruire un bloc de spec par script a tronqué les
fermetures — la relecture tsc + le run ont attrapé les deux.)

### Vérifié le 15/10

tsc rc=0, vitest 171/171, build OK, ui-tabs 13/13 (12 onglets + anti-doublon),
e2e routes+reception+sans-ia 46/46.

## Chantier 19 — la vitrine publique : audit des promesses et la release v0.1.0 aux trois plateformes (16/10)

### La decision jouee

Mise en open source (chantiers 17-18 : historique unifie clausake, vitrine
gh-pages portee du style portfolio). Vente interdite du reve : le client
rappele que le portfolio datait des modifications — CHAQUE promesse de la
landing re-jugee contre le code. Neuf corrections : accords mets-vins retire
(rien dans le chat), valeurs nutritionnelles retirees (aucun code), pointages
et competences retirees (le module fait plannings/roles/coits/cout main
d'oeuvre/export CSV), « l'IA prepare les bons de commande en autonomie »
remplace par la regle fondatrice (elle PROPOSE, l'humain APPLIQUE — 403 si
l'IA ecrit), etc. Les reels affirmes : avoirs dans l'OCR (documents.ts), lot +
etiquette de tracabilite a la reception, allergenes des fiches, quatre
indicateurs de profitabilite, scan par appareil photo (capture=environment) —
pousse c172d674 sur gh-pages.

La release v0.1.0 prend les installeurs des TROIS plateformes :
- Linux ARM64 (la machine du maitre) : AppImage + deb, compiles LOCALEMENT
  et attachés (verifies octets servis).
- Windows x64 et macOS Apple Silicon : IMPOSSIBLES a compiler depuis un hote
  aarch64 Linux (node-gyp refuse le cross-compile natif ; makensis casse
  EPIPE) — un workflow d'actions (build-windows.yml, 2 jobs) les compile sur
  VRAIS hotes GitHub (windows-latest, macos-latest) et les attache a la
  release ; ressert seul a chaque tag v*.

### Ce qui a ete ecrit

- `.github/workflows/build-windows.yml` : job build (NSIS x64 sur
  windows-latest) + job build-mac (dmg Apple Silicon sur macos-latest) ;
  attache beide a la release par le tag v0.1.0 tant que la version courante
  reste 0.1.0. README note l'etat de non-signature (SmartScreen -> « Executer
  quand meme » / Gatekeeper -> clic droit Ouvrir) — le client confirme le
  meme regime pour Windows (pas de certificat).
- Version package.json 1.0.0 -> 0.1.0 (alignee sur la release ; les noms
  d'artefacts suivent).

### Le piege du chantier — trois couches, chacune avec son nom

1. npm bug #4828 : les dependances optionnelles par-plateforme (rollup,
   esbuild) manquent si le lockfile fut genere ailleurs — installees a plat
   en CI (--no-save, lockfile intact).
2. electron-rebuild ne lit pas les noms de prebuilds NAPI modernes : argon2
   0.45 livre `prebuilds/win32-x64/argon2.glibc.node`, le detecteur cherche
   `node.napi.node` — sinon il retombe sur node-gyp et exige Visual Studio.
   Remede : une copie renommee (NAPI s'execute tel quel sous Electron) ;
   justifiee en commentaire dans le workflow. Le build local x64 --dir passe
   rc=0 une fois le nom pose (binaire PE32+ verifies au type pour sqlite3 et
   argon2).
3. Le DELETE du tag v0.1.0 (voie de declenchement : le jeton n'a pas
   Actions:write, le dispatch API refuse 403 ; le push du tag lance le
   workflow) met la release au repos DRAFT — re-patch draft:false apres
   chaque manipulation du tag. Le relachement des liens 404 -> 200 se cale
   apres le rebind du tag.

### Verifie le 16/10

Release v0.1.0 : QUATRE assets, liens tous HTTP 200 a la taille exacte —
claus.io.Setup.0.1.0.exe (287 Mo), claus.io-0.1.0-arm64.dmg (301 Mo),
claus.io-0.1.0-arm64.AppImage (325 Mo), clausio_0.1.0_arm64.deb (251 Mo).
CI sur 11951035 : 7 check-runs vertes (86 portes, e2e, types, build, journal,
vitest 158, build Windows, build-mac). Landing servie : 0 promesse revee, la
regle fondatrice lisible. Les codes faillibles restent en archive SHA :
/tmp/opencode/sha-tag-v010-avant.txt (1c6aba6, avant reforge du tag).

## Chantier 20 — Le déploiement Windows : la fenêtre « Not Found » et le ZIP qui ne compilait pas (29/10)

### Ce que le client a rapporté, et ce qui a été MESURÉ

1. ZIP GitHub + `LANCER_APPLICATION.bat` → `'vite' n'est pas reconnu en tant que
   commande interne ou externe` puis `[ERREUR] Echec lors de la compilation du
   frontend.`
   - **Cause (rejouée)** : le `.bat` posait `set NODE_ENV=production` AVANT
     `npm install`. npm lit cette variable et, en production, n'installe PAS les
     devDependencies — or `vite`, `tsx`, `esbuild`, `electron` en sont. Le
     `npm install` rend 0 (donc le script ne rougit pas) avec un `node_modules`
     sans `vite`. Mesure : `NODE_ENV=production npm install` sur un package.json
     portant vite en devDependency → `node_modules/.bin/vite` ABSENT ; le même
     install avec `--include=dev` → binaire présent, `vite/6.4.5` répond.
2. Installeur Windows 0.1.0 → fenêtre affichant « Not Found ».
   - **Cause (lue dans le LIVRÉ, pas dans le source)** : l'AppImage arm64 de la
     release a été téléchargée (340 552 877 o), extraite (`unsquashfs` via
     `--appimage-extract`), et son `resources/app.asar` (369 718 838 o, 27 924
     entrées) ouvert à la main : `dist/index.html` y EST (4 293 o, 40 chunks) —
     mais le bundle embarqué porte à la ligne 8184
     `const distPath = import_path13.default.join(process.cwd(), "dist")`.
     Empaquetée, l'application tient `dist` DANS son asar, alors que le cwd de
     l'exe est le dossier d'installation (ou `System32`). Le `express.static` ne
     trouve rien, l'attrape-tout `app.get("*")` fait `sendFile` sur un chemin
     inexistant → page Express « Not Found ».
   - **Reproduction** : réplique exacte de `server.ts:204-242` servie depuis un
     cwd décalé, `NODE_ENV=production` → `HTTP 404` + corps `Not Found`. Depuis
     le bon cwd → `HTTP 200` + la page réelle. Le code HTTP seul ne tranche pas :
     c'est le `distPath` affiché par le serveur qui dit la vérité.

### Deux autres pannes silencieuses du MÊME défaut (non signalées par le client)

3. Epicure : le moteur d'accords lisait `"vocab.json"`, `"embeddings.*.safetensors"`
   en chemins RELATIFS, et ces fichiers n'étaient pas embarqués par
   `build.files`. Dans le livré : `CRITICAL error loading EpicureModel embedding
   files: ENOENT vocab.json` → vecteurs NULS, interface muette à côté.
4. `src/routes/admin.ts` : le guide se téléchargeait depuis
   `process.cwd()/public/Executive_Guide.pdf` (dossier non embarqué) → 404.

### La réparation

- `src/services/chemin-ressources.ts` (nouveau) : résolution par CANDIDATS —
  `COOKDRIVE_DIST` (chemin exact posé par le lanceur) → parent du module
  (`dist-server/..` = la racine de l'asar, et la racine du dépôt en local) →
  cwd. Le premier candidat qui contient RÉELLEMENT le fichier sentinelle gagne ;
  aucun candidat lève `RESSOURCE_INTROUVABLE` en nommant les chemins fouillés.
  (Un 404 muet ne dit rien ; cette erreur si.)
- `server.ts` sert `resoudreDist()`, `epicure.ts` lit `resoudreDonneesEpicure()`,
  `admin.ts` prend le PDF dans dist (repli `public/` pour le dev).
- `electron/main.cjs` pose `COOKDRIVE_DIST = path.join(__dirname, '..', 'dist')`.
- `package.json` `build.files` embarque `vocab.json`, `vocab_translations.json`
  et les trois `embeddings.*.safetensors`.
- `LANCER_APPLICATION.bat` / `.ps1` : `NODE_ENV=production` déplacé JUSTE AVANT
  `npm start` ; installation en `npm install --include=dev` ; le contrôle passe
  de « `node_modules` existe » à « `node_modules/vite` ET `node_modules/tsx`
  existent » (un dossier tronqué passait avant) ; le navigateur s'ouvre après le
  démarrage du serveur.
- `package-lock.json` régénéré : `npm ci` échouait (`EUSAGE`, 34 paquets
  optionnels absents du lock) — donc TOUT nouveau build GitHub Actions était
  bloqué avant même la compilation. Mesuré : `npm ci` → `RC=1` avant, `RC=0`
  après (616 insertions / 148 suppressions).
- `README_LANCEMENT.txt` réécrit (il renvoyait à « AI Studio → Exporter », voie
  qui n'existe plus, et son texte était corrompu en octets).

### Les portes ajoutées (règle 6 : une porte qui ne pique pas est décorative)

- `verify:chemins-empaquete` (`scripts/verify-chemins-empaquete.py`) : 6 règles
  lues dans la source — aucun des trois chemins ne retombe sur le cwd nu, le
  lanceur pose `COOKDRIVE_DIST`, les cinq fichiers Epicure sont dans
  `build.files`, la résolution qui échoue NOMME son échec.
- `verify:chemins-empaquete-mord` : rejoue la porte sur une COPIE du dépôt où le
  défaut d'origine est réintroduit, et exige qu'elle ROUGISSE.
  Mesuré au PREMIER essai : les deux mutations rendaient la porte VERTE — la
  porte lisait le dépôt de travail et non la copie jugée. Corrigée (la racine
  jugée est passée en argument), re-mesuré : `mutations=2 rouges=2`,
  `VERDICT : la porte voit le defaut d'origine`.
- Les deux sont au `DEFAUT` de `scripts/run-all-gates.py` (sinon : porte
  décorative, règle 6) — jouées par le lot : `GATES=2 ROUGES=0`.

### Vérifié le 29/10 — le porteur « Not Found » (preuves re-mesurées, pas relues)

- `npx tsc --noEmit` → RC=0. `npx vitest run` → 16 fichiers, 184 tests verts
  (dont 13 nouveaux dans `test/unit/chemin-ressources.test.ts`, joués dans leurs
  deux directions).
- `npm run build` → chunk d'entrée 490,26 ko (plafond 620) ; `npm run build:server`
  → `dist-server/server.cjs` 327,6 ko.
- `npm ci` → RC=0 (il rendait RC=1).
- Lancement du BUNDLE depuis un cwd étranger (`/`) : `EpicureModel : donnees
  lues depuis …` + `EpicureModel loaded 1790 ingredients and vectors successful`
  + `[frontend] dist servi depuis …` + `GET / → HTTP 200 4 293 o`.
- `npx electron-builder -l` → AppImage arm64 construite, asar vérifié à la main :
  `dist/index.html` présent, les cinq fichiers Epicure à la racine de l'asar,
  `process.cwd(), "dist"` : 0 occurrence dans le bundle.
- LA FENÊTRE, jugée par CDP sur l'application empaquetée (`--remote-debugging-port`,
  `Runtime.evaluate` + `Page.captureScreenshot`), lancée avec un **faux `dist`
  posé dans le cwd** pour que le leurre trahisse une résolution par le cwd :
  cible `page | "claus.io" | http://127.0.0.1:3000/`, titre `claus.io`, DOM
  réel (`1 #root`, `2 scripts`, texte « L'intelligence artificielle au service
  de la restauration… », « Accéder à la Cuisine »), capture 261 680 o. Le faux
  dist n'a jamais été servi. `GET /api/settings` → 200 + l'en-tête
  `X-Cookdrive-Instance` du jeton annoncé dans `cookdrive-ready.json` (parité
  ready/fenêtre tenue).

### Le porteur « Not Found » réglé, trois autres pannes sorties du même lot (29→30/10)

Cinq portes rouges restaient debout après le correctif ci-dessus. Elles ont été
jouées une par une, et DEUX sont des défauts du produit, pas du harnais :

1. **Le tableau de bord ne montrait pas la journée en cours** (`verify:dashboard`
   D1, `expect(corps.length).toBe(8)` → 7). `generateDates` (src/routes/dashboard.ts)
   itérait des `Date` construites sur `"2026-10-22"` (= MIDI UTC) et rendait
   `toISOString().split("T")[0]` : sous un poste à UTC+2, `setDate(+1)` franchissait
   minuit UTC et LE DERNIER JOUR du créneau sautait. Mesuré : créneau demandé
   2026-10-22 → 2026-10-29, rendu 7 lignes terminant au 28. Or les bornes venaient
   déjà de `jourLocalISO` — c'est l'énumération qui parlait UTC. Réparé en
   comparant des CALENDRIERS (`AAAAAMMJJ` en nombres), sans horloge : `7 passed`,
   et `verify:dashboard-mord` rendu `VERDIT LUS: 9/9 MORDENT`.
2. **Le garde-fou anti-fantôme de SEPT juges ne tuait rien.** Les scripts
   `verify-{auth,audit,hermes,mode-agent,mode-manuel,suggestions,surveillance}.mjs`
   testaient la cmdline de leurs orphelins contre `cookdrive-project` — l'ANCIEN
   nom du dépôt, qui ne survit que dans `homepage` de package.json. Un fils lancé
   depuis `/home/clausake/.clausio/claus.io` ne le porte pas (mesuré sur
   `/proc/<pid>/cmdline`). Conséquence vécue : `verify:auth` rouge TROIS fois de
   suite (`B1 setup → 409`) sur la vieille base d'un fils de 47 minutes — le
   fantôme que la leçon du 03/10 prétendait avoir réglé. Motif remplacé par le nom
   RÉEL du dépôt (le même que le dossier de données, `src/db/init.ts`), donc le
   garde ne peut pas tuer les serveurs d'un dépôt voisin. Après correction, le
   juge est rejoué FANTÔME POSÉ (un serveur lancé sur son port avec sa base) :
   `CONTRAT IDENTITE: toutes les regles vertes`.
3. `verify:indices-mord` rendait « serveur pas pret » avec une dernière sortie
   `(rien)` : sa copie isolée exclut `dist`, donc la branche `NODE_ENV=production`
   de `server.ts` — qui exige `dist/index.html` — ne peut pas s'ouvrir. Ce bench ne
   juge AUCUNE route de rendu (il mesure des plans SQLite) : le mode production est
   posé APRÈS le démarrage, et un test nominal de `vite` rend enfin un diagnostic
   au lieu d'un silence. Rejoué : `N1 rc=0`, `N2 rc=1`, « le garde mord ».
4. La leçon du 03/10 (AGENTS.md, « un fils tsx survit et tient le port ») est
   devenue une PORTE : `verify:garde-fantomes` démarre un vrai fils serveur et
   exige que le capteur le voie (sinon la porte serait décorative), puis juge les
   sept juges sur leur code exécuté — pas sur leurs commentaires, où l'ancien nom
   reste écrit pour raconter la faute. Sa morsure remet `cookdrive-project` et
   exige que les sept rougissent : `juges=7 rouges=7`, `VERDICT : la porte voit le
   garde qui ne tue rien`. Les deux sont au `DEFAUT` (règle 6).
5. **Une porte neuve en polluait une autre.** Ma propre `verify:garde-fantomes`
   démarrait son fils serveur sur le port FIXE 4177 — qui est le port JUGÉ par
   `scripts/probe-inventory-put-partial.mjs` (`PORT_OCCUPE=1` → rc=5). Le lot
   complet rendait donc `verify:inventory-put-voices` rouge à cause de moi.
   Mesuré : `RESULTATS PORT_OCCUPE=1 PORT=4177 JETON_RENDU="f2bf…" JETON_ATTENDU=
   "probe-invput"`. Corrigé : la porte se cale sur un port LIBRE ; rejouée, elle
   rend `portees=8 rouges=0`, sa morsure `juges=7 rouges=7`, et
   `verify:inventory-put-voices` est repassé `SERVEUR_ABSENT=0 … rc=0`.
   Leçon consignée : un port fixe est un contrat chez l'AUTRE — une porte qui en
   fait rougir une autre n'est pas une mesure, c'est une pollution du terrain.
6. `verify:routes` rend **44** tests verts (la vitrine en annonce 46) et le lot
   compte **90** portes (la vitrine en annonce 86, AGENTS.md 69) : trois chiffres
   de vitrine périmés, relevés et non recopiés (règle 1). La vitrine reste à
   remesurer dans un lot dédié — elle n'est pas jugée par ces portes-ci.


7. **La CI GitHub n'avait jamais jugé le lot des portes depuis le 16/10.** Le job
   `gates` rouge sur `Run npm ci` (run 40996854754, les sept autres jobs verts) :
   le postinstall de `onnxruntime-node` télécharge les providers CUDA/TensorRT sur
   `api.nuget.org`, injoignable depuis le runner → `AggregateError [ETIMEDOUT]`.
   La variable `ONNXRUNTIME_NODE_INSTALL: skip` qui règle ça est posée dans
   `.gitlab-ci.yml` (leçon du 02/10) et **absente de `.github/workflows/ci.yml`** :
   deux harnais, une seule moitié protégée. Ajoutée en `env:` global de la CI
   GitHub (les binaires CPU linux/x64 sont déjà dans le paquet, l'OCR est jugé sur
   CPU — `verify:ocr-moteur` n'est pas dans ce lot). Les binaires CPU ne sont pas
   une capacité perdue : c'est le contrat même de la porte `verify:ocr-moteur`,
   hors `DEFAUT` parce qu'elle exige les poids, absents de git (§7 de AGENTS.md).

### Re-vérifié le 30/10 sur le LIVRÉ reconstruit (le code d'aujourd'hui, pas celui de 0.1.0)

- `npx electron-builder -l` → RC=0, AppImage arm64 + deb régénérés depuis le
  commit `5452cbb`.
- La FENÊTRE rejouée par CDP sur ce livré, toujours avec le **faux `dist` posé
  dans le cwd** (leurre) : cible `page | "claus.io" | http://127.0.0.1:3000/`,
  titre `claus.io`, `1 #root`, `2 scripts`, texte réel (« Accéder à la Cuisine »),
  capture 261 682 o ; `[frontend] dist servi depuis …app.asar/dist` et
  `EpicureModel loaded 1790 ingredients and vectors successful` lus dans le log du
  processus empaqueté.
- LOT COMPLET rejoué : `GATES=90 ROUGES=0`, `PORTES=90 ROUGES=0 … TOUT VERT`
  (lu par `python3 scripts/lire-gates.py`, jamais par un grep sur le binaire).
- `git push origin main` → `bb37503..5452cbb` ; tag `v0.1.1` poussé, le workflow
  `windows-x64` démarré sur le tag (il rattache les installeurs à la version de
  `package.json`, plus à un numéro figé).

### Limites de cette relecture (à dire, pas à taire)

- La fenêtre n'a pas été screenshotée depuis le X11 (`xwininfo` voit 0 enfant
  sous ce Xvfb) : la preuve vient du DOM et de la capture CDP, pas du compositeur.
- `EADDRINUSE` sur 3000 faisait glisser le serveur sur 3001 avec le même jeton
  pendant les runs — attendu (le port par défaut n'est pas imposé), mais cela
  rappelle qu'un `glisse:true` seul ne prouve rien sans le jeton.
- Le chemin de l'UI complète (les 13 onglets) n'est PAS rejoué ici : c'est
  `verify:ui-tabs`, hors de ce chantier.

## Campagne de réparation 31/10–02/11 — 27 commits, la release 0.1.2 et la CI GitHub (02/11)

Le planning du 31/10 (`docs/planning-reparation-2026-10-31.md`, 13 tâches
mesurées) répartissait le travail entre DeepSeek (sécurité/harnais/CI) et Qwen
(produit/dette/bundle). Bilan mesuré : `git rev-list --count 77b219e..946e592`
= **27 commits**, du déploiement GitHub (31/10) à la release **0.1.2** (02/11).

### Sécurité (T1, consigné au 31/10)

- **T1.1** (b40a29e) : dompurify CRITIQUE neutralisé par override `^3.4.17`
  dans package.json — l'audit est passé à `critical: 0`. Re-mesuré le 02/11 :
  `npm audit --json` → `{high: 6, moderate: 29, critical: 0}`. L'export PDF
  (jspdf) prouvé au passage.
- **T1.2** (94b69b8) : triage des high — 4 montées (override body-parser
  `^2.4.0`, markdown-it `15.0.3`, multer `2.5.0`, undici `8.12.3`), le reste
  consigné non monté. Les 4 overrides/montées vivent dans package.json
  (re-lu ce jour).
- **T1.3** (375024f) : barrière npm-audit dans la CI GitHub
  (`verify:audit-barriere` bloquante au seuil CRITICAL + morsure
  `verify:audit-barriere-mord` sans réseau) ; le rapport high/moderate est
  archivé en artefact (allow_failure, 1 mois).

### Dette et harnais (T2–T3, consigné au 31/10)

- **T2.1/T2.2** (743ffb5, 94f04f7) : la demi-portée
  `verify:instance-mord-harnais` et la porte `verify:ocr-moteur-mord` branchées
  au lot — capteurs DEMI-PORTEE et commentaire-vs-code à 0.
- **T2.3** (d9d52ce) : les 11 sondes orphelines disposées une à une avec raison
  par sonde (capteur ORPHELINE=0) ; `docs/skips-2026-10-31.md` consigne les
  .skip restants.
- **T3.3** (a81d655, rectifié au 51daab1) : le « fait 13 » des tests .skip
  était un FAUX POSITIF (journaux non suivis, pas process.exit) — une barrière
  no-mute garde le lot.
- **T3.2** (ff0bd48→2d8ab2a, 9 commits) : neuf extractions PURES (aucune ligne
  de logique déplacée) : translations.ts 3929→16 lignes (un module par langue),
  Purchasing.tsx 1479→671, documents.ts 906→689, InventoryAudit.tsx
  1226→748, DocumentManager.tsx 1324→789, SettingsView.tsx 1136→755,
  Haccp.tsx 1006→721, RecipeModal.tsx 921→489, FichesTechniques.tsx 853→792.

### Produit (T4–T5 + reprises Qwen du 02/11)

- **T4.1** (cfeb250) : vendor-pdf et vendor-charts hors du chargement initial —
  811 335 o économisés au boot (consigné au commit). Re-mesuré le 02/11 :
  `grep -c "vendor-pdf\|jspdf" dist/index.html` → 0.
- **T5.1** (4acc2e6) : parité README/workflow/release des installeurs — le job
  `build-linux` (runner ARM natif) construit AppImage + deb à chaque tag v* ;
  la récidive de la v0.1.1 (installeurs Linux promis au README mais jamais
  attachés) est fermée.
- **02/11** (76ba697, 24991e2, c1c2390) : `verify:ui-tabs` puis
  `verify:reception` rougissaient par la boucle d'entrée du HARNAIS (10×8 s
  avalée), pas par le produit ; `entrerDansApp()` — export mort qui faisait
  `page.goto(page.url())` (about:blank au premier appel) — retiré.

### La release 0.1.2 (02/11, commit 946e592)

- Tag `v0.1.2` → commit `946e592` (`git rev-parse v0.1.2^{commit}` =
  `946e5921e5…`).
- CI du commit : run **41430526576, 7/7 jobs verts**, lot complet
  `GATES=98 ROUGES=0 TOUT VERT` (lu dans le log du job gates, jamais greppé
  dans le binaire).
- Run installeurs **41430532470 : build / build-mac / build-linux = success** ;
  la release porte les 4 installeurs (AppImage arm64, deb arm64, Setup .exe,
  .dmg Apple Silicon), non draft, non prerelease.

### Limites à la date de cette consigne (à dire, pas à taire)

- Le compositeur Chromium du poste de dev ne produit plus de frames
  (`requestAnimationFrame` = 0) : les e2e LOCAUX ne sont pas fiables ici, la
  CI fait foi. Environmental, non réparable depuis le dépôt.
- Quatre erreurs étaient ouvertes au moment d'écrire ces lignes
  (`docs/plan-chantier-qwen-2026-11-02-v012.md`) : aucun smoke test
  d'installeur, le présent journal absent, les vulnérabilités livrées sans
  plan de sortie, le README périmé — ce dernier corrigé au commit fdc50e3 ;
  les trois autres suivent dans les commits de ce chantier.

## Publication 0.1.3 — le moteur publié devient l'arbre audité (02/11)

Faute détectée après E1–E4 (`docs/plan-chantier-qwen-2026-11-02-013.md`) : la
release **publique** v0.1.2 (assets `cree/maj = 10:41–10:44Z`) avait été
construite depuis `946e592`, AVANT E3 — donc ce que télécharge un client
embarquait encore les 4 `high` runtime. L'arbre propre et smoke-prouvé
(`c425339`) n'était publié nulle part. « Fonctionnel sans erreur » n'était vrai
que sur l'arbre, pas sur le livrable. Ce chantier publie l'arbre.

### P2 — `pdf2pic` retirée (commit c2c0711)

Dépendance directe de production **morte**, donc embarquée chez le client :
`npm ls pdf2pic` → `clausio@0.1.2 └── pdf2pic@3.2.0` (aucun reverse-dépendant) ;
`git grep -n "pdf2pic" HEAD -- src server.ts scripts electron` → rc=1, zéro
occurrence vivante (les seules traces sont les copies `.avant-*`/`.orig` de
`scripts/blocks/`, que `build.files` n'embarque pas). Elle exige GraphicsMagick
à l'exécution : poids mort livré. Retirée par `npm uninstall` (méthode E3,
aucune réécriture de code). **`pdf-parse` préservé** (interdit) : 4 routes
l'importent (`documents.ts:8`, `haccp.ts:6`, `menu.ts:6`, `recipes.ts:27`).
Honnêteté du chiffre : `pdf2pic` n'était pas une vulnérabilité comptée —
`npm audit --omit=dev` rend `{high:0, moderate:10, critical:0}` avant == après ;
le gain est le retrait du poids mort embarqué, pas un score (consigné
`docs/audit-2026-11-02.md` §5). CI du commit : run 41483397997, 7/7 verts.

### P1 — release v0.1.3 (commit 362f93f, tag v0.1.3)

`npm version 0.1.3 --no-git-tag-version`, tag `v0.1.3` posé DEPUIS le commit
release, pushé après CI verte du commit. Le tag NOUVEAU fait attacher le
workflow à une release séparée — aucune collision avec v0.1.2.

- CI du commit de release : run **41487554336, 7/7 verts**.
- Run installateurs du tag : **41492415754** — `build-linux :: smoke AppImage`
  ✓ AVANT `attacher les installeurs` ✓ ; AppImage jugé `claus.io-0.1.3-arm64.AppImage`,
  `/api/settings` 200, jeton d'instance `7e74fdd2…` conforme, `<div id="root">` rendu.
- v0.1.3 publiée (non draft, non prerelease) avec **4 assets** créés `17:36–17:39Z`,
  soit APRÈS le push du tag (~17:34Z). Notes de release posées par `gh release
  edit --notes-file` (n'altere ni les assets, ni le drapeau latest).
- v0.1.2 **intacte** : ses 4 assets gardent `10:41–10:44Z` (relecture identique
  à la baseline). Aucun tag `*-smoke*` laissé, aucun `--latest` forcé, v0.1.2
  non re-taggé. GitHub a promeu AUTOMATIQUEMENT v0.1.3 en « Latest » (comportement
  natif de la release non-draft la plus récente — non forcé, signalé ici).

### Limites de cette publication (à dire, pas à taire)

- Le smoke ne couvre que Linux (AppImage) ; `.exe` et `.dmg` construits mais non
  fumés — nommé dans le workflow, accepté par le plan.
- Les trois `high` retirés (`pdf-to-img`/`xlsx`/`pdf2pic`) l'ont été comme
  dépendances mortes : si une fonction revient, re-monter les successeurs
  (pdf-to-img 7.0.2, SheetJS ≥0.20) et re-fumer, pas réintroduire à l'aveugle.

## Campagne 03/11 — plan 014 : le poste Windows du maitre (04/11)

Trois défauts rapportés sur le poste Windows, tous reproduits et mesurés AVANT
correction. Un quatrième point (l'accès smartphone) est une **décision
d'exploitation**, consignée en attente — pas un bug.

### Les trois défauts, leurs causes mesurées, ce qui a été corrigé

1. **URL du moteur en 404** (capture du 02/11 : `…/api/generate/api/generate`).
   - Cause mesurée : le réglage porte l'URL complétée par l'endpoint, et le
     client rajoute le sien — chemin doublé → 404. Rejoué : le chemin doublé
     rend **404**, le chemin simple rend **200** (Ollama 11434, `/api/tags` 200,
     donc moteur vivant : seul le chemin testé était faux).
   - Le défaut vient aussi des **défauts embarqués** : `App.tsx:74` et
     `services/settings.ts:45` portaient `http://localhost:11434/api/generate`.
   - Corrigé (P1, commit `2fdda1f`) : fonction pure `baseNue()` dans
     `reglage-llm.ts` — retire en boucle `/api/generate`, `/api/chat`,
     `/v1/chat/completions`, `/v1`, `/api` et les `/` de fin ; **sans `new URL`**
     (qui réussit sur une URL à chemin et ne normalise rien : le piège mesuré).
     Appliquée aux branches `ollama` ET `llamacpp` de `cibleDuReglage`.
     R1 respecté : `https://proxy.exemple/ollama` reste **inchangé** (un préfixe
     de proxy n'est jamais retiré). Défauts → `http://127.0.0.1:11434` (base nue).
     `getOllamaHost` et `DEFAUT_OLLAMA` non touchés.
   - Preuves : 12 tests verts dans `test/unit/reglage-llm.test.ts`,
     `verify:reglage-llm` vert, `verify:llm-fournisseur` vert, tsc 0, build ok,
     CI 6/7 (`41594054793` : le job `gates` a ete ANNULE par la vague
     suivante, pas echoue ; le lot complet est vert sur `41621401346`). Bounded E2E : `POST /api/settings` avec
     `llm_url="…/api/generate"` → la cible sondée porte la base nue (le 404 du
     chemin doublé a disparu ; `HTTP_404` sur `/api/generate` simple = Ollama
     sans modèle installé, `ollama list` vide, défaut de terrain nommé).
2. **Le nom du modèle était à retaper** (détection ne tournant qu'au montage,
   `SettingsView.tsx:157` — R2).
   - Corrigé (P2, commit `128d38f`) : le champ « Nom du modèle » reçoit
     `list="modeles-detectes"` + un `<datalist>` peuplé par
     `serveursDetectes.flatMap(s => s.modeles.map(m => m.nom))`. Le champ reste
     **libre** (un chemin `.gguf` n'est pas un nom Ollama), aucune valeur
     imposée, aucun appel réseau nouveau ; la détection est **rejouée au
     « Tester »** (R2 : si Ollama démarre après l'ouverture de l'app).
   - Preuves : CI 7/7 (`41596838405`), `verify:types` (0 `:any` backend, seuil 0),
     `verify:bundle` vert.
3. **L'historique du chat (et les cartes) mourait au changement d'onglet.**
   - Cause mesurée : le `fetch("/api/ai/chat")` et les messages vivaient dans le
     composant (`CulinaryChat.tsx:134`, `MenuAnalysis.tsx:103`) ; démonter =
     réponse perdue.
   - Corrigé (P3, commit `e289294`) : store de module `src/shared/atelier-chat.ts`
     (`sAbonner`/`instantane`/`envoyer`/`reinitialiser`, compatible
     `useSyncExternalStore`). Le fetch vit **dans le store** : l'IA finit
     d'écrire onglet fermé. R3 : la re-dérivation des cartes est **idempotente**
     (la garde « même contenu déjà présent » + `derniereBruteParsee` → deux
     montages, même nombre de cartes). R4 : borne `CAP_MESSAGES = 200` (les plus
     vieux sortent), la fenêtre **envoyée** au serveur reste `historiqueSur` (12,
     contrat serveur). Rien sur le disque (aucun localStorage introduit).
     `CulinaryChat` ne garde que `input`/`isListening` en state ; l'accueil est
     l'état initial du store, plus un effet.
   - Preuves : 8 nouveaux tests `test/unit/atelier-chat.test.ts`, 206 tests
     locaux, CI 7/7 (`41608437380`).
4. **Le QR « Accès Smartphone Wi-Fi » mentait** (annonçait une IP morte).
   - Cause mesurée : `/api/network-info` prenait la **première** IPv4 non
     interne venue. Rejoué ici : l'algorithme rend `172.17.0.1` (docker0) ; sur
     le PC du maitre il est tombé juste **par chance**.
   - Corrigé (P4a, commit `df226b0`) : fonction pure `choisirIpLan()` dans
     `src/shared/reseau.ts` — écarte `internal`, `169.254.*` et les ponts
     (docker, br-, veth, wsl, vEthernet, VirtualBox, tailscale, utun/tun/tap) ;
     préfère `192.168.*` puis `10.*` puis `172.16-31.*` ; rend **null** si
     aucune candidate. La route rend `{ ip: null, port, url: null }` — jamais une
     URL inventée ; le panneau affiche « aucune adresse LAN détectée ».
   - Preuves : 7 tests `test/unit/reseau.test.ts` (dont la mesure rejouée :
     docker0 **jamais** rendu), mesure live `GET /api/network-info` →
     `{"ip":"192.168.1.50", …}` (la vraie carte, pas un pont), `verify:routes`
     44/44 (mesure : 44 tests verts ; la vitrine en annonce 46, cf. la lecon
     deja consignee), CI 7/7 (`41617668110`).

### Ce qui a été REFUSÉ, et pourquoi

- **P4b (l'exposition LAN) n'est pas implémentée** — décision du maitre
  requise, consignée en attente. Les deux issues (A : opt-in `lan_acces` +
  pare-feu Privé + avertissement ; B : vérité sans exposition) sont écrites
  dans le plan 014. En attendant : le bind reste `127.0.0.1` (`server.ts:250`,
  `HOST` par défaut loopback, vérifié ce jour) et le panneau ne ment plus (P4a).
  Ce qui reste interdit dans les deux cas : binder `0.0.0.0` par défaut,
  désactiver auth ou rate-limit, changer `HOST` en test/CI.
- **P1 ne touche pas** `getOllamaHost` (déjà juste) ni `DEFAUT_OLLAMA` (déjà
  base nue) : la normalisation se fait **à la lecture**, donc les installations
  existantes — dont le poste du maitre — sont réparées sans réinitialiser sa
  configuration.
- **P2 ne remplace pas** l'input par un `<select>` (casserait llama.cpp et les
  modèles non listés) et n'écrit aucune valeur par défaut dans `llm_modele`.
- **P3 ne persiste rien** en base ni en `localStorage`, et ne touche pas la
  fenêtre envoyée au serveur (`historiqueSur`, 12).
- `pdf-parse` **non touché** (4 routes métier l'importent).
- Limite nommée : les e2e locaux ne sont pas fiables sur ce poste
  (`requestAnimationFrame` = 0) — la CI est la source de vérité, et c'est elle
  qui a jugé chaque commit.

### Correction du 03/11 — l'ancre du journal (audit 016)

- Le commit `11834ec` annonçait « le .orig est re-ancre » : **c'etait faux**.
  La recette dit que le `.orig` et `sha256_original_avant_reancrage` **ne bougent
  pas** ; seul `original_sha256` suit la recollee.Etat restaure : `.orig` =
  2 134 lignes / 133 404 octets / sha `0360a1fe902e…`, `sha256_original_avant_reancrage`
  inchange, `original_sha256` = la recollee. La porte le prouve par la preuve
  exterieure (`ANCRE .orig: OK`, blob `4e4388d6e87d`).
- Piege d'outil nomme (pour ne pas le refaire) : `--verify` ne rendait que
  **12** caracteres de sha alors que le manifeste en exige **64**, et
  `_ancre_externe()` n'etait joue que si l'ancre etait deja bonne — une ancre
  perimee masquait donc un `.orig` incoherent. Repare en A1 : shas complets,
  ancre toujours jouee, et deux verdicts distincts (`ANCRE PERIMEE` /
  `LIGNE PERDUE`).
- Les deux chiffres du journal releves par l'audit sont corriges ici : le run
  `41594054793` est **6/7** (job `gates` annule par la vague suivante) et
  `verify:routes` juge **44** tests.

### Publication 1.0.0 (03/11, soir)

- Le maitre a ordonne : « efface les autres versions et les details, et tu
  appelles ce version 1.0 ». Execute en deux temps pour ne jamais laisser le
  client sans release : d'abord publier 1.0, ensuite retirer les 0.1.x.
- `b794e97` = version 1.0.0 (`package.json`) + README rebranche sur la release
  courante (le bloc historique v0.1.0 remplacé par la note « versions 0.1.x
  retirées »). CI **7/7** (`41668499131`), jobs `gates` inclus.
- Tag `v1.0.0` pose sur `b794e97` **apres** la CI verte — pas avant. Run
  installateurs `41673289004` : attempt 1 a vu `build-mac` **cancelle** sans un
  seul step execute (sans concurrence declaree dans le workflow, cause non
  nommee — un cancel-ghost) ; re-run de l'attempt, 3/3 jobs success.
  **4 assets** datees 16:40–16:43Z, apres le push du tag ; smoke AppImage a
  l'etape 8 avant l'attach a l'etape 10.
- Releases **v0.1.0 → v0.1.4 supprimees** (`gh release delete`) avec leurs tags
  distants et locaux. Reste : `v1.0.0` seule release, plus le tag `demo-media`
  (pas une version, laisse). L'historique git et le journal ne se reecrient pas :
  les 0.1.x restent lisibles dans l'arbre, seul le telechargement public est
  repris en 1.0.
- **P4b reste non livre** : bind `127.0.0.1` (`server.ts:250`), decision du
  maitre en attente (A/B/C).
- Cible du pentest Shannon (plan `015`) = l'arbre **v1.0.0** — le prerequis
  « execute apres la release » est desormais rempli.

### P4b — l'exposition LAN, tranchee par le maitre (03/11, option A)

- Le maitre a choisi **A** : opt-in explicite. Le defaut reste le loopback.
- `server.ts` : `HOST = process.env.HOST || (lireLanAcces() ? "0.0.0.0" : "127.0.0.1")`,
  avec `lireLanAcces()` = `settingsStore.value?.lan_acces === true` (un champ
  absent vaut `false`). Lenvironnement `HOST` reste maitre : les sonde et le
  harnais posent leur propre bind.
- `src/routes/settings.ts` : `/api/network-info` rend `lan_acces` en plus de
  `ip`/`port`/`url`, et **`url` est null tant que le LAN n'est pas expose** —
  le QR ne peut plus annoncer une adresse injoignable. La route resout le bind
  exactement comme `server.ts` (meme formule), donc les deux ne peuvent pas se
  contredire.
- `SettingsView.tsx` : case `lan_acces` + avertissement (visible sur le reseau
  local / 127.0.0.1 seul / redemarrer apres modification), clefs
  `lanAccesOptIn` et `lanAccesAvertissement` ajoutees aux **5 langues chargees**
  (fr, en_a, de_a, es, it).
- Mesures (serveur du depot, bind lu dans `ss -tln`) :
  `eteint` → `lan_acces:false, url:null` et ecoute `127.0.0.1:PORT` ;
  `HOST=0.0.0.0` → `lan_acces:true, url=http://192.168.1.50:PORT` et ecoute
  `0.0.0.0:PORT` ; `{"lan_acces":true}` en clef → idem.
- Le contrat e2e `GET /api/network-info` est **re-ecrit pour les deux etats**
  (il exige `boolean` pour `lan_acces`, `url:null` quand `false`) : 44/44.
  `tsc` rc=0, `vitest` 208/208, `verify:types`/`bundle`/`auth`/`reglage-llm`/
  `split` rc=0. La fenetre Electron reste en `127.0.0.1`.

### Shannon — le pentest 015, joue sur l'arbre 1.0.1 (03/11, S0→S2)

- **S0 (prérequis, re-mesurés)** : Docker `29.1.3` (`active`), Node `v26.12.1`,
  `@keygraph/shannon@3.5.0` (version **figée**, image `keygraph/shannon:3.5.0`),
  Ollama `gemma4:e4b`. 150 G libres sur `/`.
- **S1 (l'instance jetable)** : `scripts/instance-pentest.sh` (rc=0) — `USER_DATA_PATH`
  = `mktemp -d` en `700`, `PORT=4310` (libre, jugé par un bind de test),
  `NODE_ENV=production`, `HOST=0.0.0.0` (seule exception au loopback, pour que le
  conteneur joigne la cible), **sans** `COOKDRIVE_AUTH_OFF` ni `COOKDRIVE_RATELIMIT_OFF`.
  Morsure : le script rougit si `USER_DATA_PATH` est absent.
  Preuves sur l'instance : `GET /api/settings` = 200 ; `POST` sans cookie = 401
  `AUTH_REQUISE` ; `setup` = 201 (rôle `maitre`) ; `login` = 200 + cookie `cd_session`.
  Isolation prouvée : le témoin `stat -c %Y` de `~/.clausio/agent_culinaire.db` ne
  bouge pas, et le dossier jetable n'est pas `~/.clausio`.
- **S2 (`--validate-auth`)** : les 3 premières étapes sont vertes au log du worker
  (`Repository path OK`, `Configuration file OK`, `Model: openai:gpt-5.4`,
  `Model config: /app/models.json`). La 4ᵉ (`validateCredentials`) rougit en
  `AgentExecutionError`, `Completed: 0/13` (aucun PDF, aucun SARIF).
  Le **schéma** de `--models-config` est relevé dans le conteneur :
  `{"providers": {"<providerId>": {"baseUrl","apiKey","api","models":[…]}}}`,
  `models` **obligatoirement un tableau**, `providerId` pris dans
  `CURATED_PROVIDERS = ['anthropic','openai','xai','amazon-bedrock']`.
- **Cause du rouge, tranchée par re-mesure** : aucune voie IP n'atteint 8092/11434
  **depuis le réseau du worker** (`shannon-net`) — ni `127.0.0.1`, ni la passerelle
  `172.18.0.1`, ni `--network host` — alors que les mêmes poids rendent `200` en boucle
  simple hors conteneur. Ce n'est pas un refus du modèle, c'est une **jointabilité**
  manquante. Le texte du fournisseur est jeté par `PROVIDER_FAILURE_MESSAGES`
  (`apps/worker/src/services/error-handling.ts`), d'où les sondes croisées.
- **0 faille remontée = une ABSTENTION**, pas un vert : le pipeline ne raggiung pas
  les phases d'agents.
- **Porte nouvelle** : `verify:pentest-isolation` = `python3 scripts/probe-pentest-isolation.py`,
  déclarée **à la fois** dans `package.json` **et** dans `DEFAUT` de `run-all-gates.py`.
  6/6 vertes, rc=0, SANS Docker ni réseau. Le lot passe de 98 à **99 portes**, toujours
  2 rouges (`verify:ui-tabs`, `verify:reception` = le même `chromium_headless_shell`
  absent du conteneur, verts dans les jobs `e2e` de la CI, qui fait autorité).

### Correction du 04/11 — la verification du pentest 015 par le maitre

- Le rapport `docs/pentest-2026-11-03.md` est complete sur **deux points**, sans
  en changer un constat :
  1. Le harnais sert aussi une jointabilite reseau —Had jugee au V16, le serveur
     `scripts/instance-pentest.sh` est un « poser-prouver-couper » son enfant
     (re-mesure par : apres la sortie du script, `GET /api/settings` → connexion
     refusée), pas un lanceur de longue durée.
  2. Les runs du scan S2 (`--validate-auth`) ont été joués par spawn manuel avec
     le même env, jamais derrière le script. Le rapport ne relevait pas cette
     limite; elle est inscrite noir sur blanc depuis.

## Chantier 21 — le scan complet du 04–05/11 a rendu trois trouvailles, toutes corrigées et mises en porte (05/11)

Suite du chantier 015 : le scan Shannon v3.5.0 est relancé pour de vrai sur la
cible isolée `http://172.18.0.1:4311/` (instance jetable, base neuve, maitre
`pentest-maitre`), avec le modèle local `openai:qwen3.8-flash-next` derrière un
**pont filtrant** `172.18.0.1:18092 → 127.0.0.1:8092`.

- **Le pont, et pourquoi il existe** : le proxy de cerveaux rend des chunks SSE
  avec des clés non standard (`exact_mode`, `tensorfold`, `speculative`,
  `requested_model`) que le parseur strict de pi refuse, et sans
  `Transfer-Encoding: chunked` undici suspend la lecture du corps. Le pont
  supprime `accept-encoding`, filtre les clés inconnues et ré-encadre le flux en
  chunked. Mesuré : `HTTP 200 | ct: text/event-stream`, 5 chunks, et le préflight
  du worker rend `TOUT VERT`. Sans lui, **aucun** agent ne démarre.
- **Ce que le scan a rendu** : `validate-authentication` Completed (5 m 21 s,
  `login_success: true`), `pre-recon` Completed 46 m 42 s (après un
  `OUTPUT_VALIDATION_FAILED` de 120 m), `recon` Completed 57 m 46 s. Les quatre
  agents de vulnérabilité sont morts sur la limite du modèle local
  (`OUTPUT_VALIDATION_FAILED` 120 m ; `AGENT_EXECUTION_FAILED` 6–108 m), **pas**
  sur un refus de la cible : le scan n'a donc **rien prouvé** sur les failles, et
  « 0 faille » reste une abstention nommée. Les deux livrables écrits
  (`pre_recon_deliverable.md` 54 646 o, `recon_deliverable.md` 78 346 o) sont la
  cartographie.
- **Trois trouvailles mesurées à la main** (worktree jetable de `6966da4` en 4312
  pour l'« avant », code patché en 4311 pour l'« après » — le détail et les
  sorties sont au §8 de `docs/pentest-2026-11-03.md`) :
  1. **CRITIQUE** — `GET /api/admin/db-download` rendait **la base entière**
     (290 816 o, 26 tables, hachages argon2 des comptes, 56 sessions vivantes,
     141 lignes d'audit) à un anonyme, parce que la gate exempte tous les GET et
     que la route n'avait aucune garde. Correctif : garde `role === "maitre"`
     dans la route + trace d'audit. Après : anonyme 403, maître 200 (l'UI passe
     par un `<a href>` avec cookie, elle n'est pas cassée).
  2. **MOYEN** — `GET /api/settings` rendait `llm_clef` en clair : le filtre du
     POST comparait le nom ENTIER à une liste fermée, donc `llm_clef` →
     `llmclef` ne matchait pas `clef`. Correctif : règle unique dans
     `services/settings.ts`, jugée par **suffixe**, appliquée à la lecture
     (`sansSecrets`) **et** à l'écriture. Limite résiduelle mesurée : un secret
     rangé sous un nom anodin sort encore (`injected_key`), le remède de fond
     reste « aucun secret dans `settings.json` » (coffre système).
  3. **FAIBLE (latent)** — l'exemption d'écriture de l'agent était un
     `startsWith` : `/suggestions/<id>/appliquer` franchissait la gate et n'était
     arrêtée que par le contrôle de rôle interne de la route. Correctif :
     correspondance **exacte** ; après, la gate refuse elle-même en
     `403 AGENT_LECTURE_SEULE`.
- **Faux positif écarté par mesure** : « un staff peut créer un maître » —
  `POST /api/users` juge déjà `actor?.role !== "maitre"` (auth.ts:142) ; mesuré
  `403 MAITRE_REQUIS`.
- **La porte grandit de 5 règles** : `verify:auth` passe de 14 à **19** contrôles
  (A4 secret absent, A5 réglages non vidés, A6 base interdite à l'anonyme,
  B10 exemption exacte côté gate, B11 exemption vraie toujours ouverte). Chaque
  nouvelle règle a été rejouée sur le code d'`HEAD` pour prouver qu'elle rougit :
  A4 `llm_clef = 'SK-doit-ne-jamais-sortir'`, A6 `200 / 290 816 o`, B10
  `403 MAITRE_REQUIS` (la route, pas la gate). Mesure finale : 19 PASS.

- **Fin du run, nommee** : arrêt par `SIGTERM` au CLI le 05/11 à 07 h 22 (7 h 48
  de run, dernière activité d'agent 06 h 22), xss 4/4 et les autres en échec ou
  reprise sur la même cause (limite du modèle). Le run n'a donc **pas** de
  « Scan COMPLETE/FAILED » : le rapport §8.1 le dit noir sur blanc, pour que
  personne ne lise cet arrêt comme un scan abouti.
- **Nettoyage mesuré** : 0 conteneur `shannon-*`, plus aucune écoute
  (4311/4312/18092/11234), worktree `wt-head` retiré, et le témoin
  `~/.clausio/agent_culinaire.db` reste à `mtime=1790247072` du début à la fin.
- **Vérification finale (05/11)** : lot local `PORTES=99 ROUGES=0`
  (`python3 scripts/lire-gates.py`), `verify:auth` 19/19, `verify:routes` 44/44
  (le contrat db-download juge désormais les deux états), vitest 208/208, tsc 0,
  build OK ; CI GitHub `41981102714` **success** sur les 7 jobs (`cb374e4`).

## 06/11 — Audit statique Cloudflare (run clausio-cf-quick-1), parent-solo declare

Lancement de l'audit statique (complément du pentest dynamique §8) sur le HEAD
`7e66d4e` : profil `quick`, périmètre `src/middleware` + `src/routes` + `electron`,
mode **source-only** (sandbox `NONE` — aucune exécution du code cible). Deviation
déclarée dans `run-metadata.json` : les sessions-enfants ont rendu
`Free usage limit reached` (4 essais consécutifs), donc le run a été exécuté
**par le parent seul**, budget 16 porté par les unités de couverture (13), 0
sous-agent — et non caché comme un run multi-agent.

- **Livrables** engage dans `docs/audit-cloudflare-2026-11-06/` :
  `architecture.md` (≤ 1 000 mots), `coverage-ledger.json` (PASS du validateur du
  skill : 13 unités = 10 in-scope + 3 out_of_scope nommées), `findings.json`
  (PASS : 6 candidats triés), `REPORT.md`, `FINDINGS-DETAIL.md`,
  `NEEDS-VALIDATION.md`, `run-metadata.json` (statut complete).
- **3 candidats confirmés (source)** : `cd-iot-webhook-token-disclosure` (high —
  `GET /api/haccp/iot-sensors` rend `webhook_token` anonymement, haccp.ts:240,
  le même token authentifie l'ingestion :334) ; `cd-backup-zip-staff-access`
  (medium — `POST /api/backup` archive TOUT `storageDir` et rend le zip sans garde
  maître, backup.ts:21-22, la route duale admin.ts:48-57 est morte par l'ordre de
  montage server.ts:216/228) ; `cd-error-message-internal-leak` (low — 7 catch
  rendent `message:String(e)`, auth.ts:59/85/123 et al.).
- **2 needs_validation (faits de déploiement)** : sondes sortantes par GET
  anonyme sur cible staff-configurable (`cd-ssrf-probe…`), budget écriture
  cumulé ~187 Mo/5 min/IP non borné (`cd-upload-disk-exhaustion`) — plans de
  reproduction exacts dans `NEEDS-VALIDATION.md`.
- **1 rejeté** : `cd-hermes-contexte-anon-readable` — la lecture libre des GET
  est le CONTRAT du produit, pas une violation de frontière (risque accepté
  consigné).
- **Porte `verify:audit-findings`** : les validateurs zero-dépendance du skill
  sont copiés dans `scripts/audit-cf/` (avec `report-schema.json`) et la porte
  `node scripts/verify-audit-findings.mjs` juge LES LIVRABLES COMMITS (ledger
  13 unités + 6 candidats, tri et fingerprint) ; déclarée dans `package.json`
  ET dans `DEFAUT` de `run-all-gates.py` (le lot passe à 100 portes). Verte en
  local avant commit.
- **Pentest dynamique à suivre** : la correction des 3 confirmés passe d'abord
  par la mesure dynamique sur instance jetable (même recette §8, HOST=0.0.0.0 +
  COOKDRIVE_PENTEST_HTTP=1) — un candidat source n'est pas un défaut mesuré.

## 06/11 — Correctifs Windows (audit portable, 12 chantiers)

Audit Windows rendu par le client (Node 24, Ollama/gemma4). Chaque point est mesuré
sur le HEAD : la baseline stashee rend les 6 juges verts, les corrections les
gardent verts, le lot complet passe à 100 portes vertes, CI `42222633197` **success**
(7 jobs) sur `10bb53e`.

- **C1 uploads** : `app.use("/uploads", express.static(uploadsDir))` ajouté dans les
  DEUX voies (dev Vite + production) de `server.ts` — sans lui les factures/scans
  tombaient dans le catch-all SPA (`text/html`).
- **C2 LLM** : défaut `gemma4:e4b-it-qat` (le modèle installé sur le poste, mesuré
  au scan 015) ; cohérence nommée : `llm_choix=llamacpp` avec `llm_url` sur le port
  Ollama (11434) rend le défaut `PORT_OLLAMA_SOUS_LLAMACPP`.
- **C3 db-download** : la garde maitre du matin est le contrat (règle A6, 403
  `MAITRE_REQUIS` ; `verify:auth` 19/19 rejoué) ; le fold WAL est porté par C4.
- **C4 WAL** : `foldWal()` (PRAGMA wal_checkpoint(TRUNCATE) sur le handle du
  serveur, jamais via `initDatabase()` qui reseede) avant copie, sidecars
  `-wal`/`-shm` copiés s'ils portent des octets ; ZIP sans `backup.zip` lui-même
  (récursion mesurée) ni sidecars (déjà folds).
- **C5 IoT** : `POST /api/haccp/webhook/iot-report` exemptée de la gate (jeton de
  webhook = le seul contrôle, haccp.ts:334) ; `verify:mode-mord` rejouée verte.
- **C6 404 JSON** : le catch-all SPA devient `/^\/(?!api\/).*/` et les `/api/*`
  inconnues rendent `404 {error:"ROUTE_INCONNUE"}` (fin des 200-HTML silencieux).
- **C7 GET pur** : `GET /api/alerts` ne fait plus que lire ; la régénération passe
  dans `POST /api/alerts/scan`, appelé par l'UI (QualityControl) et par les trois
  specs e2e qui la jugeaient.
- **C8 Windows** : `test/unit/ollama.test.ts` aligné sur le nouveau défaut ; le
  reste des chemins POSIX est déjà en suffixes.
- **C9-C12** : `npm audit` au niveau barrière (0 critical, high dev-only consignés) ;
  LFS vérifiés sur place (`git lfs ls-files`, tailles réelles : 2 650 822 / 417 771 /
  817 344 / 217 746 / 580 975 o) ; `package.json` → description + licence `EUPL-1.2`
  ; `.env.example` réécrit avec les variables RÉELLEMENT lues (mesure grep).

Témoin : `~/.clausio/agent_culinaire.db` reste à `mtime=1790247072` (intacte).
Vérifications rejouées : tsc 0, vitest 208/208, build OK, `verify:auth` 19/19,
`verify:routes` 44/44, lot `PORTES=100 ROUGES=0`, CI 7/7 success.

## Chantier 38 — Extraction IA survit au changement d'onglet, l'ingredient genere mesure (06/11)

Le maitre d'ouvrage rapporte trois defauts le 06/11 : (1) les ingredients generes
ne sont pas editables comme les autres, (2) une extraction IA qui s'arrete quand
il change d'onglet, (3) une question sur le role du paddle OCR. Reponse (3) :
paddle est la porte d'entree OCR hors ligne du produit (src/shared/ocr.ts, moteur
par defaut, 7/7 sur la piece du banc) — sans lui, seuls les PDF a couche texte
natives restent lisibles (pdfParse), les images et scans ne rendent rien, l'IA ne
sert qu'a STRUCTURER le texte deja lu.

**C38-B (le defaut principal, corrige)** : le fetch d'extraction portait par
DocumentManager.tsx (handleExtractFromDraft) : en changeant d'onglet le composant
demontait, la reponse tombait dans un setState no-op, le formulaire pre-rempli
n'etait jamais rendu. Le fetch continuait cote serveur mais le resultat etait
perdu pour l'utilisateur. Correctif (regle d'atelier-chat.ts, plan P3, le pattern
existant du depot) : store de module `src/shared/extraction-suivi.ts` (memoire de
session, useSyncExternalStore, transport injectable pour les tests). lancer()
PORTE le fetch : la reponse/erreur atterrit dans l'instantane meme si l'appelant
est demonte. DocumentManager applique la reponse au remontage (formulaire
pre-rempli + accuse idempotent, toast d'erreur accuse une fois). Banniere
`BanniereExtraction.tsx` montee dans App.tsx : « en cours / terminee / echouee »
visible DEPUIS tout onglet. Juge: `test/unit/extraction-suivi.test.ts` 6 tests
(survie au demontage, garde un seul appel a la fois, erreur NOMmee, livraison
idempotente, erreur accusee).

**C38-A (constat MESURE, pas devine)** : les ingredients generes existent via la
categorie « Ingrédient généré » posee par recipes.ts:187/314 a l'insertion d'un
ingredient inconnu du stock (le chemin reel des fiches IA). Le filtre categoriel
existants EST l'onglet ; une première version ajoutait un second onglet
Tous/Ingrédients/Genere — la mesure e2e (strict mode : 2 elements pour le nom du
bouton) a prouve le doublon et la version est revert. Le rendu reel des trois
actions pour cette categorie (crayon/poubelle/caddie) + le crayon ouvrant le
formulaire pre-rempli est juge par la NOUVELLE porte
`test/e2e/ingredient-genere-actions.spec.ts` (2/2 PASSE, semis par la vraie
route POST /api/inventory avec la categorie reelle de recipes.ts). Si le maitre
voit encore le defaut, le bundle installé peut etre perime : la porte joue la
verite du BUNDLE, pas du disque.

Accessoire mesure dans le meme commit : rendu DOUBLE de AccountsView dans
App.tsx:697-706 (deux blocs identiques `activeTab === 'comptes'`) — la vue
comptes s'affichait deux fois ; retrait du doublon, `verify:ui-tabs` 13/13
(son talon anti-doublon sidebar rejoue vert).

Proces : la premiere version de la banniere (inline dans InventoryAudit avec des
accolades dedoublees dans un attribut `className="..."`) a fait 5 erreurs TS
(guillemets fermes l'attribut trop tot) ;Industrialisation par la banniere
globale du module — le mauvais chemin a ete jete au fil de la mesure, pas gardé.
Preuves finales : tsc 0 err ; vitest 214/214 (208 + 6 du store) ; build OK ;
`verify:ui-tabs` 13/13 ; `verify:routes` 44/44 ; `verify:bundle` TOUT PASS ;
`verify:auth` vert ; `verify:types` ANY=0/70 ; `verify:csp-inline` OK ;
`verify:no-mute` OK ; e2e ingredient-generé 2/2 ; temoin mtime 1790247072
intouche.


**Complement du 07/11 (C38-bis)** : la question « pareil pour l'extraction menu
(onglet Ingenierie des Menus) ? » famille le banc mesuré ; deux deltas face a
l'extraction des documents. (a) La route /api/analyze-menu rendait un 500
GENERIQUE (« Processing failed ») : la regle llm.ts:93 (erreur NOMMÉE, jamais un
500 nu) etait bafouee ici — corrige : « L'analyse du menu a échoué : <raison> »
(premier demarrage sans IA -> IA_DESACTIVEE nommée, Ollama eteint -> le message
LlmInjoignable, JSON invalide -> visible). (b) MIEUX que documents : au changement
d'onglet PENDANT l'analyse, le fetch Continue (pas d'AbortController) et
saveGeneratedRecipes (MenuAnalysis.tsx:220-234) execute ses POST /api/recipes
MÊME demonter = les fiches SONT persistees dans Fiches Techniques de toute façon
; seul l'affichage cartes de l'onglet Ingenierie est perdu — accepté tel quel :
la carte persiste, un second bac de livraison (store) serait redondant.
Sans IA :ARCHI identique (OCR/PDF texte -> MATERIEL du prompt llm seul ->
pre-remplissage) : PaddleOCR/Tesseract ne remplissent JAMAIS les cases.
