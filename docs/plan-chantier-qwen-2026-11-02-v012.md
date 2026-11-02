# Plan de chantier — Qwen — après la release 0.1.2 (02/11/2026)

## État vérifié (preuves de sortie, 02/11)

- `main` = `946e592`. CI `41430526576` : **7/7 jobs verts** (types, journal, security, build, e2e, vitest, gates = `98 portes`).
- Tag `v0.1.2` → commit `946e592`. Release publiée (non draft, non prerelease) avec **4 installeurs** : `claus.io-0.1.2-arm64.AppImage`, `claus.io-0.1.2-arm64.dmg`, `claus.io.Setup.0.1.2.exe`, `clausio_0.1.2_arm64.deb`.
- Run installeurs `41430532470` : `build`, `build-mac`, `build-linux` = **success**.
- Démarrage : `dist/index.html` ne référence ni `vendor-pdf` ni `jspdf` (grep rc=1) — le gain de démarrage est réel.

## Erreurs détectées

| # | Erreur | Preuve de détection | Gravité |
|---|---|---|---|
| E1 | **Aucun smoke test de l'installeur.** Rien ne lance le binaire construit ni ne sonde son serveur. « Fonctionnel sans erreur » n'est donc pas prouvé pour le client. | `grep -rln "api/settings\|smoke" .github/workflows/` → vide | Haute |
| E2 | **Journal absent.** La campagne (27 commits) et la release 0.1.2 ne sont pas dans `PHASES.md`. | `grep -c "0\.1\.2\|946e592" PHASES.md` → `0` | Moyenne |
| E3 | **Vulnérabilités livrées sans plan de sortie.** Les binaires embarquent les dépendances de prod ; l'audit reste à `high 6`, `moderate 29`. | `npm audit --json` → `{'high': 6, 'moderate': 29, 'critical': 0}` | Haute (client) |
| E4 | **README périmé.** Le texte dit « 0.1.1 ou plus récent » et ne désigne pas la release courante. | `README.md:95` | Faible |

Hors chantier Qwen (environnemental, non réparable depuis le dépôt) : le compositeur Chromium de la machine de dev ne produit plus de frames (`requestAnimationFrame` = 0). Les e2e locaux ne sont pas fiables ici ; la CI fait foi.

## E1 — Smoke test de l'installeur (priorité)

1. Ajouter dans `.github/workflows/build-windows.yml` (ou un workflow dédié déclenché par `v*`) un job après chaque build qui :
   - démarre le serveur **tel qu'il est empaqueté** (pas `tsx server.ts` du source) ;
   - attend `GET /api/settings` → 200 et `GET /` → 200 contenant `<div id="root">` ;
   - échoue si le serveur ne répond pas en 60 s, avec le dernier log.
2. Sur Linux, lancer l'AppImage en mode headless si le runner le permet ; sinon **nommer le blocage** dans le job (pas de succès muet).
3. Preuve : un run `installateurs` vert contenant le step `smoke` avec sa sortie.

**Interdit** : marquer le smoke `continue-on-error`, ou le rendre vert sans sonder le serveur.

## E2 — Journal

1. Ajouter une entrée datée « Campagne de réparation 31/10–02/11 » et « Release 0.1.2 » dans `PHASES.md`.
2. Re-ancrer `phases/manifest.json` **uniquement** selon la recette d'`AGENTS.md` (sha `recolle` produit par `decouper-phases.py`, jamais à la main).
3. `npm run verify:split` avant commit ; le `.orig` ne bouge pas.

## E3 — Vulnérabilités livrées

1. Pour chacun des 6 `high` et des 29 `moderate` : `npm audit --json` → chemin de dépendance → **runtime ou dev-only** (mesuré, pas supposé). Les binaires n'embarquent que le runtime.
2. Tout `high` runtime : corriger ou consigner la raison + le successeur (format de `docs/audit-2026-10-02.md`).
3. Ne rien changer en dehors des `package.json` / overrides (pas de réécriture de code pour contourner un audit).
4. Preuve : `npm audit --omit=dev --json` → nombre de `high` runtime (cible : 0 ou tous consignés).

## E4 — README

Ligne 95 : remplacer « 0.1.1 ou plus récent » par « 0.1.2 ou plus récent », et ajouter le lien `releases/tag/v0.1.2`. Rien d'autre.

## Ordre

E4 (2 min) → E2 → E3 → E1 (le plus long, dépend du runner ARM). Un commit par étape. Après chaque commit : `npx tsc --noEmit`, `npx vitest run`, et la CI doit rester verte sur le commit.

## Rapport attendu de Qwen

Pour chaque E : la commande exécutée, sa sortie brute, le commit, et le run CI vert. Pas de « c'est fait » sans sortie.
