## Sprint 6 - Le port de la fenetre et la voie d'ecriture d'inventaire, juges (12 sept.)

### 6.1 Le client Electron chargeait une URL de convention: le port n'etait DECIDE par personne

**Le defaut, mesure et non raconte.** `electron/main.cjs` ouvrait la fenetre sur
`http://localhost:3000` en dur, pendant que `server.ts` faisait `PORT++` sur
`EADDRINUSE` quand personne ne lui avoit demande de port. Sur ce poste le 3000
est tenu par une autre application (`promo_resto`): notre serveur glissait donc
en silence sur 3001 et la fenetre affichoit l'application du voisin, sans un seul
rougissement. Deux causes jumeaux, toutes deux dans le lanceur:

1. la comparaison `stdout.includes('http://localhost:3000')` etait fausse MEME
   quand tout allait bien: `HOST` vaut `127.0.0.1` par defaut, donc la chaine
   cherchee ne paroit jamais; la fenetre ne survivoit que grece au filet de
   secours de production (`setTimeout(..., 2000)`), un pari sur la vitesse du
   disque et non un compte-rendu.
2. en production le serveur tournoit DEDANS du process Electron
   (`require(server.cjs)`) et n'avoit donc AUCUN stdout a offrir au pere.

**Le correctif en trois pieces** (et non deux: la deuxieme seule ne prouvait rien).

- `src/services/ready.ts` publie `COOKDRIVE_READY {json}` sur stdout et, quand
  `COOKDRIVE_READY_FILE` est pose, un compte-rendu ATOMIQUE (`writeFileSync` sur
  un temporaire puis `rename`). Ecrit en place, un JSON partiel se lisait comme
  un defaut du serveur, et le pere le relit des qu'il apparoit.
- `electron/ready-parity.cjs` est SEUL a lire ce format et decide de l'URL
  ouverte: le port ANNONCE, jamais le 3000 de convention. `0.0.0.0` et `::` sont
  des adresses d'ECOUTE: s'y connecter echoue, donc elles deviennent
  `127.0.0.1` (`hoteConnectable`).
- le juge de cette logique vit dans `test/unit/ready-parity.test.ts` et PAS en
  place dans `main.cjs`, pour une raison structurelle: `tsconfig.json` EXCLUT
  `electron/` et `*.cjs`, donc `npx tsc --noEmit` ne voit jamais ce qui tourne
  dans le lanceur. Y loger la decision du port auroit produit un correctif sans
  gate: ni le lint, ni la CI n'auroient rougi sur la ligne qui decide de ce que
  le cuisinier voit a l'ecran.

**La cle qui ferme le circuit: `glisse`.** Fige `PORT_DEMANDE = PORT` a
L'INTERIEUR de la fermeture recursive `startListening`, la constante reprenoit
la valeur de `PORT` a chaque rappel recursif: le serveur avoit bien glisse de
3000 a 3002 et l'annonce rendoit `glisse:false`, c'est-a-dire le contraire exact
de l'information que le client attend de ce champ (il s'en sert pour prevenir que
le port demande etait pris). Ce n'etait pas un soupon: le check `S-b` de
`scripts/probe-ready-parity.mjs` l'a rendu ROUGE avant le correctif, VERT apres.

