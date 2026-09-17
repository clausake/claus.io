## Sprint 8 - POST /api/inventory/consume : la route que personne ne jugeait (12 sept.)

### 8.1 Ce qui a ete trouve, et pourquoi c'etait invisible

La carte des routes jugees se faisait en comparant les chemins declares de
`src/routes/*.ts` aux chemins cites dans les specs de `test/e2e/`. Le premier
calcul a rendu `0 chemins couverts` sur un spec de 500 lignes (regex inadaptee
aux gabarits `\`${BASE}/...\`` + piege du rendu du poste) : il a fallu trancher
par octets dans le kernel. La veritable liste des routes **sans aucun test**
comptait 40 entrees. Parmi elles, `POST /api/inventory/consume` n'etait pas la
plus exotique : c'est le decrement de stock que `ProductionPlan.tsx` (ligne ~102,
`handleConsumeStock`) appelle quand le chef valide un chariot de production. Elle
n'avait **aucun test, aucun 400 sur les entrees, et ignorait le compteur de
lignes touchees**.

L'ancien corps, en substance :

```ts
for (const item of items) {
  if (!item.inventory_id || typeof item.quantity !== "number") continue;  // (a)
  await db.run("UPDATE ... WHERE id = ?", [...]);                          // (b)
}
res.json({ success: true });
```

- (a) **sigillait** l'entree malformee : une quantite absente, en texte, nulle ou
  **negative** (qui, elle, REMPLISSAIT le stock) ne levait aucun signal et la
  reponse restait `{success:true}`. Le chef voyait « Stock out validated ».
- (b) `db.run(...)` rend `changes: 0` sur une clef inexistante **sans jeter**
  (etabli par sonde). Une clef inconnue laissait donc les AUTRES lignes deja
  consommees et repondait `success:true` : le decrement etait fait a moitie, en
  silence, et le stock du chef etait faux sans aucun message.

### 8.2 Deux de mes theses etaient FAUSSES, et la sonde les a defaites

Avant de mesurer, j avais ecrit dans le commentaire de la route : « `BEGIN
TRANSACTION` n existe pas en SQLite, le `ROLLBACK` du catch etait un NO-OP qui
laissait les decrements graves ». **Faux.** La grammaire SQLite est `BEGIN
[DEFERRED|IMMEDIATE|EXCLUSIVE] [TRANSACTION]`, et la sonde
`scripts/probe-consume-semantiques.mjs` rend, sur `id TEXT PRIMARY KEY, q REAL
NOT NULL` :

```
begin_transaction    {"ok":true,"changes":0}
upd_dans_txn         {"ok":true,"changes":1}
en_transaction       {"q":123}
apres_rollback       {"q":5}        <- annule REELLEMENT
upd_nan_not_null     {"ok":false,"err":"NOT NULL constraint failed: t.q"}
get_clef_inconnue    undefined
```

Deux lecons, toutes deux payees ici :

- **Ce que la sonde ne juge pas n'est pas un verdict.** Mon jugemoment portait
  sur « le mot `TRANSACTION` est-il dans la grammaire », et non sur ce qui
  decide : la **valeur de la ligne apres l annulation**. Le juge correct a rendu
  `123 -> 5`, donc la forme est valide. Je garde `BEGIN IMMEDIATE` pour une
  autre raison (le verrou d ecriture est pris a l entree, donc pas de
  `SQLITE_BUSY` en cours de lot sous WAL alors que le webhook HACCP ecrit en
  continu) et je la dis **non mesuree** : si ce choix doit un jour etre arbitre,
  il l est par un A/B sous concurrence, jamais par une impression.
- Seconde these fausse : « un NaN s ecrit dans une colonne `REAL` sans se
  plaindre ». Vrai sans contrainte ; ici la colonne est `NOT NULL` et **jette**.
  Le garde amont sur `Number.isFinite` ne sert donc pas a empecher un NaN grave
  (il rend un 400 lisible au lieu d un 500 sorti du `catch`). Le commentaire de
  la route porte desorais cette correction, et non ma version initiale.

### 8.3 Le contrat pose (`test/e2e/consume-contract.spec.ts`, 7 tests)

