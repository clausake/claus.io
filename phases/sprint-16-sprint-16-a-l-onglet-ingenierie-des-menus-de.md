## Sprint 16.a - l'onglet Ingenierie des Menus devient le chat, les fiches se rangent en trois cartes (27 sept.)

### La decision jouee

Le maitre d'ouvrage (journal 22/09, appliquee au sprint 14.c) : la generation
automatique « diversite » (les trois menus creatif/gastronomique/traditionnel)
est ANNULEE — le chef AFFINE ses recettes EN DISCUTANT, puis les sauvegarde en
fiches techniques. Suite du 27/09 : le chat culinaire prend la place de la
grille de modes dans l'onglet Ingenierie des Menus ; les fiches nees de
l'echange se rangent en TROIS CARTES (Entree / Plat / Dessert) pretes a etre
sauvegardees dans l'onglet Fiches Techniques, par ordre alphabetique ; les
fiches sont editables a 100 % (texte et quantites).

### Ce qui a ete ecrit

- `src/shared/recette-chat.ts` : le parseur du gabarit (NOM / INGREDIENTS /
  ETAPES). Une reponse qui ne se lit pas entiere rend null — le formulaire
  s'ouvre VIDE, jamais une fiche inventee. La quantite absente est null
  NOMMEE, pas 0. Faute trouvee a la 1re course : le pre-strip de puce mangeait
  les chiffres de tete (« 300 g de farine » lu en « g de farine ») — corrige
  dans le parseur, la puce (« - », « 1. ») se retire SANS toucher la quantite.
- `CulinaryChat.tsx` : porte l'HISTORIQUE au serveur (bloque sans lui, « et en
  version vegane ? » repondait hors sujet) ; remet chaque reponse BRUTE a
  l'onglet via `onProposition` — c'est l'onglet qui la lit, pas le chat.
- `routes/ai.ts` : `/api/ai/chat` recoit `history` (nettoye et BORNE cote
  serveur, `historiqueSur` — on ne fait pas confiance au client) et porte la
  CONSIGNE_GABARIT au system prompt (sinon le modele repond en prose et le
  bouton Sauvegarder n'aurait rien a pre-remplir).
- `MenuAnalysis.tsx` : chat plein ecran + bouton « Analyser un menu » (la
  voie papier conservee) ; colonne des TROIS CARTES — un bouton par carte
  deplace une proposition, « Sauvegarder en fiche technique » ouvre le VRAI
  formulaire de l'onglet Fiches Techniques PRE-REMPLI (le chef valide/modifie,
  jamais d'ecriture directe en base). Les etats morts des generations annulees
  (creativeMenu/gastronomicMenu/traditionalMenu et leurs spinners) sont retirés.
- `FichesTechniques.tsx` : les dossiers sont les TROIS CARTES + « Fiches
  Importees » (les dossiers creative/gastronomic/traditional des generations
  annulees ne sont plus proposes) ; tri alphabetique conserve ; la fiche du
  chat arrive en modal editable — nom, ingredients, unite, prix, quantites,
  etapes : tout input est edite et sauve. Le POST porte `dish_type` (la carte)
  et le PUT porte `dish_type` + `unit` (sans eux le deplacement de carte et la
  correction d'unite restaient purement locaux).
- `routes/menu.ts` : la categorie lue par l'IA sur le menu papier est
  normalisee en carte (`normaliserCarte`, liste ecrite d'avance, 5 langues ;
  inconnue = telle quelle, rangee en Fiches Importees — jamais de devinette).
- `App.tsx` : l'entree « Chat Culinaire » de la sidebar mene desormais a
  l'onglet menus (le chat n'a plus d'onglet autonome) ; le relais
  `ficheDepuisChat` depose la fiche du chat dans FichesTechniques.

### Les portes

- `test/unit/recette-chat.test.ts` : 13 tests (gabarit exact, quantite absente
  = null nommee, prose libre = null, puce vs quantite, fenetre d'historique).
- `test/e2e/recipes-contract.spec.ts` : R5b — PUT `dish_type` PORTE + morsure
  (`dish_type:"steak"` → 400 refused nomme) + unite relue sur l'inventaire.
  24/24 verts.
- ANCRE_MORTE repointee : la mutation M11 du registre des recettes (le bloc
  PUT du dish_type s'etait glisse dans son ancre) — rejouee via
  `python3 scripts/registre-mutations-recipes.py` → ANCRE_ES_ALL_VERT 14.
- Course complete : `GATES=68 ROUGES=0` (2 courses, dont la finale apres les
  derniers patchs ; log test/gates-run-all-gates.py-185356.out).

### Consigne

La decision « generation annulee, c'est l'echange qui produit » est DOUBLement
materialisee : plus de route cote serveur (14.c) et plus de chemin dans l'UI
(ce sprint). La voie papier (analyser un menu) survit — c'est une lecture, pas
une generation, et le maitre d'ouvrage l'a conservee.
