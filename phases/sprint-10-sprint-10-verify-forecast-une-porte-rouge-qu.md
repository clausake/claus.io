## Sprint 10 - `verify:forecast` : une porte rouge qui ne jugeait rien, et un mode qui ment sur ses donnees (13 sept.)

### 10.1 Le rouge etait vrai, sa cause etait fausse

Le lot rendait `ROUGES=1` sur `verify:forecast`. Ce n'etait pas un defaut du
produit et pas un defaut d'harnais: la sonde `probe-forecast-real.py` s'arrete
a juste titre (`rc=2`) quand **aucun** plat du client ne tombe dans la fenetre
de 14 jours. Les sept plats sont dates des 06-12/09; nous sommes le 13.

Ce qui etait faux, c'est le **contenu du mot** « graine ». Le contrat de la
sonde — « base reelle du client, aucune graine, sinon tu mesures un scan vide »
— avait ete ecrit pour empecher la tricherie la plus rentable du secteur: un
tableau de besoins a zero rendu VERT par ce qu'on a appele un scan vide
chronometre. Il interdisait donc TOUTE transformation des donnees. Or la base
n'est pas vide: **6 recettes, 18 lignes d'ingredients, 0 orphelin, gramatures
0,08..0,22, rendements 92-98 %**. Le blocage est purrement **calandrial**.
Rendre `rc=2` dans cet etat, c'est rendre une ABSENCE de mesure avec le meme
code qu'un ECHEC produit — et le lecteur doit ouvrir un log pour decouvrir que
rien n'est casse.

### 10.2 Le mode `--semer=decaler` : la plus petite transformation qui ne fabrique rien

