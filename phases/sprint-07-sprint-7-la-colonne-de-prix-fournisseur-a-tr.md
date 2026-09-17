## Sprint 7 - La colonne de prix fournisseur a TROIS portes d'ecriture, et une seule etait garde (12 sept.)

### 7.1 La lecon du jour, une seule phrase

Un contrat tenu sur la voie que l'on a sous les yeux n'est pas le contrat du
produit: **la colonne `supplier_prices.raw_unit_price` / `calculated_price_per_ref`
est ecrite par TROIS routes**, et le Sprint 6 ne jugeroit que la premiere.

| Porte | Route | Etat a l'entree du sprint |
|---|---|---|
| 1. Saisie unitaire | `POST /api/supplier-prices` | contractee (Sprint 6) |
| 2. Import de mercuriale | `POST /api/supplier-prices/import-analyze` + `.../import-confirm` | **ouverte** |
| 3. Validation de facture | `POST /api/documents` + `/api/documents/:id/validate` | **ouverte** |

Les trois debouchent sur le MEME liseur de decision: `GET .../comparison`
designe le fournisseur au meilleur `calculated_price_per_ref` et
`FichesTechniques.tsx` (~1791) chiffre un devis « optimise » avec ce prix elu.
`Purchasing.tsx` (~1069) en tire le KPI « economies actives ». **Le cuisinier
achete et chiffre ce que la colonne dit.**

### 7.2 Le signal qui a ouvert la porte 3 (a retenir pour tout harnais de mutations)

La preuve negative de la porte 1 rendit `M7 ... rc=0`: retirer `v >= 0` du
predicat d'election ne faisit rougir AUCUN test. Lecture facile: « harnais
faible ». Verdict exact: **une mutation qui ne mord pas signale soit un garde
redondant, soit une VOIE DE COMMANDE QUI MANQUE A LA MESURE** — ici aucune des
deux portes connues ne pouvait faire passer un negatif jusqu'a la comparaison.
Chercher cette voie a fait apparaitre `documents.ts:199-215`, ou l'absence de
garde etait la plus chere des trois:

```
D1_VALIDE_CODE=200 D1_PRIX_STOCK=-12 D1_BADGE_VERIFIE=1 D1_MEILLEUR_PRIX=-12
D3_VALIDE_CODE=500   D1_DOC_CODE=200 (reponse `id: undefined`)
```

soit, mot pour mot: un MONTANT NEGATIF entre en base **CERTIFIE « releve sur
facture »** (or ce badge est exactement ce sur quoi le chef decide de croire un
tarif), un montant NON NUMERIQUE fait MEURIR toute la validation en 500 (le
document restait PENDING, le stock non majore, et l'operateur ne savait pas
quelle ligne corriger), et la reponse de creation recitoit la requete (`res.json({ id })`
au lieu de `docId`) donc le `/validate` SUIVANT meurait en 404 sur un document
qui venait d'etre cree.

### 7.3 Ce que la porte 2 (import) a rendu de son cote

Sondee AVANT correctif (`scripts/probe-supplier-import-contract.mjs`), sur un
serveur reel, lignes POSEES par la route d'import puis RELLEES par les voies de
lecture de l'app:

```
I1_CODE=200 I1_LIGNES_EN_BASE=0      cle etrangere fantome -> 200, donnee perdue
I6_CODE=200 I6_LIGNES_EN_BASE=0      idem pour matched_inventory_id
I2_CODE=200 I2_PRIX_STOCK=-12        prix negatif ecrit par l'import
I3A_RAW_PRICE_RENDU=0                l'analyse FABRIQUAIT un 0 sur un texte
I3B_ELUE={"p":0,"c":0,"u":"kg"} I3B_MEILLEUR_PRIX=0 I3B_ECONOMIE_PCT=100
I4_UNITE_STOCK="g" I4_PRIX_STOCK=1 I4_CALC=1000 I4_FACTEUR_X1000=1
```

Trois pieces meriterent d'etre isolees, chacune ayant son propre piege de mesure:

