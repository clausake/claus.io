#!/usr/bin/env python3
# Le juge de la porte verify:ocr-modeles (Sprint 15, tache 7) — LA MORSURE.
#
# Une porte qui sort 0 que les poids existent ou non ne juge rien (la regle
# des portes du depot : « wire it only once it can fail »). Ce juge joue le
# verificateur CONTRE des dossiers temoins dont le verdict est ecrit d'avance :
#   1. le dossier reel            -> rc 0  (3/3 conformes)
#   2. un poids absent            -> rc 1
#   3. une taille alteree         -> rc 1
#   4. une empreinte alteree      -> rc 1  (un octet change dans rec.onnx,
#                                           taille re-restituee a l'identique)
# et un cinquieme cas qui tue le capteur lui-meme :
#   5. manifeste vide             -> rc 2  (le juge muet est une FAUTE, pas un 0).
#
# Le script est joue par import (subprocess), jamais reimplemente : c'est
# exactement la commande de la porte qui est rejouee, pas une copie.
import json
import os
import shutil
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VERIF = os.path.join(RACINE, "scripts", "verif-modeles-ocr.py")
POIDS = os.path.join(RACINE, "resources", "ocr", "modeles")
MANIFESTE = os.path.join(RACINE, "scripts", "modeles-ocr.manifest.json")
TEMP = os.path.join(RACINE, ".hermes", "juge-modeles-ocr")


CASES = [0]  # le total rendu est COMPTE a chaque jeu, jamais ecrit


def jouer(dossier, manifeste=None):
    argv = [sys.executable, VERIF, dossier] + ([manifeste] if manifeste else [])
    r = subprocess.run(argv, capture_output=True, text=True)
    CASES[0] += 1
    return r.returncode, r.stdout


def temoin(nom):
    d = os.path.join(TEMP, nom)
    if os.path.isdir(d):
        shutil.rmtree(d)
    shutil.copytree(POIDS, d)
    return d


def main():
    if not os.path.isdir(POIDS):
        print("FAUTE: les poids reels sont absents — rien a juger:", POIDS)
        return 1
    os.makedirs(TEMP, exist_ok=True)
    echecs = []

    # 1. la voie nominale : le dossier reel doit rendre 0.
    rc, out = jouer(POIDS)
    if rc != 0 or "3/3 CONFORMES" not in out:
        echecs.append("nominal attend rc=0 et 3/3, rendu rc=%d %r" % (rc, out))

    # 2. poids absent.
    d = temoin("absent")
    os.remove(os.path.join(d, "det.onnx"))
    rc, out = jouer(d)
    if rc == 0 or "det.onnx ABSENT" not in out:
        echecs.append("morsure-absent attend rc!=0 + faute nommee, rendu rc=%d %r" % (rc, out))

    # 3. taille alteree.
    d = temoin("taille")
    with open(os.path.join(d, "dict.txt"), "ab") as f:
        f.write(b"\n")
    rc, out = jouer(d)
    if rc == 0 or "TAILLE" not in out:
        echecs.append("morsure-taille attend rc!=0 + faute TAILLE, rendu rc=%d %r" % (rc, out))

    # 4. empreinte alteree A TAILLE EGALE (le cas que la taille seule ne voit pas).
    d = temoin("empreinte")
    chemin = os.path.join(d, "rec.onnx")
    with open(chemin, "rb") as f:
        octets = bytearray(f.read())
    octets[len(octets) // 2] ^= 0x01
    with open(chemin, "wb") as f:
        f.write(octets)
    if os.path.getsize(chemin) != 8066518:
        echecs.append("morsure-invalidee: la taille a bouge, l'injection est mauvaise")
    rc, out = jouer(d)
    if rc == 0 or "SHA256" not in out:
        echecs.append("morsure-empreinte attend rc!=0 + faute SHA256, rendu rc=%d %r" % (rc, out))

    # 5. le capteur muet : un manifeste SANS entrees doit rougir rc=2 (la
    #    decharge du capteur), jamais sortir 0 en silence.
    manifeste_faux = os.path.join(TEMP, "manifeste-muet.json")
    with open(manifeste_faux, "w", encoding="utf-8") as f:
        json.dump({"fichiers": []}, f)
    rc_muet, out_muet = jouer(POIDS, manifeste_faux)
    if rc_muet != 2:
        echecs.append("manifeste muet attend rc=2, rendu rc=%d %r" % (rc_muet, out_muet))

    shutil.rmtree(TEMP, ignore_errors=True)
    if echecs:
        for e in echecs:
            print("FAUTE:", e)
        print("MORSURE: %d echelee(s)" % len(echecs))
        return 1
    print("MORSURE: %d/%d cas juges, fautes injectees bien rougies + nominal vert"
          % (CASES[0], CASES[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
