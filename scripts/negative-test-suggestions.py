#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du contrat de la boîte de suggestions (chantier 3) : elle prouve
que verify:suggestions peut ROUGIR.

La mutation : on ouvre la liste blanche ROUTES_CIBLES de
src/routes/suggestions.ts (elle n'existe plus — un POST vers /api/users ou
n'importe quoi passerait, la boite redevient une voie de contournement de la
gate §8). La porte doit rougir sur A4c. Puis RESTAURATION par git checkout
(garde ARBRE_SALE : on refuse de muter un arbre non propre).

Lancement : python3 scripts/negative-test-suggestions.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUG = os.path.join(BASE, "src", "routes", "suggestions.ts")

ANCRE = 'if (typeof action_route !== "string" || !ROUTES_CIBLES.has(action_route)) {'


def main():
    src = open(SUG, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_AMBIGUE: la liste ROUTES_CIBLES est vue", src.count(ANCRE), "fois.")
        return 1

    statut = subprocess.run(
        ["git", "status", "--porcelain", "src/routes/suggestions.ts"],
        capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/routes/suggestions.ts a des changements non committes:",
              statut)
        return 1

    # Mutation : le CHECK de la liste blanche est NEUTRALISE a la creation —
    # une action_route inventee (/api/users...) n'est plus refusee et la
    # boite redevient une voie de contournement de la gate §8. A4c doit
    # rougir (la creation passe en 201 au lieu de 400 ROUTE_INCONNUE).
    # `if (false)` : syntaxiquement valide, sémantiquement mort.
    lignes = src.splitlines(True)
    idx = None
    for n, l in enumerate(lignes):
        # .strip() : la ligne brute porte l'indentation du bloc (6 espaces),
        # startswith sur la brute ne matcherait JAMAIS (mesure du premier run).
        if l.strip().startswith(ANCRE):
            idx = n
            break
    if idx is None:
        print("ANCRE_ABSENTE: le check ROUTES_CIBLES n'est plus la.")
        return 1
    mute = "".join(lignes[:idx]) + "      if (false) {\n" + "".join(lignes[idx + 1:])
    if mute == src:
        print("MUTATION_INOPERANTE")
        return 1

    with open(SUG, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", "verify-suggestions.mjs")],
                           capture_output=True, text=True, cwd=BASE, timeout=240)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "A4c route hors liste blanche" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur la liste blanche vide")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if "A4c" in l or "ECHEC" in l:
                    print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand la liste blanche est videe")
        for l in sortie.splitlines():
            if "A4c" in l:
                print("   " + l)
        return 0
    finally:
        subprocess.run(["git", "checkout", "--", "src/routes/suggestions.ts"], cwd=BASE)


if __name__ == "__main__":
    sys.exit(main())
