#!/usr/bin/env python3
"""Juge de couverture des fuseaux pour la porte D1 (tableau de bord).

PORQUOI CE FICHIER EXISTE. Une porte ne prouve que la voie qu'elle arpente.
La porte D1 ne craque que si, a l'instant OU on la joue, le fuseau choisi a
une date LOCALE differente de la date UTC. Si la liste de fuseaux de la
matrice laisse passer une heure du jour OU AUCUN de ses fuseaux ne diverge,
la porte rend VERT sans rien verifier : un angle mort consigne au vert.

Ce juge balaie donc les 24 heures d'un jour UTC et demande, pour chaque
heure, si AU MOINS UN fuseau du jeu diverge. Il rend le nombre d'heures
couvertes et DENOMME les heures nues (aucune divergence possible).

LE JEU DE FUSEAUX N'EST PAS UNE CONSTANTE ICI. Il est LU dans le script de
la matrice (scripts/matrice-fuseaux-d1.sh), source unique des zones jouees.
Une copie collees ici pourrait pourrir en silence : la matrice ajouterait
une zone sans que le juge la voie, et le juge continuerait d'attester 24/24
d'un jeu qu'il ne connait plus. Le juge LEVE une anomalie si la ligne
`for tz in ...; do` n'est pas trouvee ou rend un jeu vide : l'absence de
lecture est une rouge, jamais un vert.

PAS DE TEST DE VIE PAR ZONE (le premier jet etait faux). Un test qui
compare deux instants distants dans UNE MEME zone declare UTC morte : a
05:37Z et 17:37Z, UTC rend la MEME date, et c'est correct. Le vrai garde
est collectif : on compte les zones qui divergent REELLEMENT de UTC sur au
moins une des 24 heures. Un nom de fuseau inexistant fait retomber `date`
sur UTC EN SILENCE ; une zone retombee ainsi ne diverge jamais et se
denombre elle-meme dans ZONES_QUI_DIVERGENT, ou elle fait defaut.

Mesure par le noyau (`date` GNU, TZ applique, instant UTC explicite par le
suffixe Z). On ne se fie PAS a une table de decalages memorises : les
heures d'avance/changement rendraient une table fautive.

Usage :
    python3 scripts/juge-couverture-fuseaux-d1.py            # jeu LU dans la matrice
    python3 scripts/juge-couverture-fuseaux-d1.py UTC Foo    # exploration, override
Sortie :
    JEU_LU_DANS=<chemin>  FUSEAUX=[...]
    ZONES_QUI_DIVERGENT=<n>
    COUVERTURE=<n>/24
    HEURES_NUES=[...]            (les heures ou AUCUN fuseau ne diverge)
    VERDIT=VINGT_QUATRE | VERDIT=ANGLE_MORT
"""
import os
import re
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATRICE = os.path.join(RACINE, "scripts", "matrice-fuseaux-d1.sh")
JOUR_UTC = "2026-09-25"          # date arbitraire, aucun sens particulier
MINUTE = 37                      # hors des bornes d'heure et des heures pleines
HEURES = range(24)


def anomaler(msg):
    """Une anomalie de LECTURE est une rouge immediate, pas un vert."""
    print("ABSTENTION:", msg)
    print("VERDIT=ANGLE_MORT")
    sys.exit(2)


def lire_les_fuseaux(chemin):
    """Va chercher la liste des zones jouees DANS le script de la matrice.

    Rend la liste. Rend l'abstention si le fichier ou la ligne manque, ou
    si la liste est vide : on ne peut pas certifier la couverture d'un jeu
    qu'on n'a pas reussi a lire.
    """
    if not os.path.exists(chemin):
        anomaler("le script de la matrice est absent: " + chemin)
    with open(chemin, encoding="utf-8") as fh:
        texte = fh.read()
    m = re.search(r"^for tz in ([^;]+); do", texte, re.M)
    if not m:
        anomaler("aucune ligne `for tz in ...; do` trouvee dans " + chemin)
    jeu = [t.strip() for t in m.group(1).split() if t.strip()]
    if not jeu:
        anomaler("la boucle de la matrice ne joue AUCUNE zone")
    return jeu


def date_locale(instant_z, fuseau):
    """La date calendrier LOCALE de l'instant `instant_z` dans le `fuseau`.

    `date` GNU sans l'option -u, donc le TZ de l'environnement s'applique ;
    l'instant porte le suffixe Z qui en fige l'echelle a UTC.
    """
    env = {"PATH": "/usr/bin:/bin", "TZ": fuseau}
    rendu = subprocess.run(
        ["date", "-d", instant_z, "+%F"],
        capture_output=True, text=True, env=env,
    )
    if rendu.returncode != 0 or not rendu.stdout.strip():
        anomaler(
            "date a echoue sur TZ=%r instant=%r (rc=%d, stdout=%r)"
            % (fuseau, instant_z, rendu.returncode, rendu.stdout)
        )
    return rendu.stdout.strip()


def instant_de(heure):
    return "%sT%02d:%02d:00Z" % (JOUR_UTC, heure, MINUTE)


def principale(jeu, source):
    print("JEU_LU_DANS=%s  FUSEAUX=%s" % (source, "+".join(jeu)))

    # UTC sert d'etalon : la date de chaque heure est lue DEUX fois, une
    # fois sous UTC, une fois sous chaque zone du jeu.
    dates_utc = {h: date_locale(instant_de(h), "UTC") for h in HEURES}

    nues = []
    couvertes = 0
    qui_divergent = set()
    for heure in HEURES:
        z = instant_de(heure)
        divergents = [f for f in jeu if date_locale(z, f) != dates_utc[heure]]
        qui_divergent.update(divergents)
        if divergents:
            couvertes += 1
        else:
            nues.append(heure)

    print("ZONES_QUI_DIVERGENT=%d/%d  %s"
          % (len(qui_divergent), len(jeu), "+".join(sorted(qui_divergent)) or "AUCUNE"))
    print("COUVERTURE=%d/24" % couvertes)
    print("HEURES_NUES=%s" % (nues or "aucune"))

    if not qui_divergent:
        # toutes les zones sont retombees sur UTC (nom inexistant, TZ refuse)
        anomaler("AUCUNE zone ne diverge de UTC en 24 heures: le jeu est "
                "entierement retombe sur UTC (noms de fuseaux invalides?), "
                "la matrice ne peut rien mesurer")
    if couvertes == 24:
        print("VERDIT=VINGT_QUATRE")
        return 0
    print("VERDIT=ANGLE_MORT (%d heure(s) ou aucun fuseau ne diverge; "
          "ajouter une zone a la matrice)" % len(nues))
    return 1


if __name__ == "__main__":
    args = sys.argv[1:]
    if args:
        sys.exit(principale(args, "argument(s) de la ligne de commande"))
    sys.exit(principale(lire_les_fuseaux(MATRICE), MATRICE))
