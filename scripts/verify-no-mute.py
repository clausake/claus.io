#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Barriere « aucun test muet » (T3.3).

Elle rougit si un test est MUTES sans que personne le voie : .skip / .only /
.todo sur test|it|describe (vitest/playwright) dans test/ et src/.

Pourquoi cette porte existe : le 31/10 le fait 13 du planning affirmait « 7 tests
.skip » (commande `grep -rn "\\.skip\\(" test src | wc -l`). Rejouee, elle rend
0 : le motif est une SOUS-CHAINE de `process.exit(` et `sys.exit(`. Le capteur
du planning etait donc CASSE — il comptait des sorties de processus comme des
tests sautes, et il aurait tout aussi bien pu louper un vrai skip. Une regle
« aucun .skip muet » assise sur un capteur qui ne voit pas un vrai skip n'est
pas une regle : cette porte est le capteur qui ne peut pas mentir par omission,
et sa morsure (verify:no-mute-mord) prouve qu'elle ROUGIT sur un .skip.

Capteur vivant : le grep blanc (process.exit) doit trouver > 0 — s'il trouve 0,
le fichier a bouge et le capteur est suspect ; on rougit pour le dire.

Lancement : python3 scripts/verify-no-mute.py
"""
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIERS = ["test", "src"]

# Mutations de test vitest/playwright qui rendent un test silencieux.
MUTE = re.compile(r"\b(?:it|test|describe)(?:\.each\([^)]*\))?\s*\.\s*(skip|only|todo)\s*\(")
# Temoins qui prouvent que la grepe blanc (le meme motif que le faux positif du
# fait 13) est bien presente : sans eux, un grep qui ne matche RIEN pourrait etre
# pris pour « aucun test mute » alors qu'il est simplement casse.
BLANC = re.compile(r"process\.exit\(|sys\.exit\(|SystemExit")


def lignes_fichiers():
    for d in DOSSIERS:
        for racine, _dirs, fichiers in os.walk(os.path.join(BASE, d)):
            if "node_modules" in racine or os.sep + "tmp-" in racine or "tmp-impostor" in racine:
                continue
            for f in fichiers:
                if f.endswith((".ts", ".tsx", ".mjs", ".js", ".py")):
                    yield os.path.join(racine, f)


def main():
    mutes = []
    blanc = 0
    for path in lignes_fichiers():
        try:
            txt = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for i, ligne in enumerate(txt.splitlines(), 1):
            if MUTE.search(ligne):
                mutes.append((os.path.relpath(path, BASE), i, ligne.strip()[:90]))
            if BLANC.search(ligne):
                blanc += 1
    # Garde du capteur : le blanc DOIT etre vu, sinon on ne peut pas faire
    # confiance a « aucun mute ». (C'est exactement l'angle mort du fait 13.)
    if blanc == 0:
        print("CAPTEUR_SUSPECT — grep blanc (process.exit/sys.exit) = 0 : le capteur "
              "ne voit plus rien, il ne peut certifier « aucun mute ». Verifier DOSSIERS/extensions.")
        return 2
    if mutes:
        print("ECHEC — %d test(s) mute(s) sans raison visible (skip/only/todo) :" % len(mutes))
        for f, i, s in mutes:
            print("   %s:%d: %s" % (f, i, s))
        print("Soit reactiviter, soit laisser courir (un skip n'est pas une porte).")
        return 1
    print("OK — aucun test mute (skip/only/todo = 0) ; capteur vivant (grep blanc = %d)." % blanc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
