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
