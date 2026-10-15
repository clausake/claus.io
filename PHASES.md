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
