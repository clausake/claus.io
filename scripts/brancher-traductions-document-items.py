#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ajoute les trois cles de toast du contrat de lignes aux 5 langues.

Le converi du depot (PHASES.md, « Conventions de rendu »): tout texte d'UI
passe par TRANSLATIONS et les 5 langues sont ALIGNEES sur le referentiel FR.
Mon correctif de `DocumentManager` introduit trois toasts nouveaux
(`saveFailed`, `partialDocument`, `rejectedLines`): sans les cles, le fallback
`|| "…" ` de la Vue masquerait le manque et l'application rendrait du francais
sur un ecran espagnol — un defaut que AUCUN gate numerique ne voit.

Piege consigne: un fichier accentue s'ecrit en TEXTE UTF-8 (pas en literals
d'octets \\xe9, qui sont du latin-1 et rendent le fichier illisible par tout
parseur) et se verifie par RE-DECODAGE.
"""
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAD = os.path.join(BASE, "src", "data", "translations.ts")

# L'ordre suit les anches de blocs de langues du fichier (fr, en, de, es, it),
# verife ci-dessous par le COMPTE de `validateFailed` (un par bloc).
CLES = {
    "saveFailed": {
        "fr": "Enregistrement impossible",
        "en": "Save failed",
        "de": "Speichern fehlgeschlagen",
        "es": "No se pudo guardar",
        "it": "Salvataggio impossibile",
    },
    "partialDocument": {
        "fr": "Document enregistre, mais",
        "en": "Document saved, but",
        "de": "Dokument gespeichert, aber",
        "es": "Documento guardado, pero",
        "it": "Documento salvato, ma",
    },
    "rejectedLines": {
        "fr": "ligne(s) ecartee(s)",
        "en": "line(s) discarded",
        "de": "Zeile(n) verworfen",
        "es": "linea(s) descartada(s)",
        "it": "riga/e scartat/e",
    },
}
LANGUES = ["fr", "en", "de", "es", "it"]


def main():
    with open(TRAD, encoding="utf-8") as f:
        src = f.read()
    sha_avant = hashlib.sha256(src.encode("utf-8")).hexdigest()[:16]

    decale = len(re.findall(r"^\s*validateFailed:", src, re.M))
    if decale != len(LANGUES):
        print("ANCHRE validateFailed: %d blocs vus, %d attendues — on ne devine"
              % (decale, len(LANGUES)))
        return 2

    # Deja fait?
    if 'saveFailed:' in src:
        n = src.count("saveFailed:")
        print("cles DEJA presentes (saveFailed x%d)" % n)
        if n == len(LANGUES):
            return 0
        print("  attendu %d — le fichier est dans un etat demi-fait" % len(LANGUES))
        return 3

    lignes = src.split("\n")
    hors = [(i + 1, l) for i, l in enumerate(lignes)
            if re.match(r"^\s*validateFailed:", l)]
    if len(hors) != len(LANGUES):
        print("decompte des anches divergent")
        return 2

    sortie = []
    saut = 0
    for idx, l in enumerate(lignes):
        sortie.append(l)
        if re.match(r"^\s*validateFailed:", l) is not None:
            langue = LANGUES[saut]
            retrait = re.match(r"^(\s*)", l).group(1)
            for cle in ("saveFailed", "partialDocument", "rejectedLines"):
                valeur = CLES[cle][langue]
                sortie.append('%s%s: "%s",' % (retrait, cle, valeur))
            saut += 1
    if saut != len(LANGUES):
        print("insersion faite dans %d blocs sur %d — ABSTENTION" % (saut, len(LANGUES)))
        return 4

    nouveau = "\n".join(sortie)
    # Le verrou de la lecon des octets: ce que NOUS ecrivons doit se relire et
    # ne contenir aucun caractere anormal (un CJK perdu dans du latin, un
    # literal d'octets \\xe9 rendu latin-1).
    #
    # ⚠ Le controle porte sur CE QUI EST AJOUTE, et non sur le fichier tout
    # entier: le fichier herite contient DEJA sept selecteurs de variation
    # U+FE0F (ceux du glyphe « ⚠ » des avertissements FR). Une garde qui
    # jugent l'heritage refuse un travial légitime et ne protège contre
    # l'adversaire que seule juge — un faux positif qui, a force d'etre
    # contourne, finit par faire retirer la garde.
    try:
        nouveau.encode("utf-8").decode("utf-8")
    except UnicodeDecodeError as e:
        print("ENCODAGE NON RE-DECODABLE:", e)
        return 5
    heritees = {ord(c) for c in src if ord(c) > 0x2FFF}
    anormaux = sorted({hex(ord(c)) for c in nouveau
                       if ord(c) > 0x2FFF and ord(c) not in heritees})
    if anormaux:
        print("CARACTERES ANORMAUX INTRODUTS (piege des octets): %s" % anormaux)
        return 6
    # et les lignes inserees, elles, doivent etre strictement ASCII+latin1
    for l in sortie:
        if re.match(r"^\s*(saveFailed|partialDocument|rejectedLines):", l):
            sale = sorted({hex(ord(c)) for c in l if ord(c) > 0x00FF})
            if sale:
                print("LIGNE INSEREE ANORMALE %s: %r" % (sale, l[:90]))
                return 6

    with open(TRAD, "w", encoding="utf-8") as f:
        f.write(nouveau)
    with open(TRAD, encoding="utf-8") as f:
        relu = f.read()
    if relu != nouveau:
        print("RE-LECTURE DIVERGENTE")
        return 7

    for cle in CLES:
        n = len(re.findall(r"^\s*%s:" % cle, relu, re.M))
        etat = "OK" if n == len(LANGUES) else "*** %d ***" % n
        print("  %-18s %s" % (cle, etat))
        if n != len(LANGUES):
            return 8
    print("translations.ts: %d -> %d octets | sha %s -> %s"
          % (len(src.encode("utf-8")), len(nouveau.encode("utf-8")),
             sha_avant, hashlib.sha256(nouveau.encode("utf-8")).hexdigest()[:16]))
    print("3 CLES x 5 LANGUES ALIGNEES")
    return 0


if __name__ == "__main__":
    sys.exit(main())
