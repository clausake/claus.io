#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure de la barriere « aucun test muet » (verify:no-mute).

Prouve que la barriere PEUT ROUGIR sur un skip, SANS jamais toucher l'arbre de
travail ni un test reel. Technique du depot : creer un fichier dans un dossier
exclu du capteur (test/tmp-*), lancer la barriere, exiger ECHEC, puis supprimer.

  M1 VERT : un fichier sans skip -> la barriere rend rc=0.
  M2 ROUGE : un fichier avec un it.skip(...) factice -> la barriere DOIT rendre
     rc!=0 et NOMMER le fichier et la ligne.
  M3 restauration : le fichier est supprime, la barriere redevient rc=0 (prouve
     que ce qui rougissait, c'etait BIEN le fichier injecte).

Lancement : python3 scripts/verify-no-mute-mord.py
"""
import os
import shutil
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTE = os.path.join(BASE, "scripts", "verify-no-mute.py")
# Zone d'injection : SOUS test/ mais PAS tmp-* (les tmp-* sont exclus du scan par
# la barriere ; y injecter ne prouverait rien, M2 ne pourrait pas rougir — c'est
# le bug rencontre a la premiere morsure). Le nom est nettoye par le finally et
# ne porte aucun motif de test. Les fichiers .ts/.mjs de cette zone sont scannes.
ZONE = os.path.join(BASE, "test", ".morsure-no-mute")


def ecrire(nom, corps):
    chemin = os.path.join(ZONE, nom)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(corps)
    return chemin


def lancer():
    return subprocess.run(
        ["python3", PORTE], cwd=BASE, capture_output=True, text=True
    )


def main():
    fail = 0
    os.makedirs(ZONE, exist_ok=True)
    try:
        # Le temoin process.exit garde le capteur vivant dans chaque scenario
        # (sinon M1/M3 rougiraient pour « capteur suspect », pas pour le bon motif).
        blanc = "// temoin capteur vivant\nconsole.log(1); process.exit(0);\n"

        # M1 : aucun skip -> vert.
        ecrire("propre.mjs", blanc)
        r1 = lancer()
        if r1.returncode != 0:
            print("M1 ECHEC — un fichier sans skip rougit la barriere :\n   " + r1.stdout.strip())
            fail += 1
        else:
            print("M1 OK — fichier sans skip = vert.")

        # M2 : un it.skip(...) factice -> doit rougir ET nommer.
        ecrire("factice.mjs",
               blanc + "\nimport { it } from 'vitest';\nit.skip('factice — prouve la morsure', () => {});\n")
        r2 = lancer()
        if r2.returncode == 0:
            print("M2 ECHEC — un it.skip factice ne rougit PAS la barriere (barriere muette).")
            fail += 1
        elif "factice.mjs" not in r2.stdout:
            print("M2 ECHEC — la barriere rougit mais ne NOMME pas le fichier fautif :\n   " + r2.stdout.strip())
            fail += 1
        else:
            print("M2 OK — it.skip factice rougit la barriere et le fautif est nomme.")

        # M3 : on retire le factice -> vert (ce qui rougissait etait bien l'injection).
        os.remove(os.path.join(ZONE, "factice.mjs"))
        r3 = lancer()
        if r3.returncode != 0:
            print("M3 ECHEC — apres retrait du factice la barriere reste rouge (fausse piste) :\n   " + r3.stdout.strip())
            fail += 1
        else:
            print("M3 OK — retrait du factice = retour au vert.")
    finally:
        shutil.rmtree(ZONE, ignore_errors=True)

    if fail:
        print("MORSURE: %d ECHEC(S)" % fail)
        return 1
    print("MORSURE: TOUT PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
