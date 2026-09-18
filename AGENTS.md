# Regles communes aux deux cerveaux (pilote qui ecrit, relanceur qui juge)

Ce fichier est charge par le PILOTE a sa naissance **et** par chaque enfant `/review`
(`build_context_files_prompt(cwd=workspace, skip_soul=True)`,
`tools/delegate_tool_progress.py:174`). C'est le seul texte que les deux cerveaux
partagent vraiment ici : SOUL.md est reserve au parent (`skip_soul=True` sur les
enfants, commentaire du code : « identity belongs to the parent »), et un skill n'est
lu que par celui qui le charge. Donc une regle ici s'impose aux deux ; une regle
placee ailleurs n'en astreint qu'un.

## 1. Toute citation se paie par la commande qui la produit

Un chiffre, un numero de ligne, un `rc`, un compte de portes, un « la porte X est
appelee par Y » n'a pas le droit d'etre enonce si la commande qui le genere n'a pas
tourne **dans ce tour**. Un « c'est a `run-all-gates.py:233` » rendu sans le grep qui
vient de le produire est une fabrication, meme quand il tombe juste.

Fautes reellement commises le 17/09, par les DEUX cerveaux : numeros de ligne inventes
sans grep ; une porte annoncee « jamais appelee » par un grep qui visait les mauvais
fichiers (elle etait absente, le constat etait vrai) ; et l'inverse — un defaut reel
classe « faux positif » sans le mesurer. Un seul cerveau ne prend aucun de ces
erreurs en flagrant : c'est la raison d'etre du second, pas la redondance.

## 2. Une sortie vide n'est pas une reponse

`test/gates.out` contient des **octets nuls** : `grep` y rend **0 octet sur stdout avec
exit 0** (`fichiers binaires correspondent`). Le lecteur qui ne regarde pas le code de
sortie en conclut « il n'y a rien la ». Mesure du 17/09 : un pilote a brule **12**
appels identiques sur cette grepe avant la coupure du garde-fou, et l'autre a rendu
« AUCUN verdict » sur le meme fichier pour la meme raison.

- ne **jamais** grepper `test/gates.out` directement → `python3 scripts/lire-gates.py`
  (concu pour ne pas pouvoir rendre du vide en silence : il nomme l'absence et donne
  les commandes qui, elles, rendent quelque chose) ;
- avant toute conclusion d'absence, une sonde prouve le capteur vivant : `wc -c`,
  `grep -c` sur un motif qu'on sait matcher, ou `grep -a`.

## 7. Une sortie stable est un fait acquis: la repollee ne produit rien

- `npm run verify:sse` qui a rendu `RC=0` cinq fois de suite rend `RC=0` pour
  toujours: le sixieme appel n'apprend rien. Mesure le 18/09, un pilote a brule
  5 appels sur ce verbe (sortie identique `RC=0`) et 7 sur
  `_tests/run_all.py offline` (sortie identique) avant la coupure du garde.
  Un halt sur un verbe de POLL (`grep`, `wc -c`, `git diff`, `echo RC`) est un
  blocage de GESTE, pas du systeme: le fait est acquis, passe a l'ecriture.
- `git diff HEAD -- scripts/…` rendu VIDE pendant que ton patch n'est pas encore
  ecrit ne veut pas dire « en attente », ca veut dire « tu n'as rien ecrit ».
  Le regarder quinze fois ne remplit pas le fichier.
- Deux courses SIMULTANEES ne se demandent pas avec `&` dans une commande
  terminal: le harnais refuse (`Foreground command uses '&' backgrounding`,
  exit -1) et tu te retrouves a polluer l'autre en sequence. Ecris un `.py` avec
  `subprocess.Popen([...])` par enfant puis `communicate()`: c'est exactement
  comme ca que les deux courses jumelles `gates-…-670137` / `670138` ont existe.

## 3. Une relire par commit, pas par tour

Le pilote appelle `/review` quand un livrable est committe. Jamais entre deux tours
d'outils : la revue par tour double le cout sans rien de plus a dire.

## 4. Le relanceur rejoue, le pilote re-mesure

- Le relanceur **execute** la commande derriere chaque citation du rapport qu'il recoit
  et derriere chaque conseil qu'il rend, avant tout verdict. Chaque constat sort
  `VRAI (mesure)` ou `FAUX POSITIF (mesure)`. Un constat non rejoue n'est pas rendu au
  pilote : il est garde pour soi.
- Le pilote ne corrige pas un constat avant de l'avoir re-mesure lui-meme par commande
  executee. Un `FAUX POSITIF` mesure se consigne et se renomme ; il ne reste pas dans
  une liste a re-traiter.

## 5. Un halt `identical_call_streak_halt` se lit par la COMMANDE, pas par l'evenement

Sortir l'appel rejoue et demander a qui il appartient : le harnais (`decouper-phases`,
`PHASES.md`, gates) ou le domaine (`git diff`, `read_file`). Les trois halts du 17/09
etaient tous du domaine — reparer le harnais ce soir-la etait un faux combat. Et un
halt `terminal` en sortie vide est un angle mort du capteur (regle 2), pas de
l'entetement : la reparation est dans le capteur, pas dans le cerveau.

## 6. Les portes

```bash
npm run verify:all                      # le lot complet (liste DEFAUT de run-all-gates.py)
npm run verify:split                    # le journal se recolle a l'original consigne (sha256)
python3 scripts/lire-gates.py           # qui sont les rouges, sans grep sur un binaire
python3 scripts/lire-gates.py --rouges  # seulement ce qui coince
```

Une porte que personne n'appelle n'est pas une porte : une nouvelle entre `verify:`
doit etre **a la fois** dans `package.json` **et** dans `DEFAUT` de
`scripts/run-all-gates.py` (sinon `PORTES_INCONNUES rc=2`).

Le hash consigne du journal bouge uniquement dans le commit qui re-ancre la porte :
`--verify` execute **avant** de commiter, jamais l'inverse (une ancre bougee sans sa
porte = porte rouge pour toujours, ou mensonge fige). Le `.orig` est juge contre le
**blob git commite**, pas contre un hash ecrit dans le meme dossier que lui.