Chaque regle est doublee par DELTA puis RETIRER (poster par la MEME route que
l UI, exiger le mouvement exact relu en base, puis l inverse et le retour a la
ligne de base). La relecture passe par `GET /api/inventory`, **la voie de
lecture de l app**, et non par un driver `sqlite` invente par le test.

- **C1** mouvement EXACT en base (10->7, 4->2.5) ; `items` rendu = valeurs LUES
  en base ; quantite nulle refusee sans deplacement aucun.
- **C2** clef inconnue -> 400 + `unknown:[index]` + **aucune** ecriture partielle.
- **C3** dix entrees malformees (absente, texte, vide, nulle, negative,
  `1e999`, clef absente / vide / numerique / nulle) -> 400 + `refused:[0]`, stock intact.
- **C4** lot melange : refus notifie, **plus l angle mort ferme** (voir 8.4).
- **C5** `items` absent, non-tableau, vide, `null` -> 400 et **non** 500.
- **C6** consommation au-dessus du stock -> borne a 0, jamais une quantite negative.
- **C7** la forme exacte que poste `ProductionPlan.tsx` (payload recopie tel quel).

### 8.4 Preuve de morsure : 10/10, et le premier trou etait dans mon harnais

`scripts/negative-test-consume-contract.py` (`npm run verify:consume-mord`) nie
une ligne precise de la route par mutation (DEUX par voie refusee, dont la borne de clampe et le
champ `unknown` collecte/jamais rendu), dans une copie isolee (`node_modules`
symlinké), et exige rc!=0 **plus le test vise nomme** dans la sortie.

- ⚠ **M4 n a pas mordu a la premiere tentative, et c est moi qui avais tort, pas
  la mutation.** Elle faisait `res.json({ ..., items: <recitation du corps de la
  requete> })` au lieu de la relecture : le spec rendoit `7 passed`. C1 jugeait
  `items.length` et la relecture separate, jamais les **valeurs** de la reponse.
  Un PASS creux de plus, et il etait dans l harnais lui-meme. Corrigé par
  `expect(rendues.map(l => l.quantity)).toEqual([7, 2.5])`, c est-a-dire les
  quantites de la BASE (7 / 2.5) et non celles envoyees (3 / 1.5). M4 rougit
  depuis (rc=1).
- **Angle mort consignsé et non mute** (`M8`, commenté dans le script) : le
  drapeau `en_transaction` du `catch` n est exerce que si une ecriture leve entre
  `BEGIN` et `COMMIT`. Aucune voie d entree connue de cette route ne produit
  cette levee (les payloads sont valides avant le premier `UPDATE`, et la
  relecture suit un `COMMIT` deja reussi sur des clefs verifiees). Ne PAS
  conclure « garde inutile » sans avoir demande quelle entree l atteint : c est
  exactement ainsi que la porte 3 des prix fournisseurs a ete trouvee. La
  mutation `M2` juge en revanche l annulation **atteignable** (la voie des clefs
  inconnues) et elle mord.
- **C4 porte l angle mort ferme** : deux lignes valides ecrites, dont une qui
  deborde son stock et se clampe a 0, plus une troisieme clef inconnue -> les
  DEUX decrements doivent disparaitre. Si une seule annulation sautait, la ligne
  clampee survivroit. Le lot « valide + malforme » seul, lui, **ne prouve pas
  l atomicite** (le 400 part avant le premier `UPDATE`) ; le commentaire du test
  le dit pour qu on ne le compte pas comme une preuve d annulation.

### 8.5 Pieges d harnais retombes dans ce sprint (tous deja connues, tous reels)

- `lignes()` trioit les ids par ordre lexicographique : `consume-...-10` <
  `consume-...-9`. Le test devenoit **faux selon le numero de graine**, donc
  selon l ordre des tests precedents. Corrigé : l ordre est celui des ids passes
  en argument, avec un `expect(absent)` explicite par id.
- Les attentes numeriques ecrites « de tete » (`toEqual([2.5, 7])`) ont rougi
  deux fois : `10-3 = 7`, et non `2.5`. Un chiffre d attente se **calcule**.