**Preuves**: `npm run verify:ready` (sonde de parite serveur/lecteur: VRAI
serveur lance par tsx, port impose + garde d'identite confrontee, 15/15) et
`npm run verify:ready-mord` (**9/9**: chaque regle niee dans une copie isolee,
exige rc!=0 ET le check vise NOMME). Trois pieces d'orfvrerie qui ont servi:

- `check S-b` a mordu sur un defaut REEL du produit, consigne ci-dessus: la
  version "logique" du correctif (figer le port demande dans la fermeture)
  etait exactemement le defaut.
- la preuve negative a rendu deux PASS creux (M4 et M6) la ou je croyois avoir
  juge. M4 mutoit la moitie MORTE de la paire (le garde de TYPE du statut,
  alors que c'est le garde d'ENUM qui tient la regle: muter l'autre branche
  laisse le contrat intact, donc le spec reste vert pour toujours). M6 jugeait
  une reponse qui recitoit le client en envoyant justemement la valeur deja en
  base (les deux mondes rendent `7`, verdict identique). Corriges en exigeant,
  pour M6, un champ que le CLIENT N'A PAS ENVOYE (`name`) et, pour M4, la
  vraie branche d'enum. Sans l'harnais de mutations, ces deux checks auroient
  ete des ornements verts.
- le piege du jour, encor rencontre: `run_probe` lanot `sys.executable` sur un
  `.mjs`. Le message "unterminated string literal (detected at line 4)" est un
  message de PYTHON, pas de Node: il faut lire QUI parle avant de conclure que
  la source est cassee (la copie de l'arbre avoit ete prouvee identique octet
  pour octet et `node --check` rendoit rc=0). Rendre par un interpreteur et non
  par un autre est un contrat du harnais, pas un detail.

### 6.2 `PUT /api/inventory/:id`: la voie d'ecriture jugee contre sa contre-partie

**Les quatre defauts, mesures sur un serveur REEL par
`scripts/probe-inventory-put-partial.mjs` avant tout correctif** (et non
inferes d'une lecture de code):

1. `S1_CODE=500`: un payload partiel (ne changer QUE le nom) tombait dans le
   `catch`. La route lisait dix champs de `req.body` et envoyoit les DIX au
   `UPDATE`; le binding de `node-sqlite3` JETTE sur un `undefined`. Et si ce
   binding etait relache, `undefined` devient NULL en base: renommer un article
   videroit sa quantite, son unite et son prix. Les deux issues sont fausses,
   une seule les evite: ne pas mentionner dans le SET une colonne qu'aucun
   client n'a envoyee.
2. `S2_CODE=200` puis `quantity="abc"` RELU depuis la base. L'affinite
   dynamique de SQLite stocke du TEXTE dans une colonne `REAL` sans se plaindre.
   Des lors `quantity <= minStock` compare du texte a un reel, et le badge
   "ok / bas / critique" de l'auditeur devient une etiquette inventee, SANS
   qu'aucune erreur serveur ne sorte. C'est la famille exacte du KPI
   `dailyLaborCost` reste fige a 0 pendant des mois (Sprint 4.11): un PASS
   creux, juge sur la FORME du champ et non sur ce que l'ecriture y depose.
3. `S3_STATUT="defile"` relu en base: le statut etait une chaine que le CLIENT
   choisissait. Les quatre voies qui l'ecrivent (les deux badges de
   `documents.ts` et `suppliers.ts`, l'UI d'`InventoryAudit`) ne produisent que
   `ok` / `low` / `critical`, et `src/db/init.ts` y met `'active'` a l'init.
   L'ENUM ferme est donc CES quatre valeurs-la: y omettre `'active'`
   rejetteroit des lignes que le produit a lui-meme creees. Une regle trop
   stricte se presente comme un 400 parfaitement propre et casse le client.
4. `yield_percent` etait remis a 100 par tout PUT qui ne l'envoyoit pas: une
   saisie de rendement etait effacee par la premiere mise a jour d'un autre
   champ. Et `scripts/probe-put-yield.py`, la sonde heritee qui jugoit ce
   champ, ne l'a jamais vu: elle envoyoit toujours le rendement, donc n'exercait
   jamais le cas de l'ABSENCE. Une sonde ne prouve que la voie qu'elle arpente.

**Le contrat est a trois etats, et non a deux**: un champ peut etre ABSENT (on
n'y touche pas), NET (on ecrit), ou REJETE (le client a envoy une ordure -> 400).
Un booleen ne porte pas ces trois etats: d'ou le marqueur `REJETE` de
`src/middleware/validate.ts`, avec `optionalNumber` / `optionalText` /
`optionalEnum`, qui NETTOIENT (un nombre est CONVERTI et borne, jamais passe
brut; un texte blanc est refuse et non "une chaine vide legitime"). Les 400
rapportent `refused: [colonnes]`: un refus muet fait perdre la saisie du
cuisinier sans qu'il sache quoi corriger.

**Deux autres pieces de contrat** au meme endroit:

- le corps de reponse RELIT LA BASE (`item: relu`) au lieu de reciter `req.body`.
  Avant: `S4_RELECTURE=12.5` pendant que la reponse pretendait avoir mis 7. Sans
  cette relecture, une ecraserie en base reste invisible a l'ecran.
- un `UPDATE` de zero ligne n'est plus un succes: `resultat.changes !== 1` sort
  en 404. Le compteur de lignes touchees est le seul temoin independant du corps
  de reponse (le 500 de S1 le prouve: une route peut mentir a la fois sur ce
  qu'elle ecrit et sur le fait de l'avoir ecrit).

**Preuves**: `test/e2e/inventory-put-contract.spec.ts` (6 tests; ils jugent des
DELTAS et non des formes: la valeur d'une colonne NON envoyee est comparee a la
ligne de base relue depuis la BASE, et un refus est verifie ANTERIEUREMENT a
toute ecriture) + `npm run verify:inventory-put` (**9/9** mutations mordent).
Le contre-controle le plus rentable de ce spec est celui que la preuve negative
a impose: juger la relecture exige un champ que le client n'envoie pas.

### Etat des portes (12 sept., HEAD Sprint 6)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **73 tests / 6 fichiers** ·
  `npx playwright test` : **41 passed** (1 worker, 19,6 s) · `npm run build` :
  chunk d'entree **593,95 kB** (192,32 kB gzip).
- 14/14 preuves vertes, verdicts **LUS et non inferes** : `verify:sse` ·
  `verify:perf` · `verify:http` · `verify:bundle` · `verify:ratelimit` ·
  `verify:ci` **20/20** · `verify:indices` · `verify:instance-guard` **14/14** ·
  `verify:instance-mord` **3/3** · `verify:purchasing` **9/9** ·
  `verify:forecast` · **`verify:ready` 15/15** · **`verify:ready-mord` 9/9** ·
  **`verify:inventory-put` 9/9**.
- `npm run verify:all` (nouveau) lance le lot et rend `GATES=`, une ligne
  `RC <porte> <rc>` par porte, puis `ROUGES=<n>`. Le contrat de ce script est la
  raison de son existence : les budgets/lists de portes sont **LUS** dans
  `package.json` et une porte absente du manifeste rougit le lot
  (`PORTES_INCONNUES`, rc=2) au lieu de passer inapercue. Verifie dans ses deux
  directions (lot reel rc=0 / nom invente rc=2).
- ⚠ Faute rencontre et corrige PENDANT la redaction de ce harnais : le resum
  final etait ecrit `rouges = [g for g, rc in verdicts]`, c'est-a-dire
  **toutes** les portes. Le lot vert aurat rendu `ROUGES=14`. Un resum qui
  enumere mal est un resum qui ment, et il ment dans le sens tranquille.
- Nouveaux fichiers : `src/services/ready.ts`, `electron/ready-parity.cjs`,
  `test/unit/ready-parity.test.ts`, `scripts/probe-ready-parity.mjs`,
  `scripts/negative-test-ready-parity.py`,
  `test/e2e/inventory-put-contract.spec.ts`,
  `scripts/probe-inventory-put-partial.mjs`,
  `scripts/negative-test-inventory-put.py`, `scripts/run-all-gates.py`.

