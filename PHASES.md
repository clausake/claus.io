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

## 🚧 Phase 2 — À FAIRE (architecture)
Objectif : rendre le projet **maintenable** (ne PAS toucher l'UI/esthétique).
1. **Découper `server.ts`** en routeurs Express :
   - `src/routes/inventory.ts`, `suppliers.ts`, `documents.ts`, `menu.ts`,
     `haccp.ts`, `staff.ts`, `licensing.ts`…
   - `src/db/` (init + migrations), `src/services/` (logique métier),
     `src/prompts/` (les ~30 prompts LLM dupliqués par langue)
   - `server.ts` ne fait que `app.use(router)` + listen.
2. **Découper `src/App.tsx`** : les vues existent déjà dans `src/components/`
   (Purchasing, Haccp, StaffPlanning, EpicureStudio…). `App.tsx` doit ne plus
   contenir que le routing + l'état global partagé. Extraire les gros consts
   (TRANSLATIONS, INGREDIENT_TRANSLATIONS_*, COST_DATA, …) dans `src/data/`.
3. **Activer `strict: true`** dans `tsconfig.json` + remplacer les `: any`
   (146 dans App.tsx, 9 dans server.ts).
4. **Tests** : vitest (unit) + Playwright (e2e des routes critiques).
   CI : ajouter un stage `test`.

## 🔙 Points de retour (Git)
- `a701e70` = état **original** (avant toutes modifs)
- Chaque phase a ses commits ; `git revert <sha>` pour annuler proprement.

## 🧠 Note de continuité (changement de modèle)
Le travail Phases 0+1 a été fait avec **Qwen3 32B**. La Phase 2 est reprise
avec **DeepSeek v4** (plus fort en coding). Ce fichier fait le lien : tout ce
qui est nécessaire pour reprendre est ici. Ne pas refaire Phases 0/1, elles
sont mergées. Commencer la Phase 2 au point 1 (découpage server.ts).