`caler_planning_sur_aujourdhui()` ne touche qu'**une colonne**, `menu_planning
.date`, et par un **decale UNIQUE et deterministe** (le plus vieux plat tombe a
aujourd'hui, ici +7 j). Les distances RELATIVES entre les plats sont preservees
: le calendrier du chef garde sa forme.

Aucune gramature, aucun couverts (`recipe_json`), aucun rendement, aucun prix,
aucun stock, aucun article n'est invente. L'oracle reste ecrit a la main, en
dehors de la route. Le mode est **OFF par defaut** : sans lui, une base sans
plan rend toujours `rc=2`, et le garde `prises == 0` survit.

Deux compte-rendus ont du etre corriges pour ne pas mentir, et c'est la
veritable faute de ce sprint (consignee par ce qu'elle a produit):
- la banniere affirmait « base reelle du client (aucune graine) » **alors que
  le mode tournait** → elle rend desorais `CALAGE CALENDRIAL (dates seules)`;
- le compte-rendu de l'oracle affichait `+14 j` alors que la mesure se jouait a
  `horizon=0` → il rend la fenetre **reellement jouée**.

Un compte-rendu qui ne dit pas la transformation qui a eu lieu est exactement
la classe de defaut que ce depot poursuit: un PASS rendu par ce qu'on ne nomme
pas.

### 10.3 Le rouge que la morsure a rendu etait MIEN (la phase qui compte)

Premier lancement en `--horizon=0` : `ECHEC — 2 checks`. Deux lectures
etaient possibles — la route est cassée, ou l'oracle juge une autre fenetre
que celle que la route a servie. La deuxieme etait la bonne: j'avais sérré
l'oracle sur 0 jour sans rien dire a l'appel `GET /api/purchasing/forecast`,
qui lui demandait son defaut de 14. L'oracle attendait `13.574`, la route
rendait `30.149`.

C'eut ete le defaut le plus facile a rater de tout le sprint: le vert de la
porte dependait d'un desaccord entre deux moities que je venais d'introduire.
Corrigé par les DEUX cotes (`?horizon=` propage a l'appel et au check de la
fenetre), et non par un relachement du seuil.

### 10.4 Morsure : 4 voies jouables mordent, 2 voies ne peuvent pas mordrer

`scripts/negative-test-forecast-graine.py`, en `--semer=decaler --horizon=0`
(serre volontairement: a 14 jours, un besoin qui fuite hors fenetre y rentre
quand meme et le check « pas de fuite » est satisfait par la taille de la
fenetre au lieu de la juger):

| Voie | Mutation | Etat |
|---|---|---|
| sortie du besoin | `besoin_recettes: 0` | **MORD** |
| rendement (diviseur) | `const pct = 100` | **MORD** |
| couverts planifies | `const covers = 1.0` | **MORD** |
| gramature non numerique | `: 1` au lieu de `: 0` | **MORD** (depuis le fixture) |
| borne basse de la fenetre | predicate toujours vray | **REDOUNDE** par construction |
| clef vide du planning | garde decalee | **INATTEIGNABLE** par construction |

De verrous d'harnais, herites des lecons consignees: le source est restaure
dans un `finally` et **confrontee au sha d'origine** (reverifiee depuis:
`git diff` sur `suppliers.ts` est VIDE et les quatres litéraux de mutation
sont absents du fichier); le harnais refuse de demarrer si un fils de la sonde
tourne encore (« un PASS rendu par une instance qui n'est pas la tienne n'est
pas une mesure »); et le controle final rejoue le code retabli — un harnais qui
ne retablit pas un etat jouable ne prononce pas sa morsure (`rc=6`).

#### 10.4bis AMENDEMENT au 10.4 — DEUX des trois causes consignees etaient FAUSSES

La regle du depot: « une mesure qui contredit un verdict consigne doit etre
RE-MESUREE et le consensus corrige, pas herite ». Le 10.4 affirmait que trois
branches etaient « non exercees par les donnees du client », causes « prouvees
par les octets de la base ». Deux des trois causes etaient fausses, et la
relecture qui les casse est dans le SOURCE du SQL, non dans les donnees:

- **La gramature (`M4`) n'etait pas un angle mort de donnees: elle etait
  JOUABLE.** Le client n'a que des `real` entre 0,08 et 0,22, done la branche
  `qpp > 0 ? qpp : 0` n'etait pas oubliee, elle n'etait pas **exercee** — et
  elle pouvoit l'etre licitement: `recipes.ts` ecrit `ing.quantity_per_person
  || 0` sur ses DEUX voies d'insertion. Une gramature a 0 est un etat que LE
  PRODUIT fabrique (le chef laisse le champ vide). Le fixture la depose, la
  voie **MORD** desormais. Ce que la cause consignee avait de faux: elle
  declarait une limite de la base la ou c'etait une limite du harnais, et elle
  **condamnait une voie qu'on pouvait ouvrir**.
- **La borne basse (`M5`) n'est pas genee par les donnees: elle est DOUBLÉE.**
  Le SQL porte `AND mp.date >= DATE(?)` ET `AND DATE(mp.date) >= DATE(?)`,
  deux conditions equivalentes. Muter l'une laisse l'autre exclure les memes
  lignes: la sortie est identique pour TOUTE mutation d'une seule des deux.
  Aucune quantite de donnees ne la fait mordrer. La cause « 0 plat avant la
  borne » etait vraie comme observation et **fausse comme explication** — elle
  accusait le hasard des donnees pour un fait de STRUCTURE, et elle cachait
  l'action utile: une des deux conditions est du **code mort**, le refactoring
  (en supprimer une) est la seule sortie, pas un fixture.
- **La clef vide (`M6`) etait bien inatteignable, mais pas pour la cause dite.
  ** Ce n'est pas le nombre de lignes a `recipe_id` vide: c'est la
  `JOIN recipe_ingredients ON ri.recipe_id = mp.recipe_id` qui tue la ligne
  AVANT la garde — une ligne a clef vide ne joint AUCUN ingredient, done ne
  peut pas modifier la sortie. Muter cette garde est NEUTRE par construction;
  la rendre jouable exigerait de retirer la jointure, done de **truquer la
  mesure**. La cause « 0 ligne a clef vide » etait comptee sur la copie du
  client, ce qui rendait l'impossibilite contingentale alors qu'elle est
  structurelle.

Le compte-rendu rend desormais TROIS etats au lieu de deux — un « ne mord pas »
de donnees, un constat de `redundance`, un constat d'`inatteignabilite` — parce
que les melanger sous un seul « 3/6 angles morts » effaca la hierarchie: la
premire est une dette de fixture, la deuxieme une demande de refactoring, la
troisieme une limite legitime du instrument.

Ce qu'il **ne faut pas** faire, et c'est la moitie utile du resultal: le `NULL`
de gramature ne peut venir d'aucune voie d'ecriture du produit (`|| 0` le
convertit). Un `INSERT` brut qui le forcerait eut rendu un PASS sur une branche
que personne ne peut ecrire — un temoin sans accusable. La gramature a 0 exerce
LA MEME branche avec une donnee que le produit ecrit lui-meme.


#### 10.4ter LA GARDE ANTI-NO-OP DU FIXTURE, FALSIFIEE PAR SES TROIS VOIES

`--fixture=branches` pose deux lignes pour que la VOIE de M4 puisse être
jouée (voir 10.4bis). Reste une question que rien ne tranchait: si le fixture
est demandé et ne pose rien (`fixture_exercer` rend `(0, 0, None)`), la
course verte serait un menonge — la porte pretendrait juger la gramature
sans l'avoir exercée. J'ai donc ajouté une garde: `rc = 3` dans ce cas.

Mais une garde qui ne peut pas sonner n'est pas une mesure (piege des
« ancres de mutation mortes » du Sprint 8), et je n'avais AUCUNE preuve
qu'elle sonne. Deux tentatives de la déclencher par copie de la base du
client (ôter les articles d'inventaire libres pour que le fixture ne trouve
plus où poser) ont rendu `rc = 2`: l'arrêt « l'oracle ne rend aucun besoin »
prend la place AVANT elle. La copie ne prouvait rien — elle ne montrait
qu'un voisinage.

`scripts/falsifier-garde-fixture.py` tranche en jouant la BRANCHE, et non
une copie: il relit les octets de la sonde, retire la ligne de sortie de
module sous double controle (`ancre trouvee 1 fois`, sinon abstention),
compile, execute dans un namespace etrange, puis remplace `fixture_exercer`
par une imitation de no-op. TROIS voies, et chacune est exigée:

| voie | attente | obtenu |
|---|---|---|
| fixture réel | `rc = 0` | 0 |
| fixture demandé, ne pose rien | `rc = 3` | 3 |
| no-op sans le drapeau | `rc ≠ 3` | 0 |

La premiere voie est ce qui empeche la garde d'être un etat fige: sans
elle, un `rc = 3` permanent ressemblerait à une réaction.

DEUX defauts MIENS sont tombés pendant cette falsification, et c'est sa
valeur:

1. **Import dynamique impossible.** Le fichier de la sonde finit par
   `sys.exit(main())` AU NIVEAU MODULE, sans garde `if __name__ ==
   "__main__":`. Un import (ou un `exec` brut) joue donc la course avec les
   arguments du CONTROLEUR et lève `SystemExit(2)` avant tout: la premiere
   version du script a rendu `PD1_RC=2` en n'ayant joué qu'une course SANS
   drapeau (`+14 j`, calage éteint) — un solde qui n'était pas un verdict.
   Le tracé l'a prouvé, pas l'hypothèse.
2. **Lecteur myope.** Après avoir retiré `sys.exit`, `main()` RETOURNE son
   code au lieu de quitter; mon auxiliaire ne lisait que `SystemExit.code`
   et rendait donc **0 dans tous les cas**. Le « no-op = 0 » que j'allais
   consigner comme « garde morte » était l'artefact d'un lecteur cassé, pas
   un fait sur la sonde. Corrigé en lisant la valeur retournée, il donne 3.

C'est le second jour où un contrôleur qui ne peut pas rougir me fait
consigner un verdict faux (le premier: le « 3/6 » rendu par une course qui
n'avait pas joué le calage). La regle se resserre: **avant de croire un
solde, vérifier que le solde peut changer** — ici, une voie attendue à 3 et
une voie attendue à 0 dans la même course.

ANGLE MORT ASSUME, non vendu comme mesure: aucun état client connu
n'atteint ce no-op. La voie est prouvéee PAR SIMULATION (`imitation de
defaut`, donnée inventée), pas par une donnée du client; le script
n'entre donc dans AUCUN lot de portes, c'est un controle de voie.

### 10.5 Le piege qui s'est re-produit, et il merite sa regle

DEUX fois dans ce sprint j'ai cru un changeement applique alors que je
l'avais seulement **ecrit** : le patcheur de compte-rendu tournait encore dans
sa version d'avant (« 3/6, angles morts » rendu apres son correctif), et le
branchement du manifeste etait annonce avant son execution. Le reflexe qui
manque n'est pas d'ecrire moins, c'est de ne jamais rendre un etat sans avoir
joue le script qui le produit. `scripts/finaliser-forecast.py` retire d'ailleurs
les sept patcheurs qui ont servi: un script de controle qui ne controle plus
rien est exactement la « ancre de mutation morte » du Sprint 8.

### 10.6 Preuves

- `python3 -m py_compile scripts/*.py` : 0 | `npx tsc --noEmit` : 0 (log de 0 octet)
- morsure: `MORSURE_RC=0`, 3 voies mordues + 3 causes, restauration verifiee au sha
- la sonde sans mode rend toujours `rc=2` (le contrat d'origine survit) et avec
  le mode **9/9**, `14 articles avec besoin`, `21 lignes de plan` confrontees a
  l'oracle
- deux portes au manifeste: `verify:forecast` (mode qui mesure) et
  `verify:forecast-mord` (la morsure), les deux au lot

### 10.7 Ouvert, consigne

- Les DEUX voies qui ne mordent pas ne sont PAS une seule dette. `M6`
  (clef vide) est une limite legitime du instrument: la jointure tue la
  ligne avant la garde, aucune donnee ne la rend jouable sans truquer la
  mesure. `M5` (borne basse) est une DEMANDE DE REFACTORING: le SQL porte
  deux conditions equivalentes, l'une des deux est du code mort et le gate
  ne peut pas la juger — la sortie est d'en supprimer une, pas d'ecrire un
  fixture. Les confondre sous « il faut un second jeu de donnees » etait
  la faute de compte-rendu du 10.4.
- `verify:forecast` juge la voie API par la copie de travial; la voie UI
  (`Purchasing.tsx`) n'est pas reprise par ce mode.

