# Audit de professionnalisme — chantier 014 — verdict et plan de correction (03/11/2026)

**Objet** : le chantier `014` (P1→P5) est poussé, la CI est verte, et pourtant
quatre défauts de fond ont été mesurés le 03/11 à 12 h. Ce document les nomme,
les chiffre, et donne la réparation exacte. **A0 est bloquant** : tant qu'il
n'est pas fait, la porte `verify:split` est verte pour une mauvaise raison.

---

## 0. Verdict en une page

### Ce qui tient (mesuré ce jour)

| Preuve | Commande | Résultat |
|---|---|---|
| types | `npx tsc --noEmit` | `rc=0` |
| tests unitaires | `npx vitest run` | **206 / 206**, 19 fichiers |
| contrat backend | `npm run verify:types` | `ANY_BACKEND=0 FICHIERS=69 SEUIL=0`, `rc=0` |
| bundle | `npm run verify:bundle` | `TOUT PASS`, `rc=0` |
| routes | `npm run verify:routes` | **44 passed**, `rc=0` |
| journal | `npm run verify:split` | `VERDICT anti-perte: OK`, `rc=0` |
| CI P2/P3/P4a/P5 | runs `41596838405`, `41608437380`, `41617668110`, `41621401346` | **7/7** chacun |

Les quatre correctifs fonctionnels sont réels et testés : `baseNue` (12 tests),
le datalist (CI verte), le store du chat (8 tests), `choisirIpLan` (7 tests,
mesure live `192.168.1.50`).

### Ce qui ne tient pas (mesuré ce jour)

