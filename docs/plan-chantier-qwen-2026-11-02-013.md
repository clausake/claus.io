# Plan d'attaque — Qwen — publier l'arbre audité (02/11/2026, après E1–E4)

## Verdict de l'orchestrateur sur E1–E4 (exécuté par Qwen, revérifié ce jour)

| Étape | Verdict | Preuve |
|---|---|---|
| E4 README | ✅ | `README.md:95` désigne « 0.1.2 ou plus récent » + lien vers la release |
| E2 journal | ✅ | `npm run verify:split` → `recolle 982b4902ccd1 == original consigne`, ancre `.orig` conforme au blob committé |
| E3 audit runtime | ✅ **sur l'arbre** | `pdf-to-img`/`xlsx` retirés de `dependencies` sans toucher au code (diff = manifests + doc) ; `npm audit --omit=dev` → `{high: 0}` ; zéro import résiduel |
| E1 smoke | ✅ | run `41461007802` : `build-linux :: smoke AppImage -> success` — vrai AppImage, jeton d'instance vérifié, UI rendue, pas de `continue-on-error` |
| CI | ✅ | 4 runs verts (`fdc50e3`, `fbeb83d`, `1d81cb9`, `c425339`), 7/7 jobs |

## L'erreur détectée : la release publique précède le chantier

Mesures :

- Les 4 installeurs de la release **v0.1.2** (celle que télécharge un client) portent `cree/maj = 2026-11-02T10:41–10:44Z` → construits depuis **`946e592`**, AVANT E3.
- À `946e592`, l'arbre runtime portait **4 `high`** (`pdf-to-img`, `pdfjs-dist`, `xlsx`…). Donc les binaires publiés embarquent encore les paquets vulnérables.
- L'arbre propre et smoke-prouvé (`c425339`) n'est publié **nulle part** : ses binaires ont été attachés à la release du tag `v0.1.2-smoke.1`, supprimée depuis (vérifié : plus de tag, plus de release, 3 releases au total, assets v0.1.2 intacts).

Conclusion : « logiciel fonctionnel sans erreurs » n'est pas encore vrai **pour ce que le client télécharge**. Il faut publier l'arbre courant.

## P2 (d'abord) — `pdf2pic` : dépendance prod morte, donc embarquée

Faits mesurés :

- `npm ls pdf2pic` → `clausio@0.1.2 └── pdf2pic@3.2.0` : **aucun reverse-dépendant**, dépendance directe.
- `git grep -n "pdf2pic" HEAD -- src server.ts scripts electron` → **zéro occurrence vivante** (les seuls `.avant-*`/`.orig` de `scripts/blocks/` sont des copies historiques, et `build.files` n'embarque que `dist-server/**`, `dist/**`, `electron/**`, `package.json`, vocab/embeddings — pas `scripts/`).
- `pdf2pic` exige GraphicsMagick à l'exécution : poids mort embarqué chez le client.

⚠ **Ne pas retirer `pdf-parse`** : il est utilisé (imports mesurés dans `src/routes/documents.ts:8`, `haccp.ts:6`, `menu.ts:6`, `recipes.ts:27`).

Action (méthode E3, aucune réécriture de code) :

```
npm audit --omit=dev --json > /tmp/avant.json      # chiffre avant
npm uninstall pdf2pic
npm audit --omit=dev --json > /tmp/apres.json      # chiffre après
npx tsc --noEmit && npx vitest run && npm run build
git commit -am "P2: pdf2pic retirée — dépendance prod morte embarquée (npm ls: aucun dépendant, grep: zéro usage vivant)"
```

Fini quand : CI verte sur le commit, et le chiffre `--omit=dev` avant/après consigné dans `docs/audit-2026-11-02.md` (une ligne suffit).

## P1 — Publier **v0.1.3** (l'arbre audité, protégé par le smoke)

Après P2 uniquement (que la release embarque l'arbre le plus propre) :

```
npm version 0.1.3 --no-git-tag-version
git commit -am "release: 0.1.3 — runtime sans high (pdf-to-img, xlsx, pdf2pic retirés), smoke AppImage dans le workflow"
git tag -a v0.1.3 -m "claus.io 0.1.3"
git push origin main && git push origin v0.1.3
```

Puis créer la release avec notes (dès le tag poussé, avant la fin des builds — `softprops` attache à la release existante) :

- corrige les vulnérables runtime livrées (`pdf-to-img`, `xlsx`, `pdf2pic` retirés) ;
- `high 0` dans l'arbre runtime (`npm audit --omit=dev`) ;
- smoke AppImage : le serveur empaqueté répond (`/api/settings` 200, jeton conforme, UI rendue) **avant** l'attachement à la release.

Preuves exigées (sorties brutes) :

1. le run `installateurs` du tag : `build-linux :: smoke AppImage -> success` **avant** `attacher les installeurs` ;
2. `gh api repos/clausake/claus.io/releases/tags/v0.1.3` → 4 assets (`.AppImage`, `.dmg`, `.exe`, `.deb`), horodatés APRÈS le push du tag ;
3. la release v0.1.2 reste intacte (ses assets gardent leurs dates 10:41–10:44) ;
4. CI du commit de release : 7/7 verts.

**Interdits** : pas de tag `*-smoke*` laissé derrière (le mécanisme a servi une fois, mais un tag `v*` déclenche une attache — si tu en as besoin pour tester, supprime tag ET release et consigne-le dans le rapport) ; pas de `--latest` forcé ; pas de re-taggage de v0.1.2.

## P3 — Reste nommé, sans action forcée

Le smoke ne couvre que Linux (`.exe`/`.dmg` non fumés). C'est **nommé dans le workflow** (accepté par le plan) : laisse le nommage tel quel. Si tu trouves un moyen fiable de fumer le binaire Windows extrait, propose-le dans le rapport avant de l'implémenter.

## Journal (discipline E2)

Après la publication v0.1.3 : entrée datée dans `PHASES.md`, ré-ancrage **uniquement** via le sha `recolle` rendu par `decouper-phases.py`, `npm run verify:split` vert avant commit, le `.orig` ne bouge pas.

## Ordre

P2 → P1 → journal. Un commit par étape. Rapport : commandes + sorties brutes + commits + runs CI, pas d'intention.
