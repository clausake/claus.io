#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsures des deux modes (chantier 6) : elles prouvent que verify:mode-*
peuvent ROUGIR.

  M1  mode-manuel : on retire le garde MODE_SANS_AGENT de la route
      suggestions (l'env ne ferme plus la boite) -> M1 doit rougir.
  M2  mode-agent  : on retire l'exemption §8 de la gate (l'agent ne peut
      plus PROPOSER) -> A1a doit rougir.

Chaque morsure mute, juge, puis RESTAURE par git checkout (garde
ARBRE_SALE : refuse de muter un arbre non propre).

Lancement : python3 scripts/negative-test-modes.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUG = os.path.join(BASE, "src", "routes", "suggestions.ts")
AUTH = os.path.join(BASE, "src", "middleware", "auth.ts")

GARDE_MODE = '      if (agentCoupe) {'
EXEMPTION = 'const agentAutorise ='


def arbre_propre(fichier):
    statut = subprocess.run(["git", "status", "--porcelain", fichier],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    return statut == ""


def muter_et_juger(fichier, avant, apres, label_attendu, porte):
    src = open(fichier, encoding="utf-8").read()
    if avant not in src:
        print(f"ANCRE_ABSENTE ({os.path.basename(fichier)}): {label_attendu}")
        return 1
    if src.count(avant) != 1:
        print(f"ANCRE_AMBIGUE ({os.path.basename(fichier)}): vue {src.count(avant)} fois.")
        return 1
    mute = src.replace(avant, apres, 1)
    if mute == src:
        print(f"MUTATION_INOPERANTE ({label_attendu})")
        return 1
    if not arbre_propre(fichier):
        print(f"ARBRE_SALE: {fichier} a des changements non committes.")
        return 1
    with open(fichier, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", porte)],
                           capture_output=True, text=True, cwd=BASE, timeout=240)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and label_attendu in sortie
        if not rouge:
            print(f"MORSURE_MORTE ({label_attendu}): la porte n'a PAS rougi")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if label_attendu.split()[0] in l or "ECHEC" in l:
                    print("   " + l)
            return 1
        print(f"MORSURE OK  {label_attendu} rougit")
        for l in sortie.splitlines():
            if label_attendu in l:
                print("   " + l)
        return 0
    finally:
        subprocess.run(["git", "checkout", "--", fichier], cwd=BASE)


def main():
    # M1 : le garde MODE_SANS_AGENT neutralise -> la boite reste ouverte
    # dans le mode sans agent -> M1 rougit (200 au lieu de 404).
    rc1 = muter_et_juger(
        SUG,
        GARDE_MODE,
        "      if (false) { // morsure: garde mode neutralise",
        "M1 POST /api/suggestions -> 404 MODE_SANS_AGENT",
        "verify-mode-manuel.mjs",
    )
    if rc1 != 0:
        return rc1

    # M2 : l'exemption §8 neutralisee -> l'agent ne peut plus PROPOSER
    # (la gate le refuse AVANT la route) -> A1a rougit.
    rc2 = muter_et_juger(
        AUTH,
        EXEMPTION,
        "const agentAutorise = false && // morsure: exemption §8 morte",
        "A1a suggestion 1 (agent) -> 201",
        "verify-mode-agent.mjs",
    )
    if rc2 != 0:
        return rc2
    return 0


if __name__ == "__main__":
    sys.exit(main())
