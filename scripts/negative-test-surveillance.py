#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du moteur de surveillance (chantier 4) : elle prouve que
verify: surveillance peut ROUGIR.

La mutation : on retire le FILTRE de deduplication (le scan reposte les
memes cles a chaque fois) -> S7a doit rougir (deposees > 0 au deuxieme
scan). Puis RESTAURATION par git checkout (garde ARBRE_SALE).

Lancement : python3 scripts/negative-test-surveillance.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SURV = os.path.join(BASE, "src", "services", "surveillance.ts")

ANCRE = "  const vues = new Set<string>();"


def main():
    src = open(SURV, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_AMBIGUE: le filtre de dedup est vu", src.count(ANCRE), "fois.")
        return 1
    statut = subprocess.run(["git", "status", "--porcelain", "src/services/surveillance.ts"],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/services/surveillance.ts a des changements non committes:", statut)
        return 1

    # Mutation : la deduplication est NEUTRALISEE — le scan reposte les
    # memes cles a chaque fois (le Set n'est plus rempli). S7a doit rougir
    # (deposees > 0 au deuxieme scan). Syntaxiquement valide.
    lignes = src.splitlines(True)
    idx = None
    for n, l in enumerate(lignes):
        if l.strip() == ANCRE.strip():
            idx = n
            break
    if idx is None:
        print("ANCRE_ABSENTE: le Set de dedup n'est plus la.")
        return 1
    mute = "".join(lignes[:idx]) + "  const vues = new Set<string>(); // morsure: jamais rempli\n  void vues;\n" + "".join(lignes[idx + 1:])
    if mute == src:
        print("MUTATION_INOPERANTE")
        return 1

    with open(SURV, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", "verify-surveillance.mjs")],
                           capture_output=True, text=True, cwd=BASE, timeout=240)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "S7a rejouer le scan" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur la dedup morte")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if "S7" in l or "ECHEC" in l or "Error" in l:
                    print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand la deduplication est morte")
        for l in sortie.splitlines():
            if "S7" in l:
                print("   " + l)
        return 0
    finally:
        subprocess.run(["git", "checkout", "--", "src/services/surveillance.ts"], cwd=BASE)


if __name__ == "__main__":
    sys.exit(main())