- Port d abord figé a `4134`, puis `portLibre()` + `attendrePortLibre()` (le
  meme contrat que `purchasing-chain.spec.ts`) : un petit-fils `tsx` survivant a
  `SIGTERM` vole le port, l imposteur ne bind pas, et la porte juge alors le fils
  remanant, qui porte lui le BON jeton d instance. Le verdict rendu seroit « la
  mutation ne mord pas ».
- Le rendu du poste a de nouveau rendu des fichiers « vides » ou a identifiants
  mutés (`process.exit`, accents rendus en sequences d echapement) alors que les
  octets etoient intacts :
  chaque verdict de ce sprint a ete pris par sha256/octet dans le kernel ou par
  execution, jamais par ce qu un outil affiche.

### 8.7 Sprint 8.2 - POST /api/inventory etait le PUT du Sprint 6, en pire (meme jour)

La carte des routes sans contrat (8.6) designoit `POST /api/inventory` comme
zone a **voies d'ecriture multiples**. Elle en a TROIS, toutes dans le code de
l'UI, et la sonde `scripts/probe-post-inventory-voices.mjs` les a jouees avec
**leurs payloads reels recopies depuis les composants** (et non des payloads
inventes par la sonde — la regle consignee de l'import de mercuriale) :

- **V1** `InventoryAudit.tsx` handleAddSubmit (~280) : le formulaire d'audits.
- **V2** `DocumentManager.tsx` handleQuickAdd (~138) : l'ajout rapide depuis une
  ligne de facture. Poste `{name, unit, category, minStock, unit_price}` —
  **ni `quantity` ni `status`**.
- **V3** `HaccpModules.tsx` saveBatch (~98) : cree l'article d'un lot HACCP.
  Poste **`status:'normal'`**.

Verdicts de la sonde AVANT correctif (tous rendus, aucun suppose) :

| Cas | RENDU | Ce que ca veut dire pour le chef |
|---|---|---|
| V2 (sans `quantity`) | **500**, `ligne_en_base=AUCUNE` | **l'ajout rapide de l'ecran facture est mort** : `undefined` part au binding sur une colonne NOT NULL |
| `quantity:"beaucoup"` | **200**, relu `"beaucoup"` (`typeof=text`) | l'article existe avec un stock en TEXTE |
| `/api/alerts` sur cette ligne | **absente** (`[]`) | `quantity <= minStock` compare texte a reel : **un stock reellement bas ne s'alerte plus** |
| V3 (`status:'normal'`) | 200, relu `normal` | une etiquette que regle d'aucune ne definit; et le PUT, lui, **refuse** cette valeur |
| clef deja prise | 500 « Failed to create » | un conflit d'identifiant presente comme une panne serveur |
| `name` absent / `name:42` | 500 | le chef ne sait pas quoi corriger |
| `name:"   "` | **200** | deux lignes indiscernables et introuvables |

#### La regle « node-sqlite3 JETTE sur `undefined` » etait incomplete

Elle est consignee au Sprint 6 comme justification du « ne jamais passer un
`undefined` a l'UPDATE ». La sonde `scripts/probe-binding-undefined.mjs` la
corrige par l'experience (colonne NULLABLE vs NOT NULL) :

```
insert_undefined_nullable   {"ok":true,"changes":1}   -> la ligne ressort NULL
insert_undefined_notnull    {"ok":false,"err":"NOT NULL constraint failed"}
update_undefined_nullable   {"ok":true,"changes":1}   -> la colonne DEVIENT NULL
```

Donc `undefined` **n'a pas un comportement unique** : il jette sur NOT NULL et
**ecrit NULL en silence** sur une colonne NULLABLE. C'est le pire des deux pour
le PUT (`unit_price` est NULLABLE : un PUT partiel qui le laisserait passer
**efface le prix** sans aucune erreur), et c'est ce qui rend le POST rouge sur
`quantity`. Un `undefined` n'entre donc plus nulle part, et « une erreur le
dira » n'est **pas** une garantie.

#### Deux decisions que j'ai prises puis defaites par mesure

- **`null` ne veut pas dire « absent ».** J'avais d'abord ecrit « absent ou
  `null` = defaut du schema ». C'etait faux pour deux raisons : (a) le
  contract a trois etats du PUT distingue justement l'omission du garbage, et
  (b) le premier rendu de la sonde l'a dit sans que je le cherche —
  `JSON.stringify(Infinity)` et `JSON.stringify(NaN)` rendent `"null"`, donc un
  reel Infinity/NaN de saisie **arrive toujours comme `null`** et jamais comme
  un nombre. Le traiter comme une omission offroit un defaut compatissant a
  une saisie que l'UI n'a pas pu serialiser. Le spec P8 juge maintenant les
  DEUX branches (`null` -> 400 nomme ; omission -> 200 + defauts), et un cas
  par champ numerique.
- **Le `status:'normal'` de V3** : j'ai failli l'ajouter a l'enum (la regle
  consignee dit qu'un enum doit inclure ce que la voie d'ecriture de l'app y
  depose). Verifie au lieu de supposer : **aucune** regle du depot ne definit
  `normal` (`grep` des comparaisons de statut rend un seul consommateur,
  `status === "critical"` dans `inventory.ts`), il n'existe dans aucun des
  quatre jeux de l'UI ni de l'init, et les trois autres voies ecrivent
  `ok`/`low`/`critical`/`active`. La regle de l'enum reste donc ferme et V3
  recoit un **400** : c'est le cote HACCP qui envoie une valeur inventee qu'il
  faut corriger la, pas le stock qui doit l'admettre. La decision est signee
  par un test (P3, mutation M3).

