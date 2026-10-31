# Planning de réparation — 31/10/2026

Document de travail pour deux agents locaux (**DeepSeek** = backend / harnais /
sécurité, **Qwen** = produit / UI / dette de code). Chaque tâche porte :

- **Constat** : le fait mesuré, avec la commande qui le produit (aucun chiffre
  recopié d'une note) ;
- **Action** : le geste attendu, borné ;
- **Preuve de sortie** : la commande qui doit rendre le résultat attendu ;
- **Fini quand** : le critère non ambigu.

Ordre imposé : Phase 0 → 1 → 2 → 3 → 4 → 5. Une phase ne démarre pas tant que
la précédente n'a pas sa preuve.

---

## 0. État de départ mesuré (31/10, sur `main` = 77b219e)

| # | Fait mesuré | Commande qui le produit |
|---|---|---|
| 1 | Le lot local est **vert** : `TOUT VERT` | `python3 scripts/lire-gates.py` |
| 2 | La CI du commit `8b71cc8` est **rouge** : job `gates` en échec, seul rouge `verify:ids-uniques-mord rc=1`, `ROUGE SANS NOM M1 … rougit mais ne nomme pas U2_parallele`, `MUTATIONS=3 MUETTES=1` | `gh api repos/clausake/claus.io/actions/runs/41145405288/jobs -q '.jobs[] \| "\(.name) => \(.conclusion)"'` puis artefact `13021507475` |
| 3 | Les 5 autres jobs CI sont verts (e2e, vitest, build, journal, types) | idem ligne 2 |
| 4 | Le commit `2bf439e` (verdict déterministe `U0_generateur_sync`) est en cours de jugement : run `41169433328` = `in_progress` | `gh api repos/clausake/claus.io/actions/runs/41169433328 -q '"\(.status) \(.conclusion)"'` |
| 5 | **1 vulnérabilité critique** : `dompurify` 3.4.16 (via `jspdf@4.2.1`), corrigée en **3.4.17** | `npm audit --json` ; `npm ls dompurify --all` ; `npm view dompurify version` |
| 6 | 9 `high` : body-parser, electron, markdown-it, multer, pdf-to-img, pdfjs-dist, undici, vite, xlsx | `npm audit --json` |
| 7 | **Aucun job de sécurité dans la CI GitHub** : 5 jobs seulement (types, build, vitest, journal, gates), `grep "npm audit" .github/workflows/ci.yml` = 0 | `grep -n "^  [a-z-]*:$" .github/workflows/ci.yml` |
| 8 | `DEFAUT` = **92** portes, `package.json` = **97** `verify:*` ; 5 absentes : `verify:all` (auto-référentiel), `verify:ocr-modeles` et `verify:ocr-moteur` (poids hors git, justifié), **`verify:ocr-moteur-mord`** et **`verify:instance-mord-harnais`** (écarts) | script `ast` sur `scripts/run-all-gates.py` + `package.json` |
| 9 | Capteur d'orphelines : `SONDES=63 DEMI-PORTEE=1 ORPHELINE=11 PORTEE=51`, et `hors_loi = {}` vide alors que la docstring exige une raison consignée | `python3 scripts/capteur-orphelines.py` ; `docs/reference-orphelines.json` |
| 10 | La demi-portée est nommée : `probe-garde-instance-harnais-mord.py`, `package_json: true`, `defaut: false` | `docs/reference-orphelines.json` clé `surveillees` |
| 11 | Bundle d'entrée 490 262 o pour un plafond de 620 000 (marge 129 738) ; plus gros chunks : `vendor-pdf` 422 612, `vendor-charts` 388 723, `i18n` 126 372 | `ls -la dist/assets/*.js` ; `scripts/verify-bundle.mjs:53` |
| 12 | 2 `TODO/FIXME` seulement, tous dans `src/routes/documents.ts` | `grep -rn "TODO\|FIXME" --include=*.ts src server.ts` |
| 13 | 7 occurrences de tests `.skip` | `grep -rn "\.skip(" test src \| wc -l` |
| 14 | Aucune config ESLint ; `lint` = `tsc --noEmit` | `ls eslint.config.* .eslintrc*` ; `package.json` |
| 15 | Plus gros sources : `translations.ts` 3929 l., `Purchasing.tsx` 1479, `DocumentManager.tsx` 1324, `InventoryAudit.tsx` 1226, `SettingsView.tsx` 1136, `Haccp.tsx` 1006, `RecipeModal.tsx` 921 | `find src -name "*.ts*" \| xargs wc -l \| sort -rn` |
| 16 | **3 fichiers non commités** (travail en cours, ne pas écraser) : `build-windows.yml` (retire le job `build-linux` ajouté par `77b219e`), `package.json` (`homepage` → gitlab), `probe-ids-uniques.mjs` (1 ligne vide) | `git status --porcelain` ; `git diff` |

---

## Règles de travail (les deux agents)

1. **Une tâche = un commit.** Le message nomme le défaut mesuré et la preuve.
2. Avant tout commit : `npx tsc --noEmit`, `npx vitest run`, `npm run build`,
   et la porte touchée **plus sa morsure**.
3. Ne jamais `grep` directement `test/gates.out` (binaire, rend 0 octet en
   silence) → `python3 scripts/lire-gates.py`.
4. `python3 scripts/run-all-gates.py --verify` **ne marche pas** : mesuré
   `PORTES_INCONNUES --verify` rc=2 (l'argument est pris pour une porte).
   L'ancre du journal se vérifie par `npm run verify:split`.
5. Les 3 fichiers non commités (ligne 16 du tableau) restent intouchés tant que
   la Phase 0.2 n'a pas tranché.
6. Aucune affirmation sans la commande exécutée dans le même tour.

---

## Phase 0 — Débloquer (bloquant)

### T0.1 — CI verte sur `2bf439e` — **DeepSeek**
- **Constat** : run `41145405288` rouge sur `verify:ids-uniques-mord` (fait 2) ;
  `2bf439e` corrige la dépendance au planning réseau via `U0_generateur_sync`.
- **Action** : juger le run `41169433328`. S'il est rouge, lire l'artefact
  (`gh api repos/clausake/claus.io/actions/artifacts/<id>/zip`) — **pas** les
  logs (`gh api …/jobs/…/logs` rend 404, mesuré).
- **Preuve** : `gh api …/runs/41169433328 -q '.conclusion'` = `success`, et
  l'artefact `gates.out` donne `PORTES=92 ROUGES=0`.
- **Fini quand** : la CI `main` est verte sans intervention manuelle.

### T0.2 — Triage du travail non commité — **DeepSeek + humain**
- **Constat** : 3 fichiers modifiés (fait 16). Le diff `build-windows.yml`
  **supprime** le job `build-linux` que `77b219e` vient d'ajouter pour empêcher
  la récidive « README annonce des installeurs Linux absents ».
- **Action** : décider fichier par fichier — garder / jeter / committer. Ne rien
  écraser en bloc.
- **Preuve** : `git status --porcelain` vide, ou un commit par décision.
- **Fini quand** : plus aucun diff non attribué.

---

## Phase 1 — Sécurité

### T1.1 — Neutraliser la critique `dompurify` — **DeepSeek**
- **Constat** : `dompurify@3.4.16` (via `jspdf@4.2.1`) est critique ; 3.4.17 est
  publié.
- **Action** : ajouter `"dompurify": "^3.4.17"` dans `overrides` (le dépôt
  utilise déjà `overrides` pour `tar` et `node-gyp`), `npm install`, vérifier que
  `jspdf` fonctionne (export PDF).
- **Preuve** : `npm audit --json` → `critical: 0` ; `npx vitest run` ;
  `npm run build` ; export PDF manuel/e2e.
- **Fini quand** : critique à 0 et aucun test cassé.

### T1.2 — Trier les 9 `high` par exploitabilité — **DeepSeek**
- **Constat** : fait 6.
- **Action** : monter ce qui a un correctif (`body-parser`, `markdown-it`,
  `multer`, `undici`, `vite`, `pdfjs-dist`) ; consigner avec raison ce qui n'en a
  pas (`xlsx`, `electron` si dev-only, `pdf-to-img` si transitif).
- **Preuve** : `npm audit --json` avant/après ; un paragraphe par paquet dans
  `docs/audit-*.md`.
- **Fini quand** : chaque `high` est soit corrigé, soit justifié par écrit.

### T1.3 — Poser la barrière audit dans la CI GitHub — **DeepSeek**
- **Constat** : fait 7 — la CI n'a **aucun** job de sécurité, alors que le
  garde-fou « seuil CRITICAL » est décrit dans `AGENTS.md`.
- **Action** : job `security` dans `.github/workflows/ci.yml` : `npm audit
  --audit-level=critical`, `allow_failure: false`, artefact JSON 1 mois.
  Ajouter une **morsure locale** (`verify:audit-barriere` + `-mord`) qui prouve
  que le script rougit sur une critique factice, pour ne pas dépendre du réseau
  en CI.
- **Preuve** : le job apparaît dans le run CI ; la morsure locale rend
  `ROUGE (attendu)` sur la dep factice et `VERT` sur le dépôt réel.
- **Fini quand** : une critique introduite demain casse la CI.

---

## Phase 2 — Intégrité du harnais

### T2.1 — `verify:instance-mord-harnais` : demi-portée — **DeepSeek**
- **Constat** : faits 9 et 10.
- **Action** : deux issues seulement — (a) l'ajouter au `DEFAUT` de
  `run-all-gates.py`, ou (b) la consigner dans `hors_loi` de
  `docs/reference-orphelines.json` **avec sa raison** (contrat de la docstring).
- **Preuve** : `python3 scripts/capteur-orphelines.py` → `DEMI-PORTEE=0` ; si (a),
  la porte seule est verte.
- **Fini quand** : plus aucune sonde à demi branchée.

### T2.2 — `verify:ocr-moteur-mord` : le commentaire dit « au lot », le code dit non — **DeepSeek**
- **Constat** : fait 8 ; `scripts/run-all-gates.py:327` affirme qu'elle « peut
  rester au lot », mais elle n'est pas dans `DEFAUT`.
- **Action** : l'ajouter au `DEFAUT` (elle ne dépend pas des poids selon son
  propre commentaire), ou corriger le commentaire menteur.
- **Preuve** : `DEFAUT` = 93 et `python3 scripts/lire-gates.py` → `TOUT VERT`.
- **Fini quand** : le commentaire et le code disent la même chose.

### T2.3 — Les 11 orphelines : une décision par sonde — **Qwen**
- **Constat** : fait 9 ; liste dans `docs/reference-orphelines.json`
  (`probe-ancres-haccp`, `blocs-sprint11`, `emuns-haccp`, `forme-filtre`,
  `haccp-prerequis`, `index-forecast`, `index-reel`, `index-staffday`,
  `join-stats`, `nplus1`, `stats`).
- **Action** : pour chacune — brancher à une porte, consigner `hors_loi` avec
  raison, ou supprimer si morte. Interdit : la classer sans raison.
- **Preuve** : `python3 scripts/capteur-orphelines.py` → `ORPHELINE=0`, et
  `hors_loi` renseigné avec autant d'entrées que de sondes conservées.
- **Fini quand** : aucune sonde ne cite personne.

---

## Phase 3 — Défauts produit

### T3.1 — Les 2 `TODO/FIXME` de `src/routes/documents.ts` — **Qwen**
- **Constat** : fait 12.
- **Action** : lire les deux, trancher : corriger, ou convertir en tâche tracée
  avec un identifiant.
- **Preuve** : `grep` = 0, ou 2 occurrences avec un identifiant de tâche ;
  `npx vitest run` + e2e documents verts.
- **Fini quand** : plus aucun TODO anonyme.

### T3.2 — Fichiers géants — **Qwen**
- **Constat** : fait 15.
- **Action** : extraire par domaine, **un fichier par commit**, sans changement
  de comportement (pas de refonte fonctionnelle dans le même geste).
  Priorité : `translations.ts` (données, découper par langue/domaine), puis
  `Purchasing.tsx`, `DocumentManager.tsx`, `InventoryAudit.tsx`.
- **Preuve** : `wc -l` après ; e2e des vues concernées verts ; bundle d'entrée
  stable à ±5 %.
- **Fini quand** : aucun fichier source > 800 lignes, comportement identique.

### T3.3 — Les 7 tests `.skip` — **DeepSeek**
- **Constat** : fait 13.
- **Action** : inventorier ; chacun reçoit soit une raison écrite en commentaire
  au-dessus, soit une réactivation.
- **Preuve** : la liste est dans `docs/`, et chaque `.skip` restant a son
  commentaire de raison.
- **Fini quand** : aucun skip muet.

---

## Phase 4 — Performance / bundle

### T4.1 — Poids des chunks `vendor-pdf` et `vendor-charts` — **Qwen**
- **Constat** : fait 11 (`vendor-pdf` 422 612 o, `vendor-charts` 388 723 o,
  entrée 490 262 / plafond 620 000).
- **Action** : vérifier que ces deux chunks sont bien chargés **à la demande**
  (`import()` dynamique) et jamais dans le chemin d'entrée ; mesurer le chunk
  initial avant/après.
- **Preuve** : `npm run verify:bundle` vert, et la mesure du chunk d'entrée
  documentée avant/après.
- **Fini quand** : le chargement initial ne porte ni PDF ni charts.

---

## Phase 5 — Livraison

### T5.1 — Installateurs : trancher le job `build-linux` — **DeepSeek + humain**
- **Constat** : fait 16 ; `77b219e` ajoute `build-linux` (runners ARM natifs,
  `ONNXRUNTIME_NODE_INSTALL=skip`), le diff non commité le retire.
- **Action** : décider, committer, et vérifier la release réelle.
- **Preuve** : `gh api repos/clausake/claus.io/releases -q '.[0].assets[].name'`
  contient les assets annoncés par le README.
- **Fini quand** : README, workflow et release disent la même chose.

---

## Répartition

| Tâche | Agent | Dépend de | Effort estimé |
|---|---|---|---|
| T0.1 CI verte | DeepSeek | — | 0,5 j |
| T0.2 Triage non commité | DeepSeek + humain | — | 0,5 j |
| T1.1 dompurify | DeepSeek | T0.2 | 0,5 j |
| T1.2 9 high | DeepSeek | T1.1 | 1–2 j |
| T1.3 barrière audit | DeepSeek | T1.1 | 1 j |
| T2.1 demi-portée | DeepSeek | T0.1 | 0,5 j |
| T2.2 ocr-moteur-mord | DeepSeek | T2.1 | 0,5 j |
| T2.3 11 orphelines | Qwen | T2.2 | 2 j |
| T3.1 TODO documents | Qwen | T0.2 | 0,5 j |
| T3.2 fichiers géants | Qwen | T3.1 | 4–6 j |
| T3.3 tests .skip | DeepSeek | T2.3 | 1 j |
| T4.1 chunks | Qwen | T3.2 | 1–2 j |
| T5.1 installateurs | DeepSeek + humain | T0.2 | 0,5 j |

**DeepSeek** : sécurité, harnais, CI, tests. **Qwen** : produit, UI, dette de
code, bundle. Les deux se relaient sur les phases 2 et 3 sans se marcher dessus
(fichiers disjoints).

---

## Critères de sortie globaux

Tous doivent être vrais **en même temps**, chacun avec sa commande :

1. `gh api repos/clausake/claus.io/actions/runs -q '.workflow_runs[0] \| "\(.conclusion)"'` = `success`
2. `npm audit --json` → `critical: 0`
3. `python3 scripts/capteur-orphelines.py` → `DEMI-PORTEE=0 ORPHELINE=0` (ou `hors_loi` justifié)
4. Cohérence `DEFAUT` / `package.json` : seuls `verify:all` et les deux portes OCR dépendantes des poids restent hors lot, chacun avec sa raison écrite
5. `python3 scripts/lire-gates.py` → `TOUT VERT`
6. `npx tsc --noEmit` = 0 ; `npx vitest run` vert ; `npm run build` < 620 000 o
7. Aucun fichier source > 800 lignes
8. Aucun `.skip` muet, aucun TODO anonyme

---

## Ce qu'il ne faut pas faire

- Ne pas écraser les 3 fichiers non commités avant T0.2.
- Ne pas utiliser `run-all-gates.py --verify` (rc=2 mesuré).
- Ne pas grepper `test/gates.out`.
- Ne pas conclure « pas de service » d'un seul code HTTP (voir AGENTS.md §web).
- Ne pas « corriger » un rouge de CI en le retirant du `DEFAUT` : une porte
  retirée n'est pas une porte verte.
