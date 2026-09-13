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

### 10.4 Morsure : 3 voies jouables mordent, 3 branches ne sont pas exercees

`scripts/negative-test-forecast-graine.py`, en `--semer=decaler --horizon=0`
(serre volontairement: a 14 jours, un besoin qui fuite hors fenetre y rentre
quand meme et le check « pas de fuite » est satisfait par la taille de la
fenetre au lieu de la juger):

| Voie | Mutation | Etat |
|---|---|---|
| sortie du besoin | `besoin_recettes: 0` | **MORD** |
| rendement (diviseur) | `const pct = 100` | **MORD** |
| couverts planifies | `const covers = 1.0` | **MORD** |
| gramature non numerique | `: 1` au lieu de `: 0` | branche **non exercee** |
| borne basse de la fenetre | predicate toujours vray | branche **non exercee** |
| clef vide du planning | garde decalee | branche **non exercee** |

Les trois dernieres ne sont PAS des harnais casses; leurs causes sont **prouvees
par les octets de la base** (`lib_morsure_forecast_table.CAUSES_MORTS`) : 0/18
gramatures non exploitables (toutes `real`), 0 plat AVANT la borne basse apres
le calage, 0 ligne a `recipe_id` vide.

La decision de compte-rendu est celle du depot: **ne pas falsifier pour
contenter l'attente**. Rendre « 6/6 mordent » eut ete un mensonge; rendre
« 3/6, harnais casse » eut accuse l'outil pour une absence de donnees. Le
verdit rend DONC ce que la porte prouve reellement — `PRONONCEE sur les voies
que ces donnees exercent` — avec les causes au-dessous. Juger une voie par une
donne que la base ne contient pas produit un PASS sans temoin; le consigner
avec sa cause est la seule sortie honnete, et elle dit aussi qu'il FAUDRAIT un
second jeu de donnees (gramature nulle, clef vide, plat hors delai) pour les
fermer.

Deux verrous d'harnais, herites des lecons consignees: le source est restaure
dans un `finally` et **confronte au sha d'origine**; le harnais refuse de
demarrer si un fils de la sonde tourne encore (« un PASS rendu par une instance
qui n'est pas la tienne n'est pas une mesure »), et le controle final rejoue le
code retabli — un harnais qui ne retablit pas un etat jouable ne prononce pas
sa morsure (`rc=6`).

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

- Les trois branches non exercees attendent un jeu de donnees qui les exerce
  (gramature nulle, clef vide, plat hors delai). Ce n'est pas un travail de
  harnais, c'est un **second fixture** — et sans lui ces voies restent sans
  temoin.
- `verify:forecast` juge la voie API par la copie de travial; la voie UI
  (`Purchasing.tsx`) n'est pas reprise par ce mode.
