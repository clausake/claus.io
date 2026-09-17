## Sprint 5 — Refermer la chaine logistique (10 sept.)

### 5.1 Du plan de menu au stock : `besoin → commande → reception`

**Le defaut de la chaine, mesure et non raconte.** `GET /api/purchasing/forecast`
recopiait `besoin_recettes: 0` pour CHAQUE ligne sans jamais lire `menu_planning`.
La colonne « Besoin Recettes » du tableau Achats et la suggestion de commande
(`minStock - quantity + besoin_recettes`) ne dependaient donc d'AUCUN plan : le
cuisinier qui prepare le service du lendemain voyait une colonne a 0 et
commandait a l'oeil. C'etait de l'affichage, pas du metier.

Le besoin calcule desormais, par article : **SOMME sur les plats planifies de
(couverts x gramature par personne) / (rendement/100)**, sur la fenetre
`[aujourdhui, aujourdhui + horizon]` (horizon borne, defaut 14 j, `?horizon=`).
Deux conventions **decisionees** et non heritees :
- la fenetre **part d'aujourdhui** et non du seul jour courant : la base du client
  a ses plats en J+1..J+6 et RIEN au jour du jour (un besoin calibre sur le jour
  courant eut commande 0) ;
- l'**horizon est borne** : sans luy, un planning saisi sur trois semaines
  eut commande trois semaines de stock d'un coup.
La reponse passe de `tableau` nu a `{ items, window }` : le `window` est la piece
qui rend le chiffre **verifiable** (« besoin sur 14 jours a partir du … ») au lieu
d'un nombre sans origine.

**Les couverts vivaient dans `recipe_json`** (il n'y a PAS de colonne `couverts`)
et la voie d'ecriture les rendoit illegibles, par deus fautes de la famille « cle
dissociee entre ecriture et lecture » (la meme que `dailyLaborCost`, 4.11),
debusquees par le test et non par la lecture :
1. `MenuAnalysis` envoie `recipe_details` ; la route ne lisait que `recipe_json`
   → la colonne restait `null` pour toute saisie venue de l'ecran.
2. **Pire** : `JSON.stringify(recipe_json)` re-serialiait une deïa serialisée. Un
   seul parseur rend alors une **chaine**, dont `.couverts` est `undefined`, et les
   couverts retombent a **1** : le besoin sort divise par le nombre de convives
   (**120 au lieu de 2 400** pour 20 couverts x 120 g) — un chiffre plausible et
   faux, sans aucun rougitrement possible a l'ecran ni dans les logs.
Corrections : `normalizeRecipeJson()` (les deus noms de champ acceptes, **ne
re-stringifie pas**) ; `coversOf()` relit par ailleures le double-encodage DEJA
present dans les bases livrees (tolerance de la donnee legacy, pas cache de la
faute). Le « contre-controle » (ligne legataire) du spec est ce qui donne a la
mutation M5 de quoi rougir : sans luy, la mutation etait un no-op sur des
donnees fraiches et le harnais annoncait « ne mord pas » pour une faute qui etait
ailleurs.

**Le bon enregistroit le NOM au lieu de l'`inventory_id`** (`Purchasing.tsx` :
`items.map(i => ({ inventory_id: i.name, … }))`). Le document se cree, son detail
aussi, tout reste **VERT** et la jointure d'inventaire est creuse : le jour ou
quelqu'un valide ce document, l'`UPDATE inventory … WHERE id = <nom>` ne touche
AUCUNE ligne, sans la moindre erreur serveur. `POST /api/purchasing/order` resout
donc chaque ligne contre `inventory` et fait rougir une **400** si l'une ne resout
pas (`unknown_items` est rapporte) : la route est le contrat de la cle.

