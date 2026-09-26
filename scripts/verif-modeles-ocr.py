#!/usr/bin/env python3
# Verifie les poids OCR embarques contre l'ancre exterieure (Sprint 15, tache 7).
#
# L'ancre est scripts/modeles-ocr.manifest.json (sha256 + tailles mesurees au
# contrat). Les poids eux-memes NE SONT PAS sous git (12,8 Mo : la lourdeur que
# le contrat refuse) — ils sont telecharges une fois hors depot et controles
# ICI par empreinte. C'est la regle des trois conditions du journal scelle :
# le juge (le manifeste) vit hors de la chose jugee (les poids).
#
# Le script ne peut pas rendre du vide en silence : chaque verdict est nomme,
# le total est COMPTE (increment a chaque controle), jamais ecrit.
import hashlib
import json
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFESTE = os.path.join(RACINE, "scripts", "modeles-ocr.manifest.json")
DOSSIER = os.path.join(RACINE, "resources", "ocr", "modeles")
if len(sys.argv) > 1:
    DOSSIER = sys.argv[1]  # la voie de MORSURE : juger un dossier temoin
if len(sys.argv) > 2:
    MANIFESTE = sys.argv[2]  # la voie de MORSURE du capteur : juger un manifeste temoin


def sha256_de(chemin):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def main():
    if not os.path.isfile(MANIFESTE):
        print("FAUTE: manifeste absent:", MANIFESTE)
        return 2
    with open(MANIFESTE, encoding="utf-8") as f:
        manifeste = json.load(f)
    entrees = manifeste.get("fichiers")
    if not isinstance(entrees, list) or len(entrees) == 0:
        print("FAUTE: manifeste sans entrees (capteur mort, pas une absence)")
        return 2

    conformes = 0
    fautes = []
    for e in entrees:
        nom, attendu = e["nom"], e["sha256"]
        chemin = os.path.join(DOSSIER, nom)
        if not os.path.isfile(chemin):
            fautes.append("%s ABSENT (%s)" % (nom, chemin))
            continue
        taille = os.path.getsize(chemin)
        if taille != e["octets"]:
            fautes.append("%s TAILLE %d != %d" % (nom, taille, e["octets"]))
            continue
        if sha256_de(chemin) != attendu:
            fautes.append("%s SHA256 DIFFERENT de l'ancre" % nom)
            continue
        conformes += 1

    print("MODELES: %d/%d CONFORMES" % (conformes, len(entrees)))
    for fa in fautes:
        print("FAUTE:", fa)
    return 0 if conformes == len(entrees) and not fautes else 1


if __name__ == "__main__":
    sys.exit(main())
