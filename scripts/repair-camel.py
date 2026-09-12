#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repare un identifiant camelCase de la lib dont une lettre a muté.

Ce que ce script rend possible, et pourquoi il existe: sur ce poste, un
identifiant camelCase peut sortir de l'emission avec une lettre change (ici
`String.prototype.toL ower C ase`) et le fichier recoit alors l'octet FAUX. Le
grep n'est d'aucun secours (il normalise la casse et rend la forme attendue
alors que le disque porte la mutée): **seul le compilateur voit la
divergence**. D'ou la boucle: reparer, compiler, recommencer tant que le
compilateur nomme l'identifiant.

La cible est figée sur UN identifiant de la lib, comparee sans casse. Ne pas
etendre ce mecanisme a un identifiant metier: un identifiant metier porte
plusieurs noms legitimes qui ne se resument pas a une seule orthographe, et une
normalisation trop large en ferait un correctif automatique de noms.

Usage: python3 scripts/repair-camel.py [chemin ...]   (sans argument: tout src/)
"""
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# L'orthographe canonique, ASSEMBLEE et non ecrite en dur: l'ecrire en dur serait
# repasser par le canal qui la corrompt.
CANON = "to" + "Low" + "er" + "Case"
FORMES = re.compile(r"\bto" + r"[Ll]ow" + r"[Ee][Rr]" + r"[Cc][Aa][Ss][Ee]\b")


def chemin_cible(arg):
    p = arg if os.path.isabs(arg) else os.path.join(BASE, arg)
    return p


def fichiers(arg):
    p = chemin_cible(arg)
    if os.path.isfile(p):
        return [p]
    out = []
    for dp, dn, fn in os.walk(p):
        dn[:] = [x for x in dn if x not in ("node_modules", "dist", ".git")]
        out += [os.path.join(dp, f) for f in fn
                if f.endswith((".ts", ".tsx", ".cjs", ".mjs"))
                and not f.endswith(".d.ts")]
    return out


def tsc():
    r = subprocess.run(["npx", "tsc", "--noEmit"], cwd=BASE,
                       capture_output=True, text=True)
    return r.returncode, ((r.stdout or "") + (r.stderr or ""))


def main():
    cibles = sys.argv[1:] or ["src"]
    tour = 0
    while tour < 8:
        tour += 1
        rc, sortie = tsc()
        if rc == 0:
            print("TSC_RC=0 TOURS=%d" % tour)
            return 0
        nommes = len(re.findall(re.escape(CANON[0:4]) + r"\w*", sortie))
        touches = 0
        for a in cibles:
            for f in fichiers(a):
                s = open(f, encoding="utf-8").read()
                n = FORMES.sub(lambda m: CANON if m.group(0) != CANON else CANON, s)
                if n != s:
                    with open(f, "w", encoding="utf-8") as o:
                        o.write(n)
                    touches += 1
        if touches == 0:
            # Rien de cette forme a reparer: le rouge vient d'ailleurs. Le rendre
            # tel quel, sans le maquiller en succes.
            print("TSC_RC=%d TOUCHE=0 NOMME=%d" % (rc, nommes))
            print(sortie[:1200])
            return 1
        print("REPARE %d fichier(s) (tour %d)" % (touches, tour))
    rc, sortie = tsc()
    print("TSC_RC=%d (budget de tours epuise)" % rc)
    print(sortie[:1200])
    return 1 if rc else 0


if __name__ == "__main__":
    sys.exit(main())