1. **`I3A_RAW_PRICE_RENDU=0` et le defaut en amont.** `import-analyze` faisait
   `Number(itm.raw_price) || 0`: un prix de CSV illisible devenait un prix de
   **0 € presente au chef comme une ligne valide a cocher**, qu'il validait a
   l'ecran, et `import-confirm` l'ecrivait. Le juge de Sprint 6 (la porte 1)
   ne pouvot pas le voir: il n'arpente pas cette voie. Juger ce chemin exige
   de poster a `import-confirm` **le match RENVOYE par `import-analyze`**
   (`Purchasing.tsx` poste `matches: importMatches` sans le retoucher) — pas un
   payload invente par le test. Une sonde qui invente son propre payload juge
   un chemin que le produit n'emprunte jamais.
2. **`I4_FACTEUR_X1000=1`, et le defaut que `inv ? inv.unit : "kg"` ne couvre
   pas.** Le defaut ne masquait que l'ABSENCE DE LIGNE, pas l'unite VIDE (la
   colonne est `NOT NULL` mais la voie de creation d'inventaire y depose `""`,
   verife par relecture: `UNITE_EN_BASE=""`). Le convertisseur rendant 1 pour
   tout inconnu, `1` par « g » face a un article sans unite partait a `1000`
   en base et la comparaison le DESIGNAIT gagnant. La regle n'est pas « fermer un
   enum » (la saisie reelle vient d'une facture: « bouteille », « paquets »,
   « sachets ») mais **cesser de PRONDRE un prix par reference quand la
   conversion n'est pas defendable**: `null` est un aveu lisible, `1000` etait
   un mensonge confronte aux autres fournisseurs.
3. **La virgule decimale, jugee dans l'AUTRE sens.** `J6` verife que `"3,50"`
   est ACCEPTE et rendu `3.5`, parce que c'est ce que la PROPRE voie d'import
   de l'UI applique avant de parser (`Purchasing.tsx` ~408:
   `line[priceIdx]?.replace(',', '.')`). Sans ce contre-controle, `J5` est
   satisfait par un correctif qui refuse TOUT ce qui est texte — et le poste de
   travail du cuisinier meurt avec un 400 impeccable.

### 7.4 Les trois pieces de contract que ce sprint a posees

- **Une seule predicat de prix, partagee par les trois portes**:
  `prixOuNul(brut)` dans `src/shared/util.js` (`PRIX_MAX` compris). Une borne
  recopiee dans trois fichiers se perime en silence — la lecon des `BUDGETS`
  recopies par `audit-perf.mjs`, appliquee ici a un nombre de prix au lieu d'un
  quota de requetes.
- **Un compte-rendu qui NOMME ce qu'il ecarte.** `import-confirm` rend
  `{ importees, ignorees, rejetees: [{index, raison}] }` avec des raisons
  DISTINGUEES (`prix_absent` / `prix_non_numerique` / `prix_invalide` /
  `unite_absente` / `article_non_apparie` / `article_inexistant`) parce que le
  chef ne corrige pas la même chose. `import-confirm` de zero ligne exploitable
  est un **400 et non un 200**. Zero ligne ecrite n'est jamais une reussite:
  `resultat?.changes !== 1` jette la transaction.
  ⚠ La faute que j'ai commise et que le spec a rattrape: `prixNonExploitables`
  etait **collecte et jamais rendu** dans `documents.ts`. Une variable
  remplie et non exportee est un PASS creux: le harnais croit juger un refus
  notifie alors que la route le tait (`V2_LA_LIGNE_REJETEE_EST_NOMMEE_ET_NON_TUEE`).
- **Le REPLI d'une election est une moitie de contrat DISTINCTE de l'election.**
  Quand aucune ligne fournisseur n'est electionable, `best_price` retombait sur
  `currentPrice` **sans le controler** (mesure: `D1_MEILLEUR_PRIX=-12`), donc un
  devis a `-12 €`. Le correctif de Sprint 6 avait remplace `null` (que l'UI
  convertssait en 0: un ingredient GRATUIT) par `currentPrice`: le nombre etait
  VRAI mais NON VERIFIE. Les DEUX branches devaient porter le garde; l'UI de
  FichesTechniques ne lisant que `best_supplier_price.calculated_price_per_ref`
  (verife par lecture des consommateurs de `best_price`), rendre `null` +
  `prix_exploitable` est sir. Et `V6` verife l'inverse: avec un prix de
  reference SAIN, le repli doit rester UTILISABLE (`best_price = 12`), sinon «
  null partout » satisferait `V5` et viderait le tableau comparateur.