#### Source unique des regles de forme (la lecon des trois portes, appliquee)

`src/shared/inventory-fields.ts` porte desorais les bornes de
`quantity`/`minStock`/`unit_price`/`yield_percent`, le jeu ferme `STATUTS`, les
colonnes texte, et `statutDeparse` (la MEME regle que l'UI d'InventoryAudit,
pour que le serveur ne puisse pas contredire l'ecran). Le POST et le PUT la
lisent : une borne recopiee deux fois se perime en silence (avant: les
`BUDGETS` de `audit-perf.mjs`, puis le prix fournisseur a trois portes).
**Ce qui est partage est seulement ce qui est reellement identique** : les
boucles de validation restent dans chaque route parce que leurs semantiques
sont differentes (le PUT est PARTIEL : une colonne absente n'y est pas touchee ;
le POST est une CREATION : une colonne absente recoit le defaut du schema). Les
fusionner en un seul « validateur » aurait casse la moitie des tests du Sprint 6.

#### Ce que le contrat rend maintenant (`test/e2e/post-inventory-contract.spec.ts`, 9 tests)

P0 ligne de base + relecture en base ; P1 V2 cree (fin du 500) ; P2 texte refuse
+ **les DEUX sens de la regle d'alerte** ; P3 enum ferme + statut derive ; P4
name refuse ; P5 clef prise -> **409** sans ecraser ; P6 bornes/non-nombres +
chaine numerique admise et **stocquee en nombre** ; P7 la reponse rend la ligne
RELLE ; P8 jamais de 500 sur une saisie, et la moitie « saisie minimale
legitime » qui sans lui un 400 generaliste passerait pour un contrat.

Preuve de morsure `scripts/negative-test-post-inventory-contract.py`
(**11/11**, `npm run verify:post-inventory-mord`), installee dans `verify:all` avec les
quatre portes du Sprint 8. Deux de ses lecons :

- **M5 a ete retiree, et le motif est une mesure.** Elle nioit le
  `if (brut === null) return undefined;` du helper numerique et rendoit
  `9 passed`, deux fois, avec un cas par champ. Raison etablie en rejouant le
  predicat : sous mutation le helper rend `NaN`, et la route refuse DEJA tout
  `!Number.isFinite` par son propre `refus.push`. Les deux mondes donnent le
  MEME verdict observable : **les deux voies ne commandent rien de distinct**.
  Ce n'est pas un harnais faible, c'est une garde **redondante** (elle est ce
  qui empeche qu'un changement dans l'une des deux rouvre la faille) ; elle
  n'est pas jugeable par mutation, et le consigner vaut mieux qu'une mutation
  forcee qui « mordroit » par un effet de bord non demande.
- **angle mort de P7 corrige par la loi du depot** : juger « la reponse ne
  recite pas la requete » avec des champs identiques dans les deux mondes rend
  M6 aveugle. Il fallait un champ que le client **n'envoie pas tel quel** (le
  nom a trimmer, le statut a minusculer) ; sans ce deviant, `9/9` etait creux.

