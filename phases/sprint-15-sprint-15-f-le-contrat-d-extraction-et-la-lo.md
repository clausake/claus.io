# Sprint 15.f - le contrat d'extraction et la locale DECLAREE (taches 15-16) (27 sept.)

## Ce qui est consigne

Fin du Sprint 15 : taches 15 et 16, les deux dernières du contrat. Deux
commits : `5a754bd` (15) et `15a7263` (16).

### Tache 15 — le contrat d'extraction (ce qui tue l'hallucination)

`src/shared/extraction/` : quatre gardes joueES, pas decrites.

- `preuve-ancree.ts` : la regle cardinale. Pour CHAQUE champ, la tranchee
  `ligne.slice(debut, fin)` doit etre EGALE a la valeur rendue. Sans preuve
  → `CHAMP_SANS_PREUVE` → null, jamais comble ; preuve qui ne rend pas la
  valeur → `PREUVE_MENTIE` → null. Les caracteres ambigus (0/O, 1/l/I, 5/S,
  6/G, 8/B, 9/q) ne sont JAMAIS corriges : `AMBIGU` rend les DEUX lectures et
  la ligne attend le chef. Les nombres non finis (NaN/Infinity) sont refuses
  A LA PORTE (la lecon du depot : `JSON.stringify(Infinity)` rend null).
- `garde-arithmetique.ts` : le LLM ne calcule pas, il range. Par ligne
  `round(qte x pu, 2) == montant` ; `Σ montants == HT` ; `HT x taux == TVA` ;
  `HT + TVA == TTC`. Centimes entiers compares (pas de flottants approximes).
- `garde-identifiants.ts` : clef INSEE (les 11 premiers %% 97 == les 3
  derniers) et clef TVA `(12 + 3 x (SIREN %% 97)) %% 97`. Consigne : le banc
  du 25/09 portoit `00027`, la clef vraie est `066` — un identifiant fautif
  ne peut pas juger la voie « accepte », la clef est VERIFIEE par la garde.
- `garde-dlc.ts` : DLC passee = REFUSEE, DDM passee = LICITE (deux regles
  distinctes) ; libelles fr/de/es/it/nl ; `31/02`, `13/13`, `05/l0` refuses ;
  la date du jour est INJETEE par l'appelant, jamais `Date.now()` dans un
  juge (une porte dependante de l'horloge rougit seule le lendemain).

La porte `scripts/negative-test-extraction.py` : copie isolee, node_modules
symlink, chaque mutation doit rendre rc!=0 ET nommer le test vise. **6/6
mordantes** (les 4 mutations du 25/09 + preuveAncre + les deux clefs).

Faute trouvee a l'ecriture du test, corrigee dans le SERVICE et non le test :
la premiere version alertait AMBIGU sur tout champ — un « O » de
FOURNITURES GASTRONOMIQUES rougissait une raison sociale. L'alerte ne regarde
que les champs chiffres (`champChiffre`/`exigerNombre`). Les 22 tests jouent
les valeurs reelles de la piece du banc (attendus 419,60/41,96/461,56).

### Tache 16 — la locale est DECLAREE, jamais inferee

`src/shared/i18n/` :
- `locales.ts` : la matrice. Seuls les QUATRE scripts PROUVES par curl avec
  suivi des 302 (latin 8 066 518, cyrillic 8 073 294, arabic 8 023 442,
  devanagari 7 936 806 octets) sont des promesses. Une locale a script
  inconnu REFUSE (`SCRIPT_NON_GARANTI`) — `th-TH` est la case ecrite pour
  refuser : un texte non-latin rendu par le modele latin sort en glyphes
  sans valeur sans exception ni signe, le pire genre de faute.
- `nombre.ts` : le separateur est le MULTIPLICATEUR du prix (419,60 lu faux
  = 41960, sans crash). Sans locale declaree : aucune valeur ne sort. « 1.234 »
  licite 1234 (de) ET 1.234 (us) rend `SEPARATEUR_AMBIGU` + les deux lectures.
  Le detecteur structurel est decharge de trancher : `precocherAssistant`
  pre-coche seulement.
- `date.ts` : les 144/365 dates licites dans les DEUX ordres (mesure 25/09)
  rendent `DATE_AMBIGUE` + les deux lectures — un 05/09 est licite deux fois,
  aucune verification ne peut trancher ; la declaration du chef tranche.
- `mots-cles.ts` : TVA/IVA/BTW/MwSt/… par langue DECLAREE. « BTW » en fr est
  refuse, pas devine.

La porte `scripts/mesurer-langues-formats.py` (via `couloir-i18n.mjs` : le
produit joue, Python juge, jamais de relecture des sources par le Python) :
20 cases vertes (a : la matrice ne promet que les 4 scripts prouves ; b :
chaque locale lit la piece du banc selon SA regle — 419,60 fr, 1.234,56 de,
1,234.56 us, les mots-cles TVA par langue ; c : morsure PROUVEE — retirer la
garde d'ambiguite de date.ts rend rc=1 en nommant `05/09/2026`, retablie
rc=0 ; mesuree les deux sens).

## Les mesures du tour

- vitest : +22 (extraction) +15 (i18n) = 145 tests, tous verts ; tsc 0.
- Porte extraction : 6/6 mutations mordantes avec le test vise nomme.
- Porte langues : rc=0 ; morsure date.ts mesuree rc=1 → rc=0.
- Lot complet apres branchement des deux portes nouvelles aux DEUX endroits
  (`package.json` + `DEFAUT`) : voir la course consignee ci-dessous
  (`PORTES=67`, l'instable connu `installe-index-forecast` mis a part).
- Piege rejoue en direct et consigne : annotations TS dans un `.mjs` du banc
  (le couloir i18n) → « Unexpected token ':' » par node ; c'est le couloir
  qui NOMME sa propre mort (rc=1 stderr), la porte repond rc=2 « capteur
  mort » au lieu de compter des fautes — la distinction capteur/verdict est
  la regle 2 du depot.

## Reste au chef

- La banque de factures reelles (`test/fixtures/factures/`, 10-20 pieces +
  attendus) pour que `scripts/juge-ocr.py` rende autre chose que PRET.
- Le `.exe` Windows / `.dmg` macOS a juger par la CI ou une machine adaptee
  (pas de binfmt/qemu sur GX2, consigne du contrat etape 3).
