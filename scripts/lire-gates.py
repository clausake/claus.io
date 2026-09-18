#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lit les verdicts d'un run de portes. Ne PEUT pas rendre du vide en silence.

POURQUOI CE FICHIER EXISTE. Le 17/09 au soir, le pilote a rejoue 12 fois:
    grep '^===== verify:' test/gates.out | tail -n 20
en boucle jusqu'a l'arret du garde-fou. Le harnais ecrit ses en-tetes
    ===== verify:sse rc=0 =====
(avec le `rc=` colle au nom) : la pattern `===== verify:` ne matche DONC JAMAIS,
la grepe rend une chaine VIDE avec exit 0, et rien n'avertit l'agent que sa
recherche est fausse. Il a brule 12 tentatives a relire le meme Rien.

Un rapport qui peut rendre du vide sans le dire n'est pas un rapport: c'est un
piege. Ici le vide est IMPOSSIBLE -- soit il y a un verdict par porte, soit le
script dit explicitement qu'il n'a rien trouve et propose les formats qui, eux,
marchent.

USAGE
    python3 scripts/lire-gates.py                 # dernier run, tableau + total
    python3 scripts/lire-gates.py --rouges        # seulement ce qui coince
    python3 scripts/lire-gates.py --chemin X      # un autre gates.out
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join(BASE, "test", "gates.out")

# Les deux formats que le harnais produit reellement (verifies sur disque, pas
# suppose): les en-tetes du log et le resum lu par les humains.
LIGNE_RC = re.compile(r"^RC\s+(\S+?)\s+(\d+)\s*$")
EN_TETE = re.compile(r"^=====\s+(\S+?)\s+rc=(\d+)\s*=====\s*$")
RESUM = re.compile(r"^(GATES|ROUGES)=(\d+)$|^LISTE\s+(.*)$|^LOG\s+(.*)$")


def lire(chemin):
    """Rends (verdicts, rien) ou (rien, message). JAMAIS ([], rien): le vide est un echec.

    Un seul tuple porteur par chemin de retour, donc aucun appelant ne peut confondre
    'aucune porte' et 'porte trouvee' en testant la longueur d'une liste.
    """
    if not os.path.isfile(chemin):
        return (), "ABSENT: %s (les portes n'ont pas encore tourne)" % chemin
    with open(chemin, encoding="utf-8", errors="replace") as f:
        lignes = f.read().splitlines()
    if not lignes:
        return (), "le fichier est vide (%s)" % chemin
    verds = []
    for ln in lignes:
        m = LIGNE_RC.match(ln) or EN_TETE.match(ln)
        if m:
            verds.append((m.group(1), int(m.group(2))))
    if not verds:
        return (), ("AUCUN verdict trouv\u00e9 dans %s (%d lignes lues). Le fichier "
                    "est peut-\u00eatre vide ou d'un autre format." % (chemin, len(lignes)))
    return tuple(verds), tuple(lignes), ()


def main(argv):
    chemin = DEFAULT
    if "--chemin" in argv:
        i = argv.index("--chemin")
        if i + 1 >= len(argv):
            print("--chemin sans valeur")
            return 2
        chemin = argv[i + 1]
    verds, lignes, err = lire(chemin)
    if err:
        # C'est LA ligne qui manquait: un rien qui se signale comme un rien.
        print("VIDE: " + err)
        print("  -> ne grepe pas au hasard; ces commandes, elles, rendent quelque chose:")
        print("       python3 scripts/lire-gates.py")
        print("       grep -c '^RC ' %s        # combien de portes jugees" % os.path.relpath(chemin, BASE))
        print("       head -n 40 %s            # le debut du log, tel quel" % os.path.relpath(chemin, BASE))
        print("  (le format reel des en-tetes est '===== <porte> rc=N =====' et 'RC <porte> N',")
        print("   SANS espace apres 'verify:' -- une grepe '^===== verify:' ne matche rien)")
        return 3

    rouges = [(g, rc) for g, rc in verds if rc != 0]
    veus = set(argv) & {"--rouges", "-r"}
    montres = rouges if veus else verds
    print("PORTES=%d  ROUGES=%d  (%s)" % (len(verds), len(rouges),
                                          os.path.relpath(chemin, BASE)))
    for g, rc in montres:
        marque = "x" if rc else "."
        print("  %s %-42s rc=%d" % (marque, g, rc))
    if rouges and not veus:
        print("  -> rejouer seulement ce qui coince: "
              "python3 scripts/run-all-gates.py " + " ".join(g for g, _ in rouges))
    resume_present = any(
        RESUM.match(ln) is not None
        for ln in lignes)
    if not rouges and not resume_present:
        print("  VERT NON PROUVE / RUN INTERROMPU: le journal n'a pas de résumé "
              "(GATES=/ROUGES=); relance python3 scripts/run-all-gates.py "
              "(verify:all = npm run verify:all)")
        return 1
    if not rouges:
        print("  TOUT VERT")
    return 1 if rouges else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
