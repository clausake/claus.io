#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du contrat de la boîte de suggestions (chantier 3) : elle prouve
que verify:suggestions peut ROUGIR.

La mutation : on ouvre la liste blanche ROUTES_CIBLES de
src/routes/suggestions.ts (elle n'existe plus — un POST vers /api/unlock ou
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

ANCRE = "const ROUTES_CIBLES = new Set(["


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

    # Mutation : la liste blanche vide -> une route inventee n'est plus refusee.
    # Le sed par lignes : on retire TOUTES les routes (lignes suivantes jusqu'a ]).
    lignes = src.splitlines(True)
    i = lignes.index(ANCRE + "\n") if (ANCRE + "\n") in lignes else -1
    if i < 0:
        # la declaration tient sur la ligne seule
        print("ANCRE_ABSENTE: forme inattendue de ROUTES_CIBLES.")
        return 1
    j = i
    while j < len(lignes) and "]" not in lignes[j]:
        j += 1
    mute = "".join(lignes[:i + 1]) + "]);\n" + "".join(lignes[j + 1:])
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