### 7.5 Preuves du sprint (verdicts LUS, non inferes)

- `test/e2e/supplier-import-contract.spec.ts` — 9 checks J1..J9 (un fournisseur
  par test: les lignes de tarif s'accumulent dans la base de L'INSTANCE, donc
  un test qui depend du compte de lignes d'un autre est dependant de l'ordre).
- `test/e2e/documents-validate-contract.spec.ts` — 6 checks V1..V6 (V5 est
  l'unique voie d'atteinte du repli: un article au `unit_price` corrompu — la
  voie de creation ne le borne pas — plus une ligne non convertible pour qu'un
  groupe existe. Une premiere version de V5 passait par une facture INVALIDE:
  ses lignes etant refusees AVANT, aucun groupe n'existait et le test jugoit
  le VIDE).
- `test/e2e/supplier-price-contract.spec.ts` porte desorais **S6b** (l'election
  choisit le MINIMUM, oracle ecrit a la main: 12/3,5/9 -> 3,5 et `savings_percent`
  = 83) et **S6c** (semence DIRECTE en base par `open({filename, driver:
  sqlite3.Database})`, l'API du depot — pas un `sqlite3.open()` invente). S6c
  est la reponse a « une mutation ne mord pas »: le prediat `v >= 0` protege les
  BASES DEJA LIVREES, et il ne peut etre atteint qu'en ecrivant comme un vieux
  fichier de client. Il est prouve par `expect(res.changes).toBe(1)` AVANT de
  juger quoi que ce soit, sinon le test jugerait le vide.
- Trois preuves negatives: `npm run verify:supplier-price` (**8/8**), `npm run
  verify:supplier-import` (**8/8**), `npm run verify:documents-validate`
  (**5/5**), plus `verify:installeur` (l'installeur rejoue en COPIE ISOLEE avec
  `npx tsc` dans la copie, jamais sur l'arbre de travail).
- Deux pieges de harnais rencontrés et consignes, parce qu'ils font mentir le
  verdict dans le sens tranquille:
  1. **le token exigi doit etre celui du check qui DETECTE la faute**, pas le
     titre de la mutation. M4 (retrait du `continue` d'electionabilite) faisit
     rougir `J7` et non `J5`; exiger le token de `J5` aurat declare « ne mord
     pas » une mutation qui mord.
  2. **une mutation mise dans le mauvais harnais se presente comme un « ne mord
     pas »**. La mutation du MINIMUM (`if (bestPriceEntry === null || ...)` ->
     `if (bestPriceEntry === null)`) a d'abord ete mise dans le harnais de
     l'import, alors que son oracle `S6b` vit dans l'AUTRE spec que ce harnais
     ne lance pas. Elle a ete deplacee la ou son check existe.
  3. Dans un meme test, juger le **drapeau AVANT le nombre**: Playwright stoppe
     au premier `expect` fautif, donc deux mutations differentes qui trébuchent
     le même premier expect cessent de se discriminer.
- Un `npx playwright test` complet rendu **rouge par le produit et non par mon
  code**: `routes.spec.ts` (herite) attendait `404` sur une cle etrangere de
  CORPS. Le contrat rend `400` nomme, et c'est 400 qui est juste (404 designe
  la ressource adressee par l'URI, pas une reference du payload; la voie
  unitaire et l'import jugent desorais la même cle de la même facon — la
  PARITE des portes est le fond du defaut). L'attendu a ete aligne sur le
  contrat, **consigne dans le test** et non tu, et le test renforce: l'ancien
  assert verifiait le code HTTP sans jamais juger la raison du refus.
- Le lot `npm run verify:all` porte desorais **17 portes** (les trois portes du
  contrat des prix fournisseurs y sont ENTREES, avec le motif ecrit a cote): une
  liste de portes qui ne contient pas toutes les voies d'ecriture est une liste
  qui declare jugeable ce qui ne l'est que partiellement.


