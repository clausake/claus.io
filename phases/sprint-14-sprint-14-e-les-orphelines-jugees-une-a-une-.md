# Sprint 14.e - les orphelines jugees une a une, et cinq branchees

## L'objet de la campagne

L'article 4 (C4) de `docs/audit-2026-09-20.md` relevait des sondes sans porte:
des capteurs branches sur aucune barre de controle. La resolution de 14.d les
jouoit; jouer une sonde ne la rend pas PORTEE. Une sonde est une porte quand
elle est citee AUX DEUX ENDROITS (`package.json` ET le `DEFAUT` de
`scripts/run-all-gates.py`), au sens strict de la regle 6 d'AGENTS.md.

## Les deux portes de selection (jugees, pas nominalees)

Aucune candidate n'a ete branchée sur l'examen de son nom. Chacune a du
franchir DEUX epreuves mesurees:

1. ELLE PEUT ROUGIR. Classeur: `scripts/capteur-orphelines.py`, qui parse
   l'AST du fichier et cherche un chemin de sortie NON NUL CONDITIONNEL
   (`sys.exit` sous une valeur calculee, ou un `raise` sur un predicat).
   NEUF candidates sur quatorze rendent TOUJOURS zero: ce sont des INSTRUMENTS
   DE MESURE (p50, p95, parts en pour cent, deltas). Les brancher aurait
   ajoute neuf faux PASS structurels au lot - exactement le defaut que C4
   denonce. Elles restent jouables a la main et sont consignees dans la
   reference.

2. ELLE EST DETERMINISTE ET BORNEE. Les sondes a chronometre
   (`probe-forme-filtre`, `probe-index-staffday`) ont depasse 180 s sous la
   charge de ce poste sans rendre de verdict. Une porte dont le resultat
   depend du bruit du machine n'est pas une porte: elle serait rouge un jour,
   verte le lendemain, et personne n'y croirait plus.

CINQ ont passe: `verify:labor-cost-zero`, `verify:put-yield`,
`verify:module-contract`, `verify:installe-index`,
`verify:installe-index-forecast`. Course par le harnais lui-même:
`GATES=6 ROUGES=0` (`test/gates-14e.txt`).

## Les fils detaches, re-joues avant d'etre branches

Les quatre candidates qui levoient un serveur appelaient `child.kill()` ou
`terminate()`: ces appels ne visent QUE le pid du fils. Le `tsx` que ce fils a
engendre lui survit en orphelin accroche au port fige - c'est precisement ce
qui a produit les quatre orphelins de 14.d (456081/3999, 2228278/4321,
2226342/4331, 2237431/4351) et fait rougir les portes voisines avec un
message qui designait un serveur qui n'etait pas le leur: un verdict FAUX, pas
un echec du produit.

`scripts/_sondes_serveur.py` consigne la logique UNE fois (le fils part dans SA
PROPRE session, `os.killpg` SIGTERM puis SIGKILL sur le GROUPE entier, et
`bootstrap` qui REFUSE un port deja tenu). Prouve vivant, capteur prouve:
fils et petit-fils vivants AVANT=2, APRES_KILLPG=0; le `kill()` simple laisse
UN survivant - la preuve que le killpg n'est pas un luxe.

## V5: un verdict promit mais jamais calcule (angle mort consigne)

La docstring de `scripts/probe-verif-module.py` promettoit CINQ verdicts; le
corps n'en jugeoit QUE QUATRE depuis sa creation. V5 etait AFFICHE sans etre
CALCULE. Un verdict affiche mais non calcule est pire qu'une absence de
verdict: il endort celui qui le lit.

Il est ecrit et juge par EXECUTION (500 tokens, 500 uniques, longueur
[38..43] >= contrat 22, l'attendu etant rendu par le module lui-meme et non
recopie). Son harnais est un FICHIER (`.mjs` joue par tsx) et non un `node -e`
inline: le harnais de securite de ce poste bloque l'inline, et un inline ne se
relit pas.

MORSURE prouvée sur contrat falsifie: harnais corrompu (`minlen=6 < 22`) rend
la sonde ROUGE et nomme V5; le harnais est recolle ensuite, sha256 conforme a
l'ancre (`8d61411a0c3bf2aa`), et le `rc` global est desormais CALCULE.

## Le capteur qui a un capteur

Un capteur d'orphelines a liste FIGEE ne peut pas dire qu'une sonde NEUVE lui
echappe: le defaut de C4 se rejoueroit sur le capteur lui-meme.
`scripts/capteur-orphelines.py` prend donc sa liste SUR LE DISQUE. Deux pieges
trouves a la mesure:

- BOUCLE DE CITATIONS: quatre sondes (`probe-index-reel`,
  `probe-index-staffday`, `probe-join-stats`, `probe-nplus1`) ne se citent que
  ENTRE elles et sortaient « couvertes ». Une citation par une autre orpheline
  n'est pas une porte.
- REFERENCE SCELLEE (`docs/reference-orphelines.json`): une sonde sans porte
  qui APPARAIT depuis la reference fait ROUGIR le capteur (`rc=2`). Elle est
  consignee, pas silenciee. Le geste du pilote est `--figer`.

Mesure finale: QUARANTE-NEUF sondes, TRENTE-SEPT portees, DOUZE surveillees
(onze instruments plus une demi-portee, `probe-garde-instance-harnais-mord`
qui n'est cite que dans `package.json`).

## Reste a faire

`verify:routes` reste la seule porte du `DEFAUT` dont le verdict depende d'un
port fige (3999) partageable avec la spec e2e: la cause est environnementale
(les orphelins tues dans 14.d), non le code - la route est jugee par
`test/e2e/routes.spec.ts`, qui verifie desormais l'IDENTITE de l'instance avant
de juger quoi que ce soit.
