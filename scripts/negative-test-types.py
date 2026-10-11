#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure de l'hygiene TypeScript (chantier 7) : elle prouve que
verify:types peut ROUGIR.

La mutation : reintroduire un `: any` dans src/services/audit.ts -> le
compteur rougit. Puis RESTAURATION PROUVEE (lecon chantier 4).

Lancement : python3 scripts/negative-test-types.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT = os.path.join(BASE, "src", "services", "audit.ts")

ANCRE = "export interface AuditEntry {"
MUTATION = "const morsureAny: any = null; // morsure: un :any reintroduit\n" + ANCRE


def main():
    src = open(AUDIT, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_AMBIGUE: AuditEntry vu", src.count(ANCRE), "fois.")
        return 1
    statut = subprocess.run(["git", "status", "--porcelain", "src/services/audit.ts"],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/services/audit.ts a des changements non committes:", statut)
        return 1

    mute = src.replace(ANCRE, MUTATION, 1)
    if mute == src:
        print("MUTATION_INOPERANTE")
        return 1

    with open(AUDIT, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["python3", os.path.join(BASE, "scripts", "verify-types.py")],
                           capture_output=True, text=True, cwd=BASE, timeout=60)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "ANY_BACKEND=1" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur le :any reintroduit")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand un :any revient")
        for l in sortie.splitlines():
            if "audit.ts" in l:
                print("   " + l)
        return 0
    finally:
        subprocess.run(["git", "checkout", "--", "src/services/audit.ts"], cwd=BASE)
        reste = subprocess.run(["git", "status", "--porcelain", "src/services/audit.ts"],
                               capture_output=True, text=True, cwd=BASE).stdout.strip()
        if reste:
            blob = subprocess.run(["git", "show", "HEAD:src/services/audit.ts"],
                                  capture_output=True, text=True, cwd=BASE).stdout
            with open(AUDIT, "w", encoding="utf-8") as f:
                f.write(blob)
            reste2 = subprocess.run(["git", "status", "--porcelain", "src/services/audit.ts"],
                                    capture_output=True, text=True, cwd=BASE).stdout.strip()
            if reste2:
                print("RESTAURATION_IMPOSSIBLE: le fichier differe encore de HEAD.")
                sys.exit(9)


if __name__ == "__main__":
    sys.exit(main())
