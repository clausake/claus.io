#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insere le journal du Sprint 9 dans PHASES.md, avant la section Sprint 8.

Le journal du depot se complete par SUBSTITUTION EXACTE verifiee, et jamais
par un editeur a flou-matching: un faux match ici ecrirait du faux dans la
memoire du projet (piege consigne dans le Sprint 8).

Le texte est lu depuis `scripts/blocks/sprint9-journal.md` — il n'est PAS un
literal de ce script, pour que la longueur du journal ne passe pas par le
poste (le poste ROGNE les emissions longues: piege consigne).
"""
import hashlib
import os
import sys

RACINE = os.path.join(os.path.expanduser("~"), "cookdrive-project")
PHASES = os.path.join(RACINE, "PHASES.md")
BLOC = os.path.join(RACINE, "scripts", "blocks", "sprint9-journal.md")
ANCRE = "## Sprint 8 - POST /api/inventory/consume"
MARQUEUR = "## Sprint 9 - Les lignes a la creation"


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def main():
    if not os.path.isfile(PHASES) or not os.path.isfile(BLOC):
        print("FICHIER MANQUANT")
        return 2
    src = open(PHASES, encoding="utf-8").read()
    avant = src.encode("utf-8")

    if MARQUEUR in src:
        print("DEJA BRANCHE (marqueur present) - rien n'est touche")
        return 0
    if src.count(ANCRE) != 1:
        print("ANCHRE NON UNIQUE (%d) - ABSTENTION" % src.count(ANCRE))
        return 3

    journal = open(BLOC, encoding="utf-8").read().strip("\n")
    sale = sorted({hex(ord(c)) for c in journal
                   if (0x2E80 <= ord(c) <= 0x9FFF) or 0xFE00 <= ord(c) <= 0xFE0F})
    if sale:
        print("CARACTERES ANORMAUX DANS LE JOURNAL:", sale)
        return 4

    nouveau = src.replace(ANCRE, journal + "\n\n" + ANCRE, 1)
    with open(PHASES, "w", encoding="utf-8") as f:
        f.write(nouveau)

    relu = open(PHASES, encoding="utf-8").read()
    apres = relu.encode("utf-8")
    if MARQUEUR not in relu:
        print("ECHEC: le marqueur n'est pas relu")
        return 5
    if not relu.startswith(src[:200]):
        print("ECHEC: l'en-tete a bouge")
        return 5

    print("PHASES.md: %d -> %d octets | sha %s -> %s"
          % (len(avant), len(apres), sha(avant), sha(apres)))
    print("JOURNAL INSERE (%d lignes)" % (journal.count("\n") + 1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