| # | Défaut | Mesure |
|---|---|---|
| **D1** | **La preuve anti-perte est devenue auto-attestée** : le `.orig` a été écrasé par le recollé | `.orig` avant : 2 134 lignes / 133 404 o / sha `0360a1fe…` ; après : 5 004 lignes / 301 342 o / sha `d661705c…` |
| **D2** | **Le manifeste a été reformaté** (bruit de diff) | `git diff --numstat 7d525ac..HEAD -- phases/manifest.json` → **186 / 186** lignes, alors que le changement sémantique est **1 ligne** (`original_sha256`) |
| **D3** | **Le journal annonce un run CI 7/7 qui n'existe pas** | `41594054793` : `gates=cancelled` (6/7) ; `PHASES.md:1736` dit « CI 7/7 » |
| **D4** | **Le journal annonce 46 routes, la porte en juge 44** | `verify:routes` → `44 passed` ; `PHASES.md:1779` dit 46/46 ; `PHASES.md:1542` dit déjà 44 (contradiction interne) |
| **D5** | **Régression i18n** : l'accueil du chat est figé en français | `chatWelcome` n'a **plus aucun consommateur** (5 fichiers de traduction l'exportent, 0 lecture) ; mesuré : accueil store `"Bonjour ! …"` ≠ `EN_A.chatWelcome` |
| **D6** | **Contrat e2e non suivi** : le test exige `ip: string` alors que la route rend `null` | `test/e2e/routes.spec.ts:463` `expect(typeof body.ip).toBe("string")` |
| **D7** | **Trou de `baseNue`** : une URL réduite à un suffixe donne une cible à base vide | `cibleDuReglage({llm_choix:"ollama", llm_url:"/v1"})` → `{"base":""}` |
| **D8** | Hygiène : export mort, ref morte, 3 fautes, double cast | `messagesInitiaux`, `messagesEndRef`, `defest`, `premriere`, `verEthernet`, `as unknown as` |

### Le défaut de méthode qui a produit D1

`scripts/decouper-phases.py:179-180` n'affiche que **12 caractères** de sha, alors
que `phases/manifest.json` exige les **64**. Et `:185-188` dit « une ligne du
journal a bouge » même quand seule l'ancre est périmée. Pire : `_ancre_externe()`
n'est appelé **que si** `ok` est vrai, donc une ancre périmée **masque** un `.orig`
incohérent. C'est ce piège qui a conduit à écraser le `.orig`.

---

## A0 — (BLOQUANT) restaurer l'ancre d'origine

### Pourquoi c'est bloquant
Le `.orig` est la **preuve extérieure** que le découpage n'a perdu aucune ligne.
En le remplaçant par le recollé, la porte compare le recollé à lui-même : elle ne
peut plus rougir. `phases/.pre-split/SHA256.txt` contredit d'ailleurs l'état
actuel (`0360a1fe…  PHASES.md.orig (etat d'origine … ne pas retablir)`).

### Recette (VALIDÉE dans un worktree jetable le 03/11)

```bash
# 1) restaurer le .orig d'origine (blob 4e4388d6e87d, sha 0360a1fe…)
git show 7d525ac:phases/.pre-split/PHASES.md.orig > phases/.pre-split/PHASES.md.orig

# 2) repartir du manifeste d'AVANT la reformatation et ne changer qu'UNE ligne
python3 - <<'PY'
import subprocess
raw = subprocess.run(["git","show","7d525ac:phases/manifest.json"],
                     capture_output=True, text=True, check=True).stdout
ancien = "05be31a719cff4439aba28039ec7352f7efb0930a320865b8bfeecf5bce39a96"
neuf   = "d661705c0a201d31d697cfe36b8b53b1e5c41668ea56d2f7550ce02bc47bd915"
assert raw.count(ancien) == 1
open("phases/manifest.json","w").write(raw.replace(ancien, neuf))
PY

# 3) committer AVANT de juger (la preuve externe compare au blob commité), puis
git add phases/.pre-split/PHASES.md.orig phases/manifest.json
git commit -m "A0: ancre du journal restauree — le .orig d'origine (0360a1fe) revient, seul original_sha256 suit le recolle"
npm run verify:split
```

### Sortie attendue (mesurée en worktree)
```
VERDICT anti-perte: OK | recolle d661705c0a20 | original consigne d661705c0a20
ANCRE .orig: OK -- sha conforme au manifeste ET egal au blob commite 4e4388d6e87d
```
Et `git diff --numstat 7d525ac HEAD -- phases/manifest.json` doit rendre **`1 1`**
(pas `186 186`).

### Interdits
- **Ne pas** toucher `sha256_original_avant_reancrage` (reste `0360a1fe…`).
- **Ne pas** toucher `phases/.pre-split/SHA256.txt`.
- **Ne pas** réécrire l'historique : le message du commit `11834ec` annonce un
  ré-ancrage du `.orig` — c'est faux et il reste dans l'histoire. La correction
  se consigne dans le journal (A2), pas par un `rebase`.

---

## A1 — réparer l'outil qui a induit l'erreur

`scripts/decouper-phases.py`, fonction `verify()` :

1. Afficher les shas **complets** (64) dans le verdict, pas `[:12]` : le manifeste
   exige 64, l'outil en donne 12 → l'étape suivante est une devinette.
2. **Toujours** jouer `_ancre_externe()`, même quand `got != original_sha256`
   (aujourd'hui le court-circuit masque un `.orig` cassé).
3. Distinguer deux verdicts :
   - `ancre perimee` (le recollé a changé, ex. consigne ajoutée) → afficher le sha
     complet et la ligne exacte à reporter ;
   - `ligne perdue` (archive absente / segment non résolu) → garder le message
     actuel de restauration.

Preuve : `python3 scripts/decouper-phases.py --verify` doit afficher 64 caractères
et, sur un manifeste volontairement périmé (test jetable), le mot « ancre
perimee » — jamais « une ligne du journal a bouge » quand aucune ligne n'a bougé.

---

## A2 — corriger le journal, puis ré-ancrer

`PHASES.md`, entrée « Campagne 03/11 — plan 014 ».

1. Remplacer la ligne (actuellement `:1736`) :
   ```
        CI 7/7 (`41594054793`). Bounded E2E :
   ```
   par :
   ```
        CI 6/7 (`41594054793` : le job `gates` a ete ANNULE par la vague
        suivante, pas echoue ; le lot complet est vert sur `41621401346`). Bounded E2E :
   ```
2. Remplacer (actuellement `:1779`) :
   ```
        46/46, CI 7/7 (`41617668110`).
   ```
   par :
   ```
        44/44 (mesure : 44 tests verts ; la vitrine en annonce 46, cf. la lecon
        deja consignee), CI 7/7 (`41617668110`).
   ```
3. Ajouter, à la fin de l'entrée, une sous-section **« Correction du 03/11 — ancre du journal »** :
   - le commit `11834ec` annonçait à tort « le .orig est ré-ancré » ; le `.orig`
     et `sha256_original_avant_reancrage` ne bougent pas, seul `original_sha256`
     suit le recollé ;
   - l'état est restauré (`0360a1fe…`, 2 134 lignes) et la porte le prouve ;
   - nommer le piège de l'outil (A1) pour qu'il ne se reproduise pas.
4. Re-ancrer **conformément à la recette** : `npm run verify:split` rend `rc=4` +
   le sha complet du recollé (après A1) → le reporter dans `original_sha256` →
   rejouer `verify:split` **avant** de committer, puis re-committer et re-jouer
   (la preuve externe exige le blob commité).

---

## A3 — i18n : l'accueil du chat doit suivre la langue

`src/shared/atelier-chat.ts` : ajouter
```ts
/** Remplace l'accueil TANT QUE la conversation est vierge. Changer de langue
 *  ne doit jamais effacer un echange en cours. */
export function poserBienvenue(texte: string): void {
  const t = texte.trim();
  if (t === "") return;
  if (etatCourant.derniereReponse !== null) return;
  if (etatCourant.messages.length !== 1) return;
  if (etatCourant.messages[0].role !== "assistant") return;
  if (etatCourant.messages[0].content === t) return;
  remplacer({ messages: [{ role: "assistant", content: t }] });
}
```
`src/components/CulinaryChat.tsx` :
```ts
useEffect(() => { if (t.chatWelcome) poserBienvenue(t.chatWelcome); }, [t.chatWelcome]);
```
Tests (`test/unit/atelier-chat.test.ts`) : accueil vierge localisé ; après un
`envoyer`, `poserBienvenue("autre")` ne change **rien** ; chaîne vide = no-op.

Et la clé manquante : `aucuneAdresseLan` est lue par `SettingsView.tsx:672` et
`:694` mais **définie nulle part** → ajouter la clé après `localWifiAddress`
dans les 5 fichiers `src/data/translations/{fr,en_a,de_a,es,it}.ts` :
`fr` « aucune adresse LAN détectée » · `en` « no LAN address detected » ·
`de` « keine LAN-Adresse gefunden » · `es` « no se detectó ninguna dirección LAN » ·
`it` « nessun indirizzo LAN rilevato ».

Preuve : un script qui lit `instantane().messages[0].content` après
`poserBienvenue(EN_A.chatWelcome)` et compare à `EN_A.chatWelcome` → égal.

---

## A4 — le test e2e doit suivre le contrat `null`

`test/e2e/routes.spec.ts` (test `GET /api/network-info`, ~ligne 463) : remplacer
les deux `typeof … toBe("string")` par une assertion de **cohérence** :
```ts
expect(res.status()).toBe(200);
const body = await res.json();
expect(typeof body.port).toBe("number");
if (body.ip === null) {
  expect(body.url).toBeNull();          // P4a : aucune candidate LAN = null honnete
} else {
  expect(typeof body.ip).toBe("string");
  expect(body.url).toBe(`http://${body.ip}:${body.port}`);
}
```
Sinon le test rougira sur toute machine sans carte LAN (tailscale seul, conteneur),
alors que la route fait exactement ce que le plan P4a exige.

---

## A5 — hygiène du code livré

1. `src/shared/atelier-chat.ts` : supprimer l'export mort `messagesInitiaux`
   (aucun consommateur mesuré) ; corriger `le defest est le vrai fetch` → `le defaut`.
2. `src/components/CulinaryChat.tsx` : supprimer `messagesEndRef` (déclaré `:48`,
   posé `:171`) — le scroll utilise déjà `messagesContainerRef`.
3. `test/unit/atelier-chat.test.ts` : corriger `premriere` → `premiere` (`:64`, `:70`) ;
   supprimer le bloc `bornes = gros.reduce(...)` du test R4 : il vérifie le test
   lui-même, pas le store. Garder `poserEtat` + `envoyer` + les assertions.
4. `src/shared/reseau.ts:24` : `"verEthernet"` → `"vEthernet"` (la coquille marche
   par accident grâce au `toLowerCase()`, ce n'est pas une raison).
5. `src/routes/settings.ts` : supprimer le double cast
   `as unknown as Record<string, CandidateInterface[] | undefined>` en rendant
   `name` optionnel dans `CandidateInterface` : `os.networkInterfaces()` est alors
   structurellement assignable, sans mensonge de type.

---

## A6 — le trou de `baseNue` sur la branche ollama

Mesuré : `cibleDuReglage({llm_choix:"ollama", llm_url:"/v1"})` rend
`{"cible":{"style":"ollama","base":""}}` — une cible sans base, qui ne peut pas
être sondée. Réparer :
```ts
if (choix === "ollama") {
  const brut = (r.llm_url ?? "").trim() || DEFAUT_OLLAMA;
  const base = baseNue(brut) || DEFAUT_OLLAMA;
  return { cible: { nom: "reglage", style: "ollama", base, modele } };
}
```
Test : `cibleDuReglage({llm_choix:"ollama", llm_url:"/api"})` → base `DEFAUT_OLLAMA`.
(La branche `llamacpp` rend déjà `URL_ABSENTE` : ne pas y toucher.)

---

## A7 — preuves de sortie (à coller dans les commits)

```
npx tsc --noEmit                                  # rc=0
npx vitest run                                    # 206 + les nouveaux tests
npm run build                                     # rc=0
npm run verify:types && npm run verify:bundle     # rc=0
npm run verify:routes                             # 44/44
npm run verify:split                              # OK + ANCRE .orig OK
```
Puis **CI 7/7 sur le commit poussé** (les 7 jobs, y compris `gates` : ne pas
citer un run dont un job est `cancelled`).

Limite nommée : `npm run verify:ui-tabs` est **rouge sur cette machine** —
mesuré ce jour : `browserType.launch: Executable doesn't exist at
…/chromium_headless_shell-1234/…` (binaire Playwright absent), pas un défaut du
dépôt. La CI le juge.

---

## A8 — publier 0.1.4 (ordonné par le maître)

Rappel mesuré : la seule release publique est **v0.1.3** (assets du 02/11
17:36–17:39Z), **antérieure aux quatre correctifs**. Le portable du maître ne les
a donc pas. Étapes :

1. `package.json` → `0.1.4`, commit.
2. CI verte sur le commit, puis tag `v0.1.4` poussé.
3. Run `installateurs` : `build-linux :: smoke AppImage` **avant**
   `attacher les installeurs` ; les trois jobs de build verts.
4. `gh release create v0.1.4 --verify-tag --notes-file …` **juste après** le push
   du tag, pour que `softprops/action-gh-release` s'attache à la release existante.
5. Vérifier : 4 assets datés **après** le push du tag ; v0.1.3 intacte ; aucun tag
   `*smoke*` / `*-test*` ; pas de `--latest` forcé.
6. Notes de release : nommer que 0.1.4 part **sans** P4b (l'exposition LAN reste
   refusée tant que A/B/C n'est pas tranché) et que si le maître choisit A, ce
   sera 0.1.5.

---

## Interdits (inchangés)

- Toucher `pdf-parse` (4 routes métier).
- Ajouter une dépendance.
- Binder `0.0.0.0` par défaut ; désactiver auth ou rate-limit ; changer `HOST`.
- Ajouter un `:any` backend (seuil 0).
- Poser une porte `verify:` hors de `DEFAUT` de `scripts/run-all-gates.py`.
- Laisser un tag de test ; re-tagger v0.1.2/v0.1.3 ; forcer `--latest`.
- Réécrire l'historique poussé (la correction de D1 passe par le journal, pas
  par un `rebase`).
