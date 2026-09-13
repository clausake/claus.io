#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insere la fonction de calage, dans la copie de la sonde (JAMAIS la base du
client). Ecrite en FRAGMENTS COURTS : le poste du journal rogne les emissions
longues (piege consigne au Sprint 9), donc le texte de la fonction ne passe
JAMAIS par un litéral géant d'un script.

Le mode: une seule colonne est touchée, `menu_planning.date`, par un DECALE
UNIQUE applique a toutes les lignes liees a une recette. La gramature
(`quantity_per_person`), les couverts (`recipe_json`), le rendement
(`inventory.yield_percent`), les prix et les stocks ne bougent pas d'un octet.
"""

FRAGMENTS = [
    "",
    "def caler_planning_sur_aujourdhui(db_path, today):",
    '    """Decale UNIQUEMENT la colonne `menu_planning.date`, d un DECALE UNIQUE.',
    "",
    "    ⚠ Ce que ce mode NE FABRIQUE PAS: aucune gramature (quantity_per_person),",
    "    aucun couverts (recipe_json), aucun rendement (inventory.yield_percent),",
    "    aucun prix, aucun stock, aucun article. La base du client est RICH",
    "    (6 recettes, 18 ingredients, 0 orphelin): le seul blocage est CALANDRIAL.",
    "    Decaler la date est la plus petite transformation qui rende la chaine",
    "    mesurable sans la fabriquer.",
    "",
    "    Le decale est UNIQUE et DETERMINISTE: le plus vieux plat planifie tombe",
    "    a `today`. Les distances RELATIVES entre plats sont preservees (le",
    "    calendrier du chef garde sa forme), et il n y a aucun ajustement ligne",
    "    par ligne qui pourrait cacher une donne seme.",
    "",
    "    Retourne (delta, n_lignes_touchees). 0 si rien a decaler.",
    '    """',
    "    con = sqlite3.connect(db_path)",
    "    try:",
    '        bornes = con.execute(',
    '            "SELECT MIN(DATE(date)), MAX(DATE(date)) FROM menu_planning"',
    '            "  WHERE recipe_id IS NOT NULL AND recipe_id <> \'\'"',
    "        ).fetchone()",
    "        if not bornes or not bornes[0]:",
    "            return 0, 0",
    '        d0 = datetime.datetime.strptime(bornes[0][:10], "%Y-%m-%d").date()',
    '        d1 = datetime.datetime.strptime(today, "%Y-%m-%d").date()',
    "        delta = (d1 - d0).days",
    "        if delta == 0:",
    "            return 0, 0",
    '        n = con.execute(',
    '            "UPDATE menu_planning"',
    '            "   SET date = DATE(DATE(date), ? || \' days\')"',
    "            '  WHERE recipe_id IS NOT NULL AND recipe_id <> \'\'',",
    "            (('%+d' % delta),),",
    "        ).rowcount",
    "        con.commit()",
    "        return delta, n",
    "    finally:",
    "        con.close()",
    "",
    "",
]


def texte_fonction():
    """Assemble les fragments et VERIFIE la forme avant tout ecriture.

    ⚠ La parite des gueullemets se juge sur le BLOC ENTIER et non fragment par
    fragment: un docstring traverse LEGITIMEMENT plusieurs fragments (une
    ligne ouvrante de triple gueullemet a un compte impair par nature). Un
    controle par fragment est DONEC un faux positif qui interdit le texte
    correct — la mesure doit porter sur ce qui rend un bloc invalide: une
    chaïne jamais refermee sur l'ensemble, ou une syntaxe qui ne compile pas.
    """
    corps = "\n".join(FRAGMENTS)
    for guil in ('"', "'"):
        if corps.count(guil) % 2:
            raise ValueError("bloc: guillemets %s impairs (fragment rogne?)" % guil)
    for i, l in enumerate(FRAGMENTS, 1):
        if l.count("#") % 2 and l.strip().startswith("def "):
            raise ValueError("fragment %d suspect -> %r" % (i, l[:70]))
    if corps.count("def ") != 1:
        raise ValueError("le bloc ne declare pas exactement une fonction")
    compile(corps, "<calage>", "exec")      # la syntaxe, avant de toucher le disque
    return corps


if __name__ == "__main__":
    import sys
    try:
        texte_fonction()
        print("BLOC CANONIQUE: %d fragments, %d octets, compile OK"
              % (len(FRAGMENTS), len(texte_fonction().encode("utf-8"))))
        sys.exit(0)
    except Exception as e:
        print("BLOC NON CONFORME — ABSTENTION:", e)
        sys.exit(4)
