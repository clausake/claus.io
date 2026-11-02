# Plan de correction — Qwen — 02/11/2026

Deux portes sont rouges au lot, et **elles ne le sont pas pour un défaut
produit** : elles passent seules, elles tombent dans le lot. Le défaut est dans
le **harnais** (la façon d'entrer dans l'app), pas dans l'application.

Mesures du 02/11, sur l'arbre `51daab1` :

| Mesure | Résultat |
|---|---|
| `python3 scripts/run-all-gates.py` | `GATES=98 ROUGES=2` → `verify:ui-tabs`, `verify:reception` |
| `npx playwright test test/e2e/ui-tabs.spec.ts` | **13 passed (46.1s)** |
| `npx playwright test test/e2e/reception-view.spec.ts` | **1 passed (6.0s)** |
| Diagnostic navigateur (`.diag-ui3.mjs`) | la landing rend, le clic sur « Accéder à la Cuisine » entre bien dans l'app, **0 erreur console** |
| `playwright.config.ts` | `timeout: 90_000`, `workers: 1` |
| Charge machine au moment du lot | `load average: 5.59`, 12 processus chromium d'un **playwright python externe** |

Conclusion : le produit est sain. Le harnais échoue quand la machine est
chargée, parce que sa boucle d'entrée **brûle tout le budget du test en clics
avalés**.

---

## E1 — `verify:ui-tabs` : la boucle d'entrée consomme les 90 s

**Fichier** : `test/e2e/ui-tabs.spec.ts`, lignes 117-136.

```ts
await page.locator("button").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
for (let i = 0; i < 10; i++) {
  const premier = page.locator("button").first();
  const texte = (await premier.textContent().catch(() => "")) || "";
  if (!/Acc[ée]der/i.test(texte)) break;
  await premier.click({ timeout: 8_000 }).catch(() => {});   // <-- 8 s avalées
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1_200);
const nav = page.getByRole("button", { name: new RegExp(nom, "i") }).first();
await nav.click({ timeout: 8000 });
```

**Défaut mesuré** : quand l'hydratation dépasse 8 s (machine chargée), chaque
`click` rend `Timeout` et le `.catch(() => {})` l'avale. 10 × 8 s = **80 s**
consommées, puis `nav.click` dépasse le `timeout: 90_000` du projet. C'est
exactement l'erreur observée : `Test timeout of 90000ms exceeded` /
`waiting for getByRole('button', { name: /Tableau de bord/i })`.

**Ce que la boucle ne fait pas** : elle ne vérifie **jamais** que l'entrée a
réussi. Elle suppose qu'après 10 clics on est dans l'app. Un clic avalé est
indistinguable d'un clic réussi.

**Correction attendue** :

1. Créer un helper partagé `test/e2e/entrer-dans-app.ts` :

```ts
import { Page, expect } from "@playwright/test";

export async function entrerDansApp(page: Page, budgetMs = 60_000) {
  await page.goto(page.url().replace(/\/$/, "") + "/", { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("button", { name: /Tableau de bord/i }).first();
  const entree = page.getByRole("button", { name: /Acc[ée]der/i }).first();
  const fin = Date.now() + budgetMs;
  while (Date.now() < fin) {
    if (await nav.isVisible().catch(() => false)) return;       // entré
    if (await entree.isVisible().catch(() => false)) {
      await entree.click({ timeout: 4_000, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  const etat = await page.evaluate(() => ({
    url: location.href,
    boutons: Array.from(document.querySelectorAll("button")).slice(0, 25)
      .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean),
  }));
  throw new Error("landing non passee en " + budgetMs + " ms — etat reel: " + JSON.stringify(etat));
}
```

2. La condition de sortie devient **« la sidebar est visible »**, pas « 10
   itérations faites ». Le budget est explicite et nommé en cas d'échec.

3. Relever le budget du test : `test.setTimeout(150_000)` dans le `describe`
   (le projet est à 90 s, insuffisant pour 12 onglets sur runner chargé).

4. **Ne pas toucher** aux assertions existantes : `texte.length > 80` et
   `erreurs === []` restent. On ne rend pas le test vert en sautant la landing.

