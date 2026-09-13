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
     "chaque besoin = l'oracle", "mort"),
    ("M5 la borne basse de la fenetre est retiree (les plats hors delai entrent)",
     "AND DATE(mp.date) >= DATE(?)",
     "AND (DATE(mp.date) >= DATE(?) OR mp.date IS NOT NULL)",
     "rien d'autre n'affiche un besoin", "mort"),
    ("M6 la garde de clef vide du planning est deplacee",
     "AND mp.recipe_id <> " + chr(39) + chr(39),
     "AND mp.recipe_id <> " + chr(39) + "zzz" + chr(39),
     "AU MOINS UN besoin non nul", "mort"),
]

# LES CAUSES DES ANGLES MORTS, PROUVÉES PAR LES OCTETS DE LA BASE DU CLIENT
# (et non par une supposition): une branche que les données jouées n'atteignent
# jamais ne peut pas etre prouvée par ce gate — le rendre comme un angle mort
# avec sa cause vaut mieux qu'un « ne mord pas » qui accuse le harnais.
CAUSES_MORTS = {
    "M4": "0/18 gramatures non exploitables (toutes real, 0.08..0.22) : la "
          "branche `: 0` de la gramature n'est jamais atteinte par ces données",
    "M5": "après calage +7, les 7 plats tombent en [aujourd'hui, +6] : aucun "
          "n'est AVANT la borne basse, elle n'a rien à exclure",
    "M6": "0 ligne de planning à recipe_id vide : la garde de clef n'a rien à "
          "filtrer",
}
