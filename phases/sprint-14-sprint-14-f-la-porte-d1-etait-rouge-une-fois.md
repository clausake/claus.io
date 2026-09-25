# Sprint 14.f - la porte D1 etait rouge une fois par nuit, et c'etait vrai

## Ce qui etait consigne

La suite finale de 14.e rend `GATES=57 ROUGES=2 ALLRC=1`. Les deux rouges sont
de la famille du tableau de bord : `verify:dashboard` et `verify:dashboard-mord`.
`dashboard-mord` rc=4 est son propre juge qui refuse de prononcer faute de
mutation observee : comportement correct, pas un defaut de produit. Le seul
vrai defaut est `verify:dashboard`, assertion D1 de
`test/e2e/dashboard-contract.spec.ts:115`.

## Premier verdict: ce n'est ni un vol de port, ni une regression de sprint

La regle du depot ("rejouer la spec SEULE avant de conclure a la contention")
est appliquee : `verify:dashboard` rejoue seul, sans concurrence, rend deja
**6/7 passes et D1 rouge**. Une assertion qui craque en isolation n'est pas un
port arrache. Le defaut est dans le produit.

## La cause, et non une hypothese

`src/routes/dashboard.ts` calcule les deux BORNES de la fenetre de cout avec

    new Date(...).toISOString().split('T')[0]

or `toISOString()` est la date **UTC**, et le calendrier que D1 attend est
**local**. Le chemin `labor` (l.52-56) avait deja ete corrige au local dans
14.d ; les bornes, elles, avaient ete oubliees. Le defaut etait **latent** :
D1 est verte environ 22 heures sur 24 et ne craque qu'entre 00:00 et 02:00
CEST, quand UTC est encore la veille.

Preuve par execution (`prouve-tz.mjs`, joue a 00:13 local Paris) :
`DIVERGENT: true` - la voie UTC rend la veille pendant que la voie locale rend
le jour courant. Deux echelles differentes pour un seul mot : le jour ou se
lit l'ecran, la date ou l'on ecrit en base.

## Exoneration: generateDates n'est pas en cause

La troisieme voie `toISOString()` (l.138, `generateDates`) est **intacte**.
Jugee par execution dans quatre fuseaux (`juge138.mjs`) : les quatre rendent le
MEME tableau de dates. Le round-trip d'une date-calendrier par minuit UTC est
stable ; corriger cette voie-la aurait ete falsifier la mesure pour contenter
l'observation. Elle ne recoit DONC aucun patch, et le patcheur l'exige : la
garde `generateDates=1 occurrence` refuse d'ecrire si quelqu'un y touchait.

## Source unique

L'idiome `getFullYear/getMonth/getDate` existait deja en deux exemplaires
(labor). Il est porte a trois dans `src/shared/util.ts` sous `jourLocalISO(decal)`,
unique source des deux bornes et du jour du chemin labor. Une borne dupliquee
se perime en silence.

Inventaire des `toISOString` restants, tranche par octets et non par l'ecran :
- lecture (corrige) : les deux bornes de `dashboard.ts`
- ecriture en base de donnees : `documents:694`, `haccp:190` - **non touches**.
  Ce sont des dates gravees dans les registres du client ; les changer
  reecrierait l'historique. Signale au pilote, non corrige en silence.
- horodatage plein (complexe ISO complet, heure comprise) : `suppliers`,
  `haccp-fields` - garde, l'heure se lit a l'envers du calendrier mais cela
  ne regarde personne de changer ici.

## La porte qui morsure: la matrice des fuseaux

`scripts/matrice-fuseaux-d1.sh` joue D1 dans six fuseaux (UTC, Europe/Paris,
Asia/Tokyo, Pacific/Honolulu, `Etc/GMT+12` = UTC-12, Pacific/Kiritimati =
UTC+14) et rend un verdict qui prouve quelque chose :

- AVANT le patch, a 00:53 CEST (fenetre divergente ouverte) :
  `rouges=2 zones_divergentes=2 VERDIT=ROUGE` sur le jeu de quatre zones.
  Les deux rouges sont EXACTEMENT les deux fuseaux divergents (Paris, Tokyo) ;
  les deux non-divergents (UTC, Honolulu) sont verts. Le defaut morsure la
  divergence, et elle seule.
- APRES le patch, a 01:19 CEST (MEME creneau, conditions comparables) :
  `zones_jouees=5 rouges=0 zones_divergentes=2 VERDIT=VERT (2 zone(s)
  divergente(s) ont juge la porte D1)`.

La matrice porte en elle son capteur de vie : si les fuseaux rendaient la
MEME date, le jugement serait sans valeur et la matrice serait une mise en
scene. `CAPTEUR_VIVANT=1 UTC=2026-09-24 Kiritimati=2026-09-25` atteste que
l'environnement `TZ` est reellement applique et que la divergence existe.

## La couverture des fuseaux est MESUREE, pas supposee