#### Reste ouvert, honnetement

- `/api/inventory/bulk` est appele par l'UI (`InventoryAudit.tsx:156`) mais
  **n'est declare dans AUCUN routeur** : l'import CSV d'inventaire ne peut pas
  fonctionner. Soit la route manque, soit l'appel est mort — a trancher avec le
  chef d'atelier avant d'ecrire un contrat sur du vide.
- `POST /api/documents` (import de facture) : la sonde
  `scripts/probe-document-items-voices.mjs` existe et n'a pas encore eu son
  verdict rendu. Les colonnes `document_items.quantity` et
  `received_quantity` sont `NOT NULL`, or l'UI initialise ses lignes a
  `quantity:""` : si la route ne convertit pas, l'import de facture meurt en
  500 sur un champ que le chef n'a pas a remplir. A jouer AVANT toute decision.
- Les routes Ollama ne sont jugeables que sur leur contrat (deux branches
  modele present/absent), pas sur leur contenu.

### 8.6 Ce qui reste ouvert (non verifie)

- Les **39 autres routes** sans test de contrat (liste reproductible en comparant
  `src/routes/*.ts` aux specs de `test/e2e/`). Trois sont des zones a **voies
  d ecriture multiples**, la classe de faute la plus chere du depot :
  `POST /api/inventory` (aucune validation d entree, aucun 400, ecrit du texte
  dans une colonne `REAL` par affinite dynamique — exactement le contrat deja
  pose pour le `PUT` de ce fichier), `POST /api/robots/assign`, et
  `POST /api/haccp/*` (`temperature`, `scan`, `corrective-action`, qui nourrissent
  l audit HACCP du chef).
- **POST /api/documents (import de facture) : verdicts rendus, contrat NON encore pose.**
  La sonde rejouable `scripts/probe-document-items-voices.mjs` (relecture EN
  BASE, sa premiere version reliait par `GET /api/documents/:id` qui rend du
  HTML → elle croisait « relecture impossible », un verdict creux) rend, sur le
  payload REEL de `DocumentManager` handleAddItem (~107 initialise chaque ligne
  a `quantity:""`, `unit_price:""`):
  - A/B/C lignes en chaines VIDES ou texte -> **200 et la ligne est en base en
    `typeof=text`** (`''` / `'beaucoup'`) alors que `document_items.quantity` est
    `REAL NOT NULL` (l'affinite dynamique de SQLite ne verifie rien). Un total de
    facture calcule sur ces lignes est un chiffre invente.
  - D/E/F quantite absente, `items` absent ou non-tableau -> **500 « Failed to
    save document »** (message fourre, le chef ne sait pas quoi corriger).
  - G `inventory_id` inexistante -> **200 + ligne orphelinee en base** (aucune
    cle etrangere n'est verifiee a l'INSERT).
  - H `total_amount:"42,50"` survit en TEXTE dans une colonne REAL ('42.50' est
    lui converti par l'affinite). L'UI corrige la virgule avant d'envoyer
    (`toString().replace(",", ".")`), mais une voie d'import ou un poste tierce
    ne le fait pas.
  Ce qui EST deja juge par ailleurs : le 500 du texte non numerique a la
  VALIDATION (M3 de `verify:documents-validate`) et la clef rendue a la
  creation. Ce qui ne l'est PAS : la forme des LIGNES a la CREATION. C'est le
  prochain contrat, avec la meme triade (refus nomme + `rejetees:[{index,raison}]`
  + rien d'ecrit sur un refus) que l'import de mercuriale.
- `/api/agent/command` lance un Chromium `headless:false` : hors suite e2e, a
  couvrir sous `xvfb` dans un dedie.
- Les routes Ollama (`/api/ai/chat`, `/api/voice`, `/api/inventory/analyze`,
  `/api/anti-waste/generate`) ne sont jugeables que sur leur **contrat** (statut
  explicite + les deux branches modele present / absent), pas sur leur contenu.


