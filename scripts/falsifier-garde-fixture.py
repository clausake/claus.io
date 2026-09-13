#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsifie la garde `rc = 3` du fixture (la voie M4), en chargeant la
sonde SANS sa sortie de module.

POURQUOI CETTE FORME. Deux tentatives de fabrication par copie de base
(ôter les articles libres pour que le fixture ne puisse rien poser) ont
rendu `rc = 2` : l'arret « l'oracle ne rend aucun besoin » prend la place
AVANT la garde. La copie ne tranche pas — elle ne montre qu'un voisinage.
Il faut donc jouer la BRANCHE, c'est-a-dire rendre le no-op du fixture
possible a volonte et verifier que la course rougit.

POURQUOI PAS D'IMPORT. Le fichier de la sonde finit par
`sys.exit(main())` AU NIVEAU MODULE, sans garde `if __name__ ==
"__main__":`. Un import dynamique (ou un exec brut) joue donc la course
avec les arguments du CONTROLEUR et leve SystemExit avant tout: la premiere
version de ce script a rendu un solde faux pour cette raison exacte (une
seule course, sans drapeau, `+14 j`). Le tracé l'a prouvé, pas l'hypothèse.

CE QUI SE PASSE ICI: les octets sont relus, la ligne de sortie est
repérée par egalité exacte et CONTROLEE unique (une occurrence, sinon
abstention), remplacee par `pass`, puis le tout est compile et execute dans
un namespace etange. `fixture_exercer` est ensuite remplacee par une
IMITATION de no-op.

CE QUE CELA PROUVE: la voie « fixture demande mais ne pose rien » est
branchée et fait ROUGIR, et seulement quand le drapeau est demande.
CE QUE CELA NE PROUVE PAS: qu'un etat client reel atteigne ce no-op. Les
copies tentees rendent `rc = 2` avant la garde: angle mort ASSUME, consigné
au verdict, non vendu comme mesure.

Une imitation de defaut est de la donnee inventee: elle n'est PAS la donnee
du client et n'entre donc dans AUCUN lot de gates. Controle de voie.
"""
import os
import sys

RACINE = os.path.join(os.path.expanduser("~"), "cookdrive-project")
SONDE = os.path.join(RACINE, "scripts", "probe-forecast-real.py")
SORTIE = "sys.exit(main())"


def charger():
    """Charge la sonde en neutralisant sa sortie de module (controles durs)."""
    octets = open(SONDE, encoding="utf-8").read()
    lignes = octets.split("\n")
    places = [i for i, l in enumerate(lignes) if l.strip() == SORTIE]
    if len(places) != 1:
        raise RuntimeError(
            "ancre de sortie %r trouvee %d fois (attendu 1): la structure "
            "du module a change, le controle de voie ne peut pas trancher"
            % (SORTIE, len(places)))
    lignes[places[0]] = "    pass  # sortie retiree: le controle la joue lui-même"
    ns = {"__name__": "sonde_controlee", "__file__": SONDE}
    # Le module de la sonde calcule `HERE = dirname(abspath(sys.argv[0]))` AU
    # NIVEAU MODULE: si on l'exec avec l'argv du CONTROLEUR, HERE devient le
    # repertoir du python et le brouillon (`WORKROOT`) tombe hors du controle
    # — ecritures hors perimetre. On fige donc argv a la veritable path du
    # fichier pendant la phase de chargement, puis on la rend.
    sauve = sys.argv
    sys.argv = [SONDE]
    try:
        exec(compile("\n".join(lignes), SONDE, "exec"), ns)
    finally:
        sys.argv = sauve
    for nom in ("main", "fixture_exercer"):
        if nom not in ns:
            raise RuntimeError("symbole %r absent du module charge" % nom)
    return ns


def jouer(ns, arguments):
    """Joue une course et rend son code de sortie REEL.

    DEFAUT CORIGNE ICI, decouvert par ce script lui-même: quand le controle
    retire `sys.exit(main())` du module, `main()` RETOURNE son code sans
    quitter. La premiere version de cette fonction ne lisait que
    `SystemExit.code` et rendait donc 0 dans tous les cas — un PASS qui ne
    peut pas devenir FAIL. Le solde « no-op=0 » n'etait pas un verdict de la
    sonde, mais l'artefact d'un lecteur myope. On exploite desormais la
    VALEUR RETOURNEE, et `SystemExit` n'est plus qu'un chemin secondaire.
    """
    sys.argv = [SONDE] + arguments
    try:
        code = ns["main"]()
    except SystemExit as sortie:
        return 0 if sortie.code is None else int(sortie.code)
    return 0 if code is None else int(code)


def main():
    ns = charger()
    vraie = ns["fixture_exercer"]

    # 1) VOIE NORMALE: fixture reel -> 0. Sans ce controle, un rc=3
    #    permanent ressemblerait a une reaction alors qu'il serait fige.
    rc_normal = jouer(ns, ["--semer=decaler", "--fixture=branches",
                           "--horizon=0"])
    print("voie normale (fixture reel) : rc=%d  attendeu 0" % rc_normal)

    # 2) VOIE DE GARDE: le fixture est demande mais ne pose rien -> ROUGE.
    ns["fixture_exercer"] = lambda db_copy, today: (0, 0, None)
    rc_noop = jouer(ns, ["--semer=decaler", "--fixture=branches",
                          "--horizon=0"])
    print("voie no-op (fixture fake)   : rc=%d  attendeu 3" % rc_noop)
    ns["fixture_exercer"] = vraie

    # 3) NON-RETOURNEMENT: sans drapeau, un no-op fictif ne doit rien
    #    inventer. On controle « != 3 » et non « == 0 »: la valeur 0
    #    dependrait des donnees du jour chez le client.
    ns["fixture_exercer"] = lambda db_copy, today: (0, 0, None)
    rc_sans = jouer(ns, ["--semer=decaler", "--horizon=0"])
    ns["fixture_exercer"] = vraie
    print("voie sans drapeau fixture   : rc=%d  attendeu non-3" % rc_sans)

    if rc_normal == 0 and rc_noop == 3 and rc_sans != 3:
        print("GARDE VIVANTE: le no-op du fixture fait ROUGIR (3), et")
        print("               seulement quand il est demande.")
        print("ANGLE MORT ASSUME: aucun etat client connu n'atteint ce no-op")
        print("(les copies tentees rendent rc=2 AVANT la garde). La voie est")
        print("prouvee par simulation, pas par une donnee du client.")
        return 0
    print("⚠ FALSIFICATION ECHOUEE: normal=%d no-op=%d sans=%d"
          % (rc_normal, rc_noop, rc_sans))
    print("un PASS qui ne peut pas devenir FAIL n'est pas une mesure.")
    return 7


if __name__ == "__main__":
    sys.exit(main())