`scripts/juge-couverture-fuseaux-d1.py` balaie les 24 heures d'un jour UTC et
compte les heures ou AU MOINS un fuseau du jeu diverge de UTC. Le jeu
historique (UTC, Paris, Tokyo, Honolulu) rend `COUVERTURE=19/24` avec
`HEURES_NUES=[10,11,12,13,14]` : entre 10Z et 14Z, ces quatre rendent tous
la MEME date, et la matrice y dirait **VERT sans RIEN mesurer** - l'angle
mort consigne au vert. C'est ce juge qui l'a decouvert, et il **contredit le
consensus** (« couverture prouvée 24/24 ») que j'avais consigne plus tot dans
la soiree : la mesure a raison de rester mesure, c'est le consensus que
j'ai corrige, et non l'inverse.

DEUX zones aux deux bouts ferment le cercle, et non une seule — la
contre-preuve en a ete faite : `Etc/GMT+12` (mesure UTC-12 par le noyau
`date`, jamais devine) SEUL ne suffit pas, le jeu a cinq zones rend
`COUVERTURE=21/24`, `HEURES_NUES=[12,13,14]`. C'est l'ajout de
`Pacific/Kiritimati` (UTC+14) qui rend, jeu complet :

    JEU_LU_DANS=scripts/matrice-fuseaux-d1.sh  FUSEAUX=UTC+Europe/Paris+Asia/Tokyo+Pacific/Honolulu+Etc/GMT+12+Pacific/Kiritimati
    ZONES_QUI_DIVERGENT=5/6
    COUVERTURE=24/24
    HEURES_NUES=aucune
    VERDIT=VINGT_QUATRE      (rc=0)

Le nom d'un fuseau est verifie par le noyau avant d'etre cru : un nom
inexistant fait retomber `date` sur UTC **en silence** et transformero tout
balisage en mensonge. Le juge ne croit donc pas une table de decalages
memorisee et ne recoit pas une copie de la liste : il la RELIT dans le script
de la matrice, a chaque execution (`JEU_LU_DANS=` le nomme). Une copie
collee dans le juge eut pourri en silence — la matrice eut ajoute une zone
que le juge continuerait d'ignorer tout en attestant 24/24.

