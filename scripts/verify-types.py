#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Porte de l'hygiene TypeScript (chantier 7) : elle juge le COMPTEUR
d'`:any` du BACKEND (src/routes/, src/services/, src/middleware/, src/db/,
src/shared/) — le metier jugeable, pas les composants UI.

POURQUOI UN COMPTEUR ET PAS `tsc --strict`. Le strict est le but, mais le
retourner d'un coup sur 3500 lignes d'UI casse le build sans que personne ne
puisse relire. La porte juge le PAS: le seuil est FIGE au niveau atteint
(0 au backend pour le chantier 7) et NE PEUT QU'ETRE REABaisse par un commit
qui l'accompagne — une regression remonte un rouge, jamais un silence.

La regle du depot (regle 1 d'AGENTS.md) : un chiffre n'est pas enonce sans
la commande qui le produit. Ici la commande EST la porte.

Lancement : python3 scripts/verify-types.py
"""
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIERS = ["src/routes", "src/services", "src/middleware", "src/db", "src/shared"]
SEUIL = 0  # chantier 7: 0 :any reel au backend (les commentaires ne comptent pas)


def compte_any():
    """Le nombre de `: any` / `as any` REELS (hors commentaires et chaines).
    Un match dans un COMMENTAIRE ne compte pas — sinon la porte se juge sur
    la doc, pas sur le code (la faute mesuree au premier run: le commentaire
    « cast cible, pas any » de health.ts faisait 1)."""
    total = 0
    fichiers = []
    for d in DOSSIERS:
        base = os.path.join(BASE, d)
        for racine, _dirs, noms in os.walk(base):
            for n in noms:
                if n.endswith(".ts") and not n.endswith(".d.ts"):
                    fichiers.append(os.path.join(racine, n))
    for f in sorted(fichiers):
        src = open(f, encoding="utf-8").read()
        # retirer les commentaires de ligne (// ...) et de bloc (/* ... */)
        sans_bloc = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
        sans_ligne = "\n".join(l.split("//", 1)[0] for l in sans_bloc.split("\n"))
        c = len(re.findall(r":\s*any\b", sans_ligne)) + len(re.findall(r"\bas\s+any\b", sans_ligne))
        if c > 0:
            total += c
            print("  %s: %d" % (os.path.relpath(f, BASE), c))
    return total, len(fichiers)


def main():
    total, n_fichiers = compte_any()
    print("ANY_BACKEND=%d FICHIERS=%d SEUIL=%d" % (total, n_fichiers, SEUIL))
    if total > SEUIL:
        print("ECHEC  %d :any reel(s) au backend (seuil %d) — les typer, pas abaisser le seuil." % (total, SEUIL))
        return 1
    print("CONTRAT TYPES: 0 :any reel au backend (seuil %d)" % SEUIL)
    return 0


if __name__ == "__main__":
    sys.exit(main())