**La chaine s'arrestait au PDF : aucun chemin du bon vers le stock.** Le
cuisinier imprimait, rangeait, et devoit ressaisir la facture dans l'autre vue
pour que le stock bouge. Nouvelles routes : `GET /api/purchasing/orders` et
`POST /api/purchasing/orders/:id/receive`.
- **Idempotence** : une ligne deja receue en totalite n'est PAS recomptee
  (double-clic ou retry reseau ; le statut **reste** `RECEIVED`, donc rien ne
  rougit a l'ecran sans le garde).
- Le statut se juge sur le **solde cumule** et non sur le lot du coup : un no-op
  ne doit pas retrograder `RECEIVED` en `PARTIAL`.
- La reception **n'escrit pas** `unit_price` ni `supplier_prices` : le prix est la
  verite de la FACTURE, pas celle du bon. Les deus voies se battaient le meme
  champ et la derniere gagnante eust fausse le cout matiere pour des mois.

**Deus gardes ajoutees a `POST /api/documents/:id/validate`** (lui aussi un
mouvement de stock) : un document **deja valide** est refuse (409) — sans luy, un
double-clic sur « Valider » additionnait la marchandise **deus fois** ; un
`COMMANDE` **ne se valide pas** (409, liste blanche des types validationables) —
un bon porte des quantites *prevues* et non receues, validee par megarde puis
receptionnee il additionnait deus fois. Et cote UI, `handleValidate` avoit un
`if (res.ok)` **sans branche d'echec** : un refus ne faisoit RIEN a l'ecran, le
cuisinier cliquoit, rien ne bougeoit, il recliquoit — une route qui refuse doit
se **dire** (`toast` du message du serveur).

### 5.2 La vue (un panneau manquant est un echec, meme si les gates numeriques passent)

`Purchasing.tsx` : onglet « Reception » (badge de compte), detail des lignes
(designation, quantite commandee, recue) et bouton « Receptionner » derriere un
`ConfirmDialog` (point d'`alert()`). Le badge « hors inventaire » se juge sur
**`in_stock`** — la colonne qui dit la verite metier, et non sur
`inventory_id IS NULL` : une cle **peut** estee posee (le bon a ete cree quand
l'article existoit) et ne plus rien resoudre depuis. Pareillement, une ligne dont
l'article a quitte l'inventaire ne sera **jamais** receptionnable : la laisser
compter dans le solde, c'est un bon qui reste `PARTIAL` tousjours et qu'on ne peut
plus cloturer ; elle reste signalee a l'ecran et son `received_quantity` reste vide.

### 5.3 Mesures, preuves et pieges (le detail)

**Index** (`scripts/probe-index-forecast.py`) : `DATE(col)` est **non sargable** —
gain mesure **−0,6 %** (l'index ne peut pas s'appliquer sous une fonction). La
variante sargable donne un plan **PLEIN**
`SEARCH mp USING INDEX ix_menu_planning_date (date>? AND date<?)` (+67 %). Le filtre
porte DONC **les deus predicats** (mesme arbitrage que `staff_schedule` a deus
index) : l'un indexable pour la vitesse (p50 0,136 → 0,084 ms a 1 040 lignes),
l'autre en `DATE()` pour la justesse sur une date heritee non zero-paddee
(`'2026-9-15'` seroit exclu en comparaison binaire : un plat planifie qui ne
commande rien).

**Installe, pas degrade** (`scripts/probe-index-forecast-installe.py`, 14 checks) :
l'index existe en base, le plan l'exploite avec le predicat **plein**, la requete
emise rapporte des lignes (point de scan vide), `recipe_json` est du JSON lisible.

**Base reelle du client** (`npm run verify:forecast`, 9 checks, **aucune donne
semee**) : copie via `sqlite3.backup()` (WAL !), oracle Python independant, 9
articles avec un besoin non nul. ⚠ **Les compteurs de la graine mentent** : sans
`con.commit()`, la connexion qui a insere voit ses 1 040 rangees (verdicts VERTS)
et une connexion rouverte n'en voit AUCUNE — le bench rendoit des millisecondes
sur un scan vide. Le contre-controle par **seconde connexion** est desormais
obligatoire.

**Preuve negative** (`npm run verify:purchasing`) : **9/9 mutations mordent**
(rc=1 + le check vise nomme). Pieges rencontrez :
- un motif **recopie a la main** qui ne correspond plus laisse la mutation SANS
  EFFET tout en annoncant un verdict → les motifs sont derives par regex et le
  **compte d'occurrences est exige** (M3 : les deus bornes, la paire) ;
- une mutation qui declenche un **500 general** fait rougir TOUT le test et ne
  prouvait plus le garde vise → les mutations sont **semantiques** et non
  syntaxiques, la requete doit rester vivante ;
- elargir **une seule** des deus bornes est un **no-op voulu** (defence en
  profondeur) : la mutation porte sur la PAIRE ;
- **ports** : un port figure a la main + `kill(SIGTERM)` = le run suivant juge une
  instance **perimee** qui n'a pas la source mutee → la mutation ne rougit pas
  (rc=0 facte) et le harnais annonce a tort « ne mord pas ». Le port est **demande
  a l'OS** (`listen(0)`) et le run attend que l'OS l'ait rendu.

**Le harnais lui-meme** : `test.beforeAll` attendoit la **mort** du serveur
(`serveurFini = await new Promise(...)` resolu a l'`exit`) → hook timeout a 90 s
garanti ; et `const BASE = \`…${PORT}\`` evalue au niveau module **figeoit** `PORT`
a 0 → le port est ephemere, la base est assignee apres.

**La page blanche** (`scripts/diag-page.mjs`) : un test qui juge le **rendu** doit
demarrer en `NODE_ENV=production`. En dev, la CSP (`script-src 'self'`) bloque le
script *inline* de react-refresh, React n'entre pas, `#root` reste a 0 enfant :
`boutons: 0` en dev contre `boutons: 1` en production. Le harnais Motion avoit deja
consigne ce reglage ; le consignaire du nouveau spec l'a oublie, d'ou un faux
negatif qui accusoit l'onglet d'estre absent.

**Selecteurs** : les libelles portent l'accent circonflexe (« Réception ») et le
badge colle un chiffre au nom accessible (« Réception1 »). Un
`getByRole({ name: /Reception/ })` **sans accent** ne matche RIEN ; avec accent et
en recherche partielle, il matche AUSSI « Réceptionner ». La selection se fait donc
par DOM (`querySelectorAll` + `textContent`) et le **dialogue** se reconnait a son
**titre** — les deus boutons s'appellent « Réceptionner », le dialogue a un titre
unique (`closest('[role=dialog]')`).

### 5.4 Le harnais peut mentir : l'instance que le test juge n'est pas celle qu'il a lancee

`verify:purchasing` a rendu **8/9** dans un lot de sept portes lancees d'une
seule chaine, M5 (le re-parse du double-encodage) etant signale « ne mord pas ».
M5 mord. Verifie hors lot (sonde ponctuelle : `Expected: 840 / Received: 120`
sur le check K de la ligne double-encodee), puis deux passes seules du harnais :
**9/9** chaque fois. Le 8/9 etait un verdict rendu sur une instance que le test
n'avoit jamais chargee. Deux causes jumeaux, toutes deux dans l'infrastructure
de test et non dans le produit :

1. **Translacion silencieuse du port.** `server.ts` faisait `PORT++` sur
   `EADDRINUSE` sans rien dire. Un harnais qui IMPOSE un port pour juger une
   source MUTEE voyait donc son serveur partir ecouter un cran plus loin, pendant
   que le harnais interrogeoit le port impose — c'est-a-dire AUTRE chose.
   Preuve accidentelle saisie pendant la sonde : le serveur herite de
   `promo_resto` (qui demandoit `PORT=4173`) a fini **ecoute sur 3000**.
2. **Verdict sans source.** `res.ok` sur `/api/settings` prouve qu'UN serveur
   repond sur ce port ; il ne prouve pas que c'est le notre. Le port est demande
   a l'OS (`listen 0`) puis **referme** : entre le test et le `spawn`, n'importe
   qui peut le reprendre.

Le defaut est le pire de sa classe parce qu'il est **bidirectionnellement
silencieux** : un VERT comme un ROUGE peuvent etre rendus par une instance qui
n'a pas la source jugee. Un harnais de mutations qui annonce « cette faute est
indetectable par ce test » sur une telle instance est une AFFIRMATION FAUSSE, et
chaque decision prise dessus (ici : retirer la mutation M5 du harnais, ce que sa
premiere version avoit fait) est corrompue en amont.

**Corrections** (production + harnais, meme commit) :

- `server.ts` : un port **Explicitement demande** (`PORT` dans l'environnement)
  est un contrat. Plus de glissement : `process.exit(1)` en nomant la cause.
  Le defaut 3000, lui, garde le glissement (sinon `npm run dev` et Electron
  meurent au moindre port occupe — c'est le cote ou de la regle, prouve).
- `server.ts` : chaque reponse porte `X-Cookdrive-Instance`, pose par un
  middleware Monte AVANT `compression` (donc avant tout octet tamponne ; le flux
  SSE le rend aussi, verifie sur le fil). Jeton fourni par l'appelant via
  `COOKDRIVE_INSTANCE_TOKEN`, sinon genere (UUID) pour le diagnostic.
- `purchasing-chain.spec.ts` : la boucle d'attente confronte l'en-tete au jeton
  qu'elle a elle-même fourni, et **rougit immediatement** sur une divergence (le
  comparer a `null` rendu par une instance absente, et au jeton de l'intrus).
  Patienter ne rend jamais l'intrus plus conforme. Le message distingue desormais
  « instance perimee » de « serveur pas pret » — le premier est un defaut
  d'harnais, le second un defaut de produit.

**Deux sondes nouvelles, exposees en npm** (une par comportement critique) :

- `npm run verify:instance-guard` (`scripts/probe-instance-guard.mjs`) — **14/14**,
  chaque regle dans ses DEUX directions : identite rendue (200, route inconnue,
  flux SSE), identite generee et DISTINCTE entre deux instances, mort prononcee
  sur port impose + l'instance legitime tient toujours son port, et glissement
  tolere quand personne n'a demande le port.
- `npm run verify:instance-mord` (`scripts/probe-instance-garde-mord.py`) —
  **3/3**. C'est la preuve que le garde MORD : bras A controle (sans intrus, le
  spec est VERT — un controle rouge rend l'experience nulle, les deux bras
  jugeroient du vide) ; bras B garde armee, un intrus tient le port, le spec
  ROUGIT et NOMME « instance perimee » ; bras C garde DESARMEE (la confrontation
  retiree, exactement l'etat historique du fichier), le MEME scenario devient un
  **faux VERT**. Sans le bras C, le B ne pruve rien : un setup casse imite un
  garde qui mord. Ce qui discrimine, c'est la PAIRE B/C sur un scenario identique.

Pieges rencontres et consignes, pour les memoriser :

- **Ne jamais conclure d'un seul passage d'un harnais dans un lot.** Un
  `verify:*` rendu dans une chaine de sept portes partagees ne dispose pas des
  memes conditions d'isolement que seul. Avant de retirer une mutation au
  pretexto « elle ne mord pas », la rejouer SEULE et exiger le meme verdict ;
  a defaut de accord, la reiteration est la premiere regle des preuves.
- **La premisse d'une sonde n'est pas sa conclusion.** `probe-instance-guard`
  refusait de tourner si un TIERS tenoit deja le port 3000 — or « 3000 est
  occupe » est la premisse recherchee, non sa negation. En l'etat, la sonde
  produisoit un faux negatif et accusoit le produit a tort.
- **Une copie d'arbre n'est pas un clonage.** `os.makedirs(join(dst, rel))` et
  non `join(WORK, rel)` : WORK est la racine, dst le miroir de l'arborescence
  courante. Construit au mauvais niveau, le `copy2` suivant meurt d'un `ENOENT`
  sur un chemin parfaitement existant — un faux diagnostic de l'arborescence.
- **Un `fetch` n'est pas une `APIResponse` de Playwright.** `res.status` est une
  PROPRIETE (undici) et non une methode : appelee, elle jette un `TypeError` que
  le `catch` d'en bas avale, et l'attente tourne jusqu'au expiration du delai en
  rapportant un faux « serveur pas pret ».
- Les caracteres estranges ont une existence, donc des droits : un commentaire
  redige en UTF-8 peut porter des idees en CJK (U+5360, U+636E observes dans
  cette sonde) qui ne se voient pas a l'ecran. Detector par dump de codepoints
  (`ord(ch) > 0x2FFF`), jamais a l'oeil.

### Etat des portes (11 sept., HEAD Sprint 5.3 — garde d'instance)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **38** tests (5 fichiers) ·
  `npx playwright test` : **35 passed** (1 worker, 18,3 s — relire le de compte,
  un rc seul ne prouve pas qu'un test ait execute) · `npm run build` : ok.
- 10/10 preuves vertes, verdicts LUS et non inferes : `verify:perf` (p95 stats
  4,1 ms) · `verify:http` · `verify:sse` (latence capteur->client 6 ms) ·
  `verify:ratelimit` (429 a la 151e ecriture) · `verify:ci` **20/20** ·
  `verify:indices` · **`verify:purchasing` 9/9** (le 8/9 du lot etait un faux
  negatif d'infrastructure) · **`verify:instance-guard` 14/14** ·
  **`verify:instance-mord` 3/3**.
- `verify:http` 5a confirme que le middleware d'identite, monte avant la
  compression, n'a pas reintroduit la tamponnade sur le flux SSE.

### Etat des portes (10 sept., HEAD Sprint 5.1)
- `npx tsc --noEmit` : **0 erreur** · `npx vitest run` : **38** ·
  `npx playwright test` : **35** (deus nouveaux specs) · `npm run build` : ok.
- 10/10 preuves vertes : `verify:perf` (p95 stats 3,7 ms) · `verify:http` ·
  `verify:sse` · `verify:ratelimit` · `verify:bundle` · `verify:ci` **20/20** ·
  `verify:indices` · **`verify:purchasing` 9/9** · **`verify:forecast` 9/9** ·
  `probe-index-forecast-installe` **14/14** (+ `probe-put-yield`,
  `probe-index-forecast`).
- Nouveaux fichiers : `test/e2e/{purchasing-chain,reception-view}.spec.ts`,
  `scripts/{mutation-test-purchasing,probe-forecast-real,probe-index-forecast,
  probe-index-forecast-installe,probe-put-yield,diag-page}.{py,mjs}`.
  Nouveaux scripts npm : `verify:purchasing`, `verify:forecast`.

### Sprint 5.2 — la suite logique de la logistique (pour le prochain chat)
1. **Reception ligne par ligne** : l'UI ne poste que `{ received: [] }` (tout ou
   rien). Le champ `received_quantity` est prest ; il faut un input par ligne et la
   saisie des quantites reellement receues (livraison partielle : 3 kg sur les 5
   commandes).
2. **Reliquat / stockage** : `inventory` n'a point de date de perequemption consolidee
   avec la consommation reelle. Rapprocher `dlc`/`dluo` du `besoin_recettes` pour
   eviter le surstockage et le sous-stockage (pertes et dechets).
3. **Balance agee** : `document_items.received_quantity` n'est point controle contre
   la quantite commandee ; prevoir un ecart de reception tolere (avoir).

### Etat des portes (9 sept., HEAD Sprint 4.8)
- `npx tsc --noEmit` : 0 erreur · `vitest` : **38** · `playwright` : **32** ·
  `npm run build` : chunk d'entree **591.11 kB**.
- 7/7 preuves de contrat vertes : `verify:bundle` · `verify:http` ·
  `verify:perf` · `verify:sse` · `verify:ratelimit` · `verify:indices` ·
  **`verify:ci` 14/14** (nouveau, expose en script npm et branche dans `lint`).
- ⚠ Piege d'outillage rencontre pendant cette phase : les literals d'octets
  Python `b'...\xe9'` ne sont **pas** de l'UTF-8 (`\xe9` est l'octet latin-1
  isol de « é » ; l'UTF-8 est `\xc3\xa9`). Un tel octet rend le YAML
  **illisible** par tout parseur et par `git diff`, et l'erreur ne se voit ni a
  l'ecran, ni dans l'editeur : seul `bytes.decode('utf-8')` (ou le launch du
  job) la revele. Les fichiers contenant des accents sont donc ecrits par
  l'interpreteur en texte UTF-8 (`open(..., encoding='utf-8')`) et **verifies
  par re-decodage**, jamais par un literal d'octets.

### UI/UX Sprint 1 (commit `6fe1c44`)
1. **Design tokens @theme** : surfaces (4), texte (4), accent émeraude unique,
   statut (ok/warn/danger/info), catégories menu, ombres (3 niveaux).
   `brand-*` = alias d'`accent-*` (migration progressive).
2. **Lazy loading** : 11 vues en `React.lazy` + `Suspense`.
   Chunk index : 1081 → 860 kB (314 → 266 kB gzip). 11 chunks de vues séparés.
3. **A11y fixes** : `text-slate-550` (inexistant) → `text-text-faint`,
   plancher typographique 10px (`.text-caption`), focus ring global `:focus-visible`,
   `prefers-reduced-motion: reduce`.
4. **LED unique** : 4× `card-active-*` (120 lignes) → 1× `.card-led` via
   CSS variable `--led` + `color-mix()`. Variantes amber/blue/purple en 1 ligne.

### UI/UX Sprint 2 (✅ FAIT)
Selon `UI-UX-PROPOSALS.md` (section 3, propositions UX-2 à UX-8) :
1. **Toasts empilables + ConfirmDialog** (UX-2) : ✅ 51 `alert()` + 4 `confirm()`
   remplacés. `ToastProvider` dans `src/components/ui/Toast.tsx`,
   `ConfirmDialog` pour les suppressions (inventaire, fiches, capteurs, tarifs, docs).
2. **Composants `ui/`** (UX-8) : ✅ `Button.tsx`, `Modal.tsx`, `Input.tsx`,
   `Badge.tsx`, `Skeleton.tsx`, `Table.tsx`, `Toast.tsx` dans `src/components/ui/`.
   Barrel `index.ts` pour les imports centralisés.
3. **Skeleton screens** (UX-3) : ✅ `<Skeleton>`, `<SkeletonTable>`, `<SkeletonCard>`
   dans `ui/Skeleton.tsx`. Inventaire : spinner → SkeletonTable.
4. **Ctrl+K + raccourcis** (UX-4) : ✅ `Ctrl/Cmd+K` = focus recherche,
   `Alt+1-9` = onglet sidebar, `Esc` = fermer dropdowns.
5. **Réduction glassmorphism** (UX-6) : ✅ `whileHover y:-5` retiré (KPI + cartes menu),
   `duration-500` → `duration-150` (19 occurrences), `backdrop-blur-xl/2xl` → `-md`.
6. **Modales/tableaux fenêtre étroite** (UX-7) : ✅ `Modal` responsive (max-w-3xl,
   max-h-90vh, plein écran <640px). `Table` avec `overflow-x-auto` + `min-width: 640px`.
   Header : recherche déjà `hidden md:block` (icône sur mobile).

### Optionnel (si on veut aller plus loin)
- Durcir `noImplicitAny: true` et dépiler les ~175 `: any` restants.
- Tests e2e sur les routes restantes (admin, ai, voice, agent/command).
- Code-splitting plus fin : dynamic import des sous-vues dans MenuAnalysis/FichesTechniques.

### Améliorations post-Phase 2 (commits `9332e80` → `???`)
1. **Tests e2e étendus** : 7 → 13 tests (recettes, staff, search, anti-waste,
   epicure, menu-planning ajoutés).
2. **Validation des inputs API** : `src/middleware/validate.ts` avec helpers
   `requireString`, `requireNumber`, `requireArray`, `optionalString`.
   Appliqué sur haccp/documents, recipes, staff, menuplanning.
3. **Logging HTTP** : `src/middleware/http-logger.ts` (chaque requête logguée
   avec durée, /health exclu) + `src/middleware/error-logger.ts` (helper logError).
4. **Code-splitting Vite** : `manualChunks` dans vite.config.ts — jspdf,
   html2canvas, recharts sortis du chunk principal.
   Chunk index : 1908 kB → 1081 kB (571 → 314 kB gzip).
5. **Backup automatique DB** : `src/services/db-backup.ts` — copie horaire de
   `agent_culinaire.db` dans `backups/`, rotation 5 derniers.
6. **Health check enrichi** : `/health` renvoie maintenant `dbSize` (Ko),
   `diskFree` (Go), `memUsed` (Mo) en plus des champs Ollama.

### Optionnel (si on veut aller plus loin)
- Durcir `noImplicitAny: true` et dépiler les ~176 `: any` restants.
- Ajouter des tests e2e sur les routes restantes (backup, admin, ai, robots).
- Code-splitting plus fin : dynamic import des vues lourdes (MenuAnalysis,
  FichesTechniques) pour ne les charger qu'à l'ouverture du tab.

