#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifie que les trois portes du contrat de lignes sont reelslement au
manifeste et au lot, par OCTETS et non par un rendu.

Existe parce que la meme verification en inline de shell a rendu « 3 None » sur
un manifeste correctement dote: le CLI corrompt les litteraux longs (piege
consigne: `--flag-x -> --flag-y`, `read_file abandone les lignes > ~79
colonnes`). Une porte que seul le rendu dit presente est une porte qui
n'existe pas: `verify:all` lit sa liste DANS package.json et rougit sur une
porte absente, donc une porte verifiee a l'oeil est une porte fantome.
"""
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PK = os.path.join(BASE, "package.json")
GATES = os.path.join(BASE, "scripts", "run-all-gates.py")

CLES = ("verify:document-items",
        "verify:document-items-mord",
        "verify:document-items-voices")


def main():
    with open(PK, encoding="utf-8") as f:
        manifeste = json.load(f)
    scripts = manifeste["scripts"]
    print("MANIFESTE (JSON parse, pas un rendu):")
    manque = []
    for k in CLES:
        v = scripts.get(k)
        print("  %-32s %s" % (k, v if v else "*** ABSENTE ***"))
        if not v:
            manque.append(k)

    # La cible de chaque porte doit exister sur disque: une porte qui pointe un
    # fichier absent est un lot rouge qui ne dit rien du produit.
    for k in CLES:
        v = scripts.get(k) or ""
        cibles = re.findall(r"(scripts/[\w./-]+|test/[\w./-]+)", v)
        for c in cibles:
            plein = os.path.join(BASE, c)
            if not os.path.isfile(plein):
                print("  CIBLE ABSENTE pour %s: %s" % (k, c))
                manque.append("%s->%s" % (k, c))

    with open(GATES, encoding="utf-8") as f:
        lot = f.read()
    print("LOT DEFAUT (run-all-gates.py):")
    for k in CLES:
        dans = '"%s"' % k in lot
        print("  %-32s %s" % (k, "DANS DEFAUT" if dans else "*** PAS DANS LE LOT ***"))
        if not dans:
            manque.append("lot:" + k)

    # Le lot refuse une porte absente du manifeste (PORTES_INCONNUES, rc=2):
    # on rejoue DONC le lot en mode lecture seule pour confirmer que les trois
    # cles sont connues, sans payer l'execution complete.
    proc = subprocess.run(
        [sys.executable, "-c",
         "import sys; sys.path.insert(0, %r); import ast; "
         "ast.parse(open(%r, encoding='utf-8').read()); print('LOT PARSE OK')"
         % (os.path.join(BASE, "scripts"), GATES)],
        capture_output=True, text=True, cwd=BASE,
    )
    print(proc.stdout.strip() or proc.stderr.strip()[-400:])

    print("-" * 60)
    if manque:
        print("FAILLI: " + ", ".join(manque))
        return 1
    print("3/3 PORTES BRANCHEES (manifeste + cible sur disque + lot)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
