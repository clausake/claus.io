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

