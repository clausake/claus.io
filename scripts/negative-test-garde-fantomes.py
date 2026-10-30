#!/usr/bin/env python3
"""La MORSURE de verify:garde-fantomes.

Réintroduit le défaut d'origine (le garde qui tue sur `cookdrive-project`,
l'ancien nom du dépôt) dans une COPIE isolée et exige que la porte ROUGISSE.
Sans cette preuve, la porte pourrait être verte parce qu'elle ne regarde rien.

Lancement : python3 scripts/negative-test-garde-fantomes.py
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTE = os.path.join(BASE, "scripts", "verify-garde-fantomes.py")
VIVANT = ".clausio/claus.io"
DEFUNT = "cookdrive-project"


def rejouer():
    r = subprocess.run([sys.executable, PORTE], cwd=BASE, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    # la porte se lit ELLE-MÊME dans BASE : on mute les sept juges en place, on
    # juge, on remet. Toute erreur laisse la remise en place (finally).
    cibles = [os.path.join(BASE, "scripts", n + ".mjs") for n in (
        "verify-auth", "verify-audit", "verify-hermes", "verify-mode-agent",
        "verify-mode-manuel", "verify-suggestions", "verify-surveillance")]
    originaux = {}
    try:
        for c in cibles:
            p = c
            originaux[p] = open(p, encoding="utf-8").read()
        rc, out = rejouer()
        if rc != 0:
            print("MORSURE_INJUSTE : la porte est rouge avant toute mutation")
            print(out)
            return 1
        for p in cibles:
            mute = originaux[p].replace('"%s"' % VIVANT, '"%s"' % DEFUNT)
            if mute == originaux[p]:
                print("MORSURE_INJUSTE : %s ne contient pas le motif vivant, rien à muter" % p)
                return 1
            open(p, "w", encoding="utf-8").write(mute)
        rc, out = rejouer()
        print("  mutation garde -> `%s` : %s" % (DEFUNT, "ROUGE (attendu)" if rc != 0 else "VERTE (porte decorative)"))
        if rc == 0:
            print(out)
            return 1
        rouges = len(re.findall(r"ROUGE ", out))
        print("NEGATIF-GARDE-FANTOMES juges=%d rouges=%d" % (len(cibles), rouges))
        if rouges != len(cibles):
            return 1
        print("VERDICT : la porte voit le garde qui ne tue rien")
        return 0
    finally:
        for p, s in originaux.items():
            open(p, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    sys.exit(main())
