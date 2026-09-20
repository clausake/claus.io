## Sprint 12 - Recettes: les portes entieres de la route qui gardait un 200 muet (19 sept.)

**Ouvreur:** le projet des recettes avait TROIS portes d'ecriture (POST /api/recipes,
PUT /api/recipes/:id, DELETE /api/recipes/:id) et DEUX autres voies (PUT /save,
POST /generate-steps) qui ne rendaient un CONTRAT a personne: un 200 SILENCIEUX
sur une ligne qui ne part pas (PUT/save sur id absent), et un corps exploitable
dans les deux branches Ollama (generate-steps). Les sondes ont juge les cinq
voies; le code a pose un CONTRAT sur chacune; le lot des portes (GATES=32) ne
le solde que depuis son recollement de la liste LUE dans package.json.

### 12.1 POST /api/recipes : le lot se rejoue ATOMIQUEMENT, ligne par ligne

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| S2 | `quantity_per_person='beaucoup'` (un texte) entrait comme TEXTE dans une colonne REAL NOT NULL (affinite dynamique sans se plaindre) | 400 + `rejetees[{index:0, raison:'quantity_per_person_inexploitable'}]` + `refused:['ingredients']`; ZERO ligne ecrite |
| S3b | `inventory_name absent (undefined)` jetait la contrainte NOT NULL sur inventory.name → 500 sorties du catch, et le POST avait DEJA ecrit la ligne recipes (orphan recipes chez le chef) | 400 + `rejetees[{index:0, raison:'inventory_name_absent_vide'}]`; ZERO ligne recipes ni inventaire |
| S2b | `ingredients='beaucoup'` (une chaine non-tableau) ne rendait AUCUN ingredient (le for(...) sur `ingredients || []` avalait tout sans rien nommer) | 400 + `refused:['ingredients']`; ZERO ligne |
| S8 | `allergens='gluten'` (une chaine) entre comme garbage et la relecture JSON.parse('gluten') JETTE (l'Allergens Display de la UI attend un tableau) | 400 + `refused:['allergens']` |
| S9 | `language=42` (un nombre) rendait la recette INVISIBLE dans GET /api/recipes (WHERE language = ? compare TEXT a TEXT) | 400 + `refused:['language']` |

Le POST valide rend la LIGNE RELUE (pas le corps de la requete) et NOMME les
nouvelles lignes d'inventaire creees (`created_inventory`).

### 12.2 PUT /api/recipes/:id : le PUT ne part PAS sur un id absent, et le PUT ne tient PAS ses sous-lignes sur un refus

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| P2 | `name absent` → 500 + `UPDATE recipes SET name = ? name=undefined` (le champ recipes.name restait `undefined`) | 400 + `refused:['name']`; la recette reste INTACTE |
| P3 | `preparation_steps=42` (un nombre) entrait comme TEXTE dans une colonne TEXT | 400 + `refused:['preparation_steps']`; la recette reste INTACTE |
| P4 | `quantity_per_person='beaucoup'` (un texte) entrait comme TEXTE dans une colonne REAL | 400 + `rejetees[{index:0, raison:'quantity_per_person_inexploitable'}]`; les ingredients restent |
| P5 | `inventory_name absent` jetait la contrainte NOT NULL sur inventory.name → 500, les sous-lignes d'ingredients de la recette avaient DEJA ete SUPPRIMEES (DELETE FROM recipe_ingredients) et la ligne recipes restait ORPHANE | 400 + `rejetees[{index:0, raison:'inventory_name_absent_vide'}]`; les ingredients restent |
| P6 | `ingredients='beaucoup'` (une chaine non-tableau) ne rendait AUCUN ingredient | 400 + `refused:['ingredients']` |
| P8 | `PUT /api/recipes/:id` sur un id absent rendait 200 SILENCIEUX sur une ligne qui ne part pas (les sous-lignes d'ingredients et les lignes d'inventaire fantasques avaient DEJA ete ecrites) | 404; ZERO ligne recipes ni inventaire |

Le PUT valide rend la LIGNE RELUE et ses ingredients rejoint et relus
(`created_inventory`).

### 12.3 DELETE /api/recipes/:id : le DELETE emporte les sous-lignes avec la recette

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| S5 | `DELETE /api/recipes/:id` sur un id absent rendait 200 SILENCIEUX sur une ligne qui ne part pas (DELETE FROM recipes WHERE id = ? retourne 0 ligne modifiee) | 404 |
| S11b | la DELETE ne partait PAS avec les sous-lignes d'ingredients ni avec les lignes d'inventaire creees PAR LA RECETTE (elles restaient en orphelines chez le chef) | la DELETE emporte les sous-lignes et les lignes d'inventaire dont la recette supprimee etait le SEUL proprietaire; les lignes partagees restent |

### 12.4 PUT /save + POST /generate-steps : le PUT /save sur id absent rendait 200 SILENCIEUX, et generate-steps rendait un corps exploitable dans les deux branches

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| S12 | `PUT /api/recipes/:id/save` sur id absent rendait 200 SILENCIEUX sur une ligne qui ne part pas (UPDATE recipes SET is_saved = 1 WHERE id = ? retourne 0 ligne modifiee) | 404 sur une recette absente; la recette valide relit `is_saved=1` |
| R8 | `POST /api/recipes/:id/generate-steps` sur un id absent rendait 404; le corps est exploitable dans les deux branches Ollama (200 si un modele existe, 500 sinon) | 404 sur un id absent; corps exploitable |

### 12.5 Preuves LIES (et non inferrees)

```
npm run verify:recipes          22 passed (23 avec S2b)
npm run verify:recipes-voices   sonde brute S2/S3/S3b + S5/S11b/S12 (juge le PRODUIT)
npm run verify:recipes-put      sonde brute PUT P1..P8 + S12/S13 (juge le PRODUIT)
npm run verify:recipes-mord     TEMOIN vert + 14/14 MORDENT
npm run verify:all              GATES=32 ROUGES=0 (lot complet, liste LUE dans package.json)
```

Les quatre portes sont dans `DEFAUT` de `scripts/run-all-gates.py` (donc dans
`npm run verify:all`) et dans `package.json`; la liste des portes du lot est
LUE dans `package.json`, jamais recopiee. Les ancres de la morsure vivent dans
`scripts/registre-mutations-recipes.py` (fichier de DONNEES: le poste rogne les
emissions longues et une ancre mal transcrite se presente comme un « ne mord
pas », la faute du 09/09) et chaque ancre est COMPTE sur les octets relus avant
d'etre jugee.

### 12.6 Ouvert, consigne (et non oublie)

- **`POST /api/recipes/scan` est la voie multer (fichier) et elle reste NOMINALE.**
  La sonde brute `scripts/probe-recipes-voices.mjs` ne la juge PAS: elle exige
  Ollama (relue: `400/500` sans modele), donc la voie reste nominale faute de
  fixture. Le contrat du scan n'est pas pose.
- `routes.spec.ts` joue la voie CRUD recettes (`test/e2e/routes.spec.ts`,
  test « CRUD recettes ») et reste hors du lot des portes (le spec reste
  NOMINAL: il est joue manuellement, pas par un gate). Le PUT du spec porte
  `quantity_per_person: 15, unit: 'g'`, inventory_name 'Beurre Test Modifie'
  qui n'est PAS dans l'inventaire; la sonde brute S10 rendait 500 sur la voie
  PUT du spec (le code NEW pose le CONTRAT: 400 + rejetees); le spec reste
  VALIDE (47 passed) avec le code NEW.