**Preuve de sortie** :
```
npx playwright test test/e2e/ui-tabs.spec.ts              # 13 passed
npx playwright test test/e2e/ui-tabs.spec.ts --repeat-each=3   # 39 passed
npm run verify:ui-tabs                                     # rc=0
```

---

## E2 — `verify:reception` : même boucle, même cause

**Fichier** : `test/e2e/reception-view.spec.ts`, `ouvrirAchats` (lignes 257-291).

Le code est le **même motif** : 10 clics × 8 s avalés, puis `Alt+6`, puis
60 tours de `cliquer` + 250 ms. Sous charge, l'entrée échoue, l'onglet
« Réception » n'existe jamais, et le test meurt sur
`page.waitForTimeout: Test timeout of 90000ms exceeded` (mesuré dans l'artefact
du lot). Seul, il passe en 6 s.

**Correction attendue** :

1. Remplacer la boucle d'entrée par `entrerDansApp(page)` (même helper).
2. Après `Alt+6`, attendre explicitement le panneau :
   `await expect(page.getByRole("button", { name: ONGLET }).first()).toBeVisible({ timeout: 30_000 })`
   au lieu de 60 tours de 250 ms.
3. Garder le diagnostic d'état réel déjà écrit (il est bon) et le brancher sur
   l'échec de cette attente.
4. `test.setTimeout(120_000)` sur le test.

**Preuve de sortie** :
```
npx playwright test test/e2e/reception-view.spec.ts       # 1 passed
npm run verify:reception                                   # rc=0
```

---

## E3 — Le vrai critère : le lot doit être vert deux fois

Une porte qui rougit pour la mauvaise raison est un **verdict mensonger** : elle
finira par masquer une vraie régression (on apprendra à ignorer son rouge).
Après E1 et E2 :

```
python3 scripts/run-all-gates.py          # attendu : GATES=98 ROUGES=0
python3 scripts/lire-gates.py             # attendu : TOUT VERT
python3 scripts/run-all-gates.py          # second passage, même résultat
```

Le second passage compte : c'est lui qui prouve qu'on n'a pas seulement eu de
la chance sur l'ordonnancement.

---

## E4 — Preuve sous charge (obligatoire)

Les deux portes tombent **quand la machine est chargée**. Les valider à vide ne
prouve rien. Charger artificiellement pendant la mesure :

```
# terminal 1
for i in $(seq 1 8); do (timeout 300 sh -c 'while :; do :; done' &) ; done
# terminal 2
npx playwright test test/e2e/ui-tabs.spec.ts test/e2e/reception-view.spec.ts --repeat-each=2
# puis tuer les boucles
pkill -f 'while :; do :; done'
```

Attendu : **28 passed** (13 + 1) × 2, aucune erreur. Si un test tombe encore,
le message doit nommer l'état réel de la page (boutons + URL), pas un
`Timeout` nu.

---

## E5 — Règles de commit

- **Un commit par porte** (`ui-tabs`, puis `reception`), plus un commit pour le
  helper partagé s'il est créé à part.
- Le message nomme le défaut mesuré et la preuve : « lot 98/2, seul 13/13 ».
- Avant chaque commit : `npx tsc --noEmit`, `npx vitest run`, et la porte
  concernée **seule**.
- Ne pas modifier `dist/`, ne pas toucher aux assertions de contenu ni de
  console, ne pas ajouter de `test.skip`.
- Ne pas relancer le lot complet avant que les deux portes passent seules.

---

## Ce qui n'est PAS dans ce plan

- **Aucune correction produit** : le diagnostic navigateur montre la landing
  fonctionnelle, 0 erreur console, navigation OK.
- **Aucune correction de `playwright.config.ts`** (le `timeout: 90_000` global
  reste ; on relève par test, là où c'est justifié).
- Les autres points du planning du 31/10 sont hors sujet ici.

---

## Ordre d'exécution

1. E1 (helper + ui-tabs) → preuve 13/13.
2. E2 (reception) → preuve 1/1.
3. E4 (sous charge) → preuve 28/28.
4. E3 (lot complet ×2) → `GATES=98 ROUGES=0` deux fois.
5. Rapport final avec les sorties brutes, pas une intention.
