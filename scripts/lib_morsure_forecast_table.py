# -*- coding: utf-8 -*-
"""Table de mutations de `negative-test-forecast-graine.py`, ecrite par OCTETS.

Les six voies de commande du calcul du besoin, chacune visee par UNE mutation
dont l'ancre est verifiee `count == 1` sur `src/routes/suppliers.ts` au moment
de jouer (une ancre qui bouge declare l'entree NON JOUEE, jamais forcee).

VOIES COUVERTES:
  M1 la sortie (besoin fige a 0)         M4 la gramature non numerique
  M2 le rendement (diviseur)             M5 la FENETRE date (SQL)
  M3 les couverts planifies              M6 la clef vide du planning

⚠ M6 est FRANCHEMENT MARQUEE « branche morte attendue sur cette base »: le
client n'a AUCUNE ligne de planning a `recipe_id` vide (comptee: 0). Si la
mutation ne mord pas, ce n'est pas un harnais casse — c'est que la branche
n'existe pas dans les donnees jouees, et le script doit le rendre comme un
ANGLE MORT avec sa cause. Un PASS rendu par une branche inatteignable n'est
pas une mesure (piege consigne du depot).
"""

# (nom, ancre, remplacement, check attendu, expectatif)
#   expectatif: "mord"  -> DOIT rougir en nommant le check
#               "mort"  -> peut etre mort sur cette base, la cause est rendue
TABLE = [
    ("M1 le besoin est fige a 0 (le defaut d'origine du produit)",
     "besoin_recettes: needs[item.id] === undefined ? 0 : needs[item.id],",
     "besoin_recettes: 0,",
     "AU MOINS UN besoin non nul", "mord"),
    ("M2 le rendement n'est plus un diviseur",
     "const pct = Number.isFinite(y) && y > 0 ? y : 100;",
     "const pct = 100;",
     "chaque besoin = l'oracle", "mord"),
    ("M3 les couverts planifies sont ignores",
     "const covers = coversOf({ recipe_json: r.recipe_json });",
     "const covers = 1.0;",
     "chaque besoin = l'oracle", "mord"),
    ("M4 une gramature non numerique devient 1",
     "const per = Number.isFinite(qpp) && qpp > 0 ? qpp : 0;",
     "const per = Number.isFinite(qpp) && qpp > 0 ? qpp : 1;",
     "chaque besoin = l'oracle", "mord"),
    ("M5 la borne basse de la fenetre est retiree (les plats hors delai entrent)",
     "AND DATE(mp.date) >= DATE(?)",
     "AND (DATE(mp.date) >= DATE(?) OR mp.date IS NOT NULL)",
     "rien d'autre n'affiche un besoin", "redundance"),
    ("M6 la garde de clef vide du planning est deplacee",
     "AND mp.recipe_id <> " + chr(39) + chr(39),
     "AND mp.recipe_id <> " + chr(39) + "zzz" + chr(39),
     "AU MOINS UN besoin non nul", "inatteignable"),
]

# LES CAUSES DES ANGLES MORTS, PROUVÉES PAR LES OCTETS DE LA BASE DU CLIENT
# (et non par une supposition): une branche que les données jouées n'atteignent
# jamais ne peut pas etre prouvée par ce gate — le rendre comme un angle mort
# avec sa cause vaut mieux qu'un « ne mord pas » qui accuse le harnais.
CAUSES_MORTS = {  # None = plus un angle mort
    # M4 n'est PLUS un angle mort: le fixture (pb2) depose une gramature a 0,
    # etat que `recipes.ts` ecrit lui-meme (`|| 0`). La voie est jouee, done
    # falsifiable: la voir NE PAS mordrer serait un defaut de la porte.
    "M4": None,
    # la borne basse est DOUBLÉE dans le SQL (mp.date >= ? ET
    # DATE(mp.date) >= ?): muter une seule des deux laisse l'autre
    # exclure les memes lignes -> sortie identique pour TOUTE
    # mutation unique. Non-falsifiable par construction, et signe
    # qu'une des deux conditions est du code mort.
    "M5": None,
    # la JOIN recipe_ingredients tue la ligne a clef vide AVANT
    # la garde: elle ne joint AUCUN ingredient, donc ne peut pas
    # changer la sortie. La muter est NEUTRE par construction; le
    # fixture ne la rendrait jouable qu'en retirant la jointure,
    # ce qui serait truquer la mesure.
    "M6": None,
}

# LES CAUSES STRUCTURELLES, lues dans le SOURCE et non supposees. Distinctes
# des angles morts de donnees: aucune quantite de donnees ne les fait mordrer.
RAISONS = {
    "M5": "double borne dans le SQL (`mp.date >= DATE(?)` ET "
          "`DATE(mp.date) >= DATE(?)`): muter une seule des deux laisse "
          "l'autre exclure les memes lignes. Non-falsifiable par mutation "
          "unique => une des deux conditions est du CODE MORT (action: en "
          "supprimer une, le gate ne peut pas la juger).",
    "M6": "la `JOIN recipe_ingredients ON ri.recipe_id = mp.recipe_id` tue la "
          "ligne a clef vide AVANT la garde `recipe_id <> ''`: elle ne joint "
          "AUCUN ingredient, done ne peut pas modifier la sortie. Muter cette "
          "garde est NEUTRE par construction; la rendre jouable exigerait de "
          "retirer la jointure, ce qui truquerait la mesure.",
}