Le garde contre le retomber sur UTC est COLLECTIF, et mon premier jet etait
faux : il comparait deux instants distants DANS UNE MEME zone, ce qui
declare `UTC` morte (a 05:37Z et 17:37Z, UTC rend bien la MEME date, et
c'est correct). Le vrai garde compte les zones qui divergent reellement de
UTC sur au moins une des 24 heures, et les denombre :
`ZONES_QUI_DIVERGENT=5/6` (la sixieme etant UTC elle-meme, qui ne diverge
jamais d'elle-meme, donc par definition).

## Deux mensonges trouves DANS mes propres outils de preuve

En relisant les mesures, deux defauts de fabrication dans la porte elle-meme :

1. Le **jeu de fuseaux** figurait 4 zones la ou le fichier en joue 5, et le
   verdict comptait `zones_jouees=4` a la main. Le compte est desormais
   DERIVE de la boucle (`jouees=$((jouees + 1))`) : un entier constant copie
   dans le `echo` du verdict annoncerait 4 quand le script en joue 5 - un
   mensonge dans la seule ligne que l'humain lit.
2. Ce compteur derive etait d'abord **nul** (jamais initialise) : sous
   `set -u` le script avortait sur « unbound variable » et la matrice
   n'imprimait plus AUCUN verdict. Puis, initialise, dans l'ordre : 0 a
   l'entete, +1 par zone jouee dans la boucle.

## Le defaut trouve dans le correctif lui-meme

Le patcheur `scripts/patch-bornes-locales-14f.py` supprimait la declaration
`const nowLocal = new Date();` AVANT d'avoir remplace la ligne qui la consomme.
Il craquait donc en `AssertionError` (traceback brut) au lieu de rendre
l'abstention propre qu'on attendait de lui. Ordre corrige : substitution
d'abord, retrait ensuite. Trois substitutions verifiees, une seule occurrence
par ancre exigee, ecrit sur `tmp` puis `os.replace` seulement si TOUTES les
gardes passent.

`npx tsc --noEmit` : rc=0.

## L'amplitude de la fenetre n'a pas ete diminuee par le correctif

Un correctif de fuseau qui se trompe peut raccourcir la fenetre jugee : si
`jourLocalISO(7)` ne rendait pas exactement sept jours calendriers d'ecart
avec `jourLocalISO(0)`, la porte D1 mentirait sur un autre objet que le
defaut qu'elle est censee verifier. Mesure par le noyau (`date`, TZ applique)
sur cinq fuseaux, a instant fixe : chaque paire de bornes rend une amplitude
de **7 jours**, dans les cinq zones.

    FUSEAUX=5 ROUGES=0
    VERDIT=AMPLITUDE_PRESERVEE

## Verdict de la suite complete, consigne par la machine

`scripts/run-all-gates.py` rejouee APRES le patch et APRES le branchement des
deux portes de 14.f, lue par les octets et non a l'ecran
(`test/gates-14f-final3.txt`) :

    lignes RC = 59
    ROUGES = 0
    ALLRC = 0

soit **59 portes au vert, 0 rouge**, contre les 57 jouees / 2 rouges de
la livraison 14.e (deux portes ajoutees depuis). Les
deux rouges de la livraison precedente, `verify:dashboard` et
`verify:dashboard-mord`, rendent desormais `RC 0` lune et l'autre ;
`verify:dashboard-voices` suit a `RC 0`. Les deux portes neuves du sprint
sortent nommement du lot : `verify_juge-fuseaux 0`, `verify_fuseau-cost-data 0`.

Le delta de `verify:dashboard-mord` (rc=4 a la livraison 14.e, rc=0 ici) est
**consigne sans etre attribue** : la porte est jugee sans mutation de mon cote
sur elle, et la seule cause plausible (le temoin qui ne voyait rien de
mutant) n'est pas verifiee. Elle est laissee la, mesuree, non expliquee.

## Les deux portes de 14.f, et pourquoi l'une des deux n'EST pas au lot

Regle 6 d'AGENTS.md : une porte publiee lest aux DEUX endroitts,
`package.json` ET le `DEFAUT` de `scripts/run-all-gates.py`. Appliquee :

    verify:juge-fuseaux       -> python3 scripts/juge-couverture-fuseaux-d1.py
    verify:fuseau-cost-data   -> node    scripts/probe-fuseau-cost-data.mjs

La MATRICE (`scripts/matrice-fuseaux-d1.sh`) volontairement N'Y EST PAS, et
ce n'est pas un oubli : c'est le piege principal de ce sprint, consigne ici
pour que personne ne l'y ramene par la suite. La matrice depen de
l'HORLOGE REELLE du serveur. Hors du creneau divergent (00:00-02:00 local),
AUCUNE de ses zones ne diverge de UTC, elle rend alors `MATRICE_NON_PRONONCEE
rc=4` -- un refus legitime de prononcer, mais que le harnais, qui ne connait
que `rc == 0`, compte comme ROUGE. La brancher au lot ferait une porte
**faussement rouge vingt-deux heures sur vingt-quatre** : exactement la
famille des verdicts-mensonges que l'article 4 de l'audit denonce. Elle
reste donc jouee a la main, dans le creneau, quand elle a quelque chose a
dire (ces deux verdicts-la sont ceux des deux courses AVANT/APRES ci-dessus).

Le JUG, lui, fabrique ses vingt-quatre instants lui-meme (le suffixe `Z`
fige l'echelle a UTC) : il ne depend pas de l'horloge et peut vivre au lot,
ou il est vert a toute heure. C'est la difference entre une mesure et un
verdict: la premiere dit ce qu'elle a vu a l'instant ou elle a regarde, le
second doit pouvoir etre rejoué sans changer ce que le serveur a dans son
calendar.

Le capteur d'orphelines confirme le branchement (regle 6, par les octets) :
`SONDES=50 DEMI-PORTEE=1 ORPHELINE=11 PORTEE=38 VERDIT_VERT hors_loi=0` --
la sonde de fuseau y est comptee PORTEE et non ORPHELINE, ce qui est le
verdict voulu (les deux branches, `package.json` et `DEFAUT`, la citent).

## Les mensonges trouves DANS mes propres outils de preuve, et leur solde

Trois fautes de fabrication ont ete trouvees et corrigees dans la porte
elle-meme, pas dans le produit :

1. Le **compte de zones** de la matrice etait `zones_jouees=4` ecrit a la
   main la ou le fichier en joue six. Le compte est desormais DERIVE de la
   boucle (`jouees=$((jouees + 1))`) : un entier constant copie dans
   l'unique ligne que l'humain lit du verdict est un mensonge differe.
2. Ce compte derive etait d'abord **nul** (jamais initialise) : sous
   `set -u` le script avortait sur « unbound variable » et la matrice
   n'imprimait plus AUCUN verdict. Un instrument qui ne rend rien ne rend
   pas service : l'initialisation precede l'incrementation.
3. Le **juge de couverture** etait a moitie muet : sa liste de fuseaux etait
   CODEE EN DUR dans le juge, ce qui laisserait la matrice ajouter une zone
   sans que le juge la voie, et le juge continuerait d'attester 24/24 d'un
   jeu qu'il ne connait plus. La liste est desormais LUE dans le script de
   la matrice a chaque execution (`JEU_LU_DANS=` le nomme) : une seule source,
   plusieurs avis, un seul jeu de fuseaux.

## Reste a faire, consigne sans le faire

Deux sites `toISOString()` restants, en ECRITURE en base de donnees et non en
lecture de calendrier, ne sont **pas** corriges par ce sprint (voir
l'inventaire ci-dessus) : `documents:694` et `haccp:190`. Les corriger
reecrierait des dates deja gravees dans les registres du client ; la decision
appartienne au pilote et non a l'agent. Signale, non traite.

`scripts/matrice-fuseaux-d1.sh` n'est appelee par AUCUN harnais et n'a de
porte ni dans `package.json` ni dans le `DEFAUT` : c'est VOLONTAIRE et la
raison en est consignee au paragraphe ci-dessus (les deux portes). Son juge
de couverture, lui, y est branche et y est vert.
