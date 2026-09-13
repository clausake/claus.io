#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare la porte POST /api/documents de l'arbre a celle de HEAD.

Existe parce qu'un second editeur a touche le fichier pendant la session (un
import que ce travail n'a pas ecrit est apparu entre deux lectures). Avant
d'ecraser quoi que ce soit, il faut SAVOIR ce qui vient de HEAD, ce qui vient
de ce sprint, et ce qui vient d'ailleurs. Le rendu du poste n'est pas une
autorite ici: seuls les compteurs et les SHA decident (piege consigne).
"""
import hashlib
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMOINS = [
    'router.post("/api/documents"',
    "prixNonExploitables",
    "jugerLignesDeDocument",
    "totalOuNul",
    "lireTexteDeLigne",
    "unit_price_brut",
    "BEGIN TRANSACTION",
    "ligne_non_ecrite",
    "document_non_relie",
    "CONTRAT LIGNES DE DOCUMENT",
    "INSERT INTO document_items",
    "UPDATE documents SET status = 'VALIDATED'",
    "colonnes.join",
]


def compter(texte):
    return {t: texte.count(t) for t in TEMOINS}


def main():
    entete = subprocess.run(
        ["git", "show", "HEAD:src/routes/documents.ts"],
        cwd=BASE, capture_output=True, text=True,
    )
    if entete.returncode != 0:
        print("git show a echoue:", entete.stderr[:300])
        return 2
    disque = os.path.join(BASE, "src", "routes", "documents.ts")
    with open(disque, encoding="utf-8") as f:
        act = f.read()
    ref = entete.stdout
    ch, ca = compter(ref), compter(act)
    print("%-42s %6s %6s" % ("TEMOIN", "HEAD", "ARBRE"))
    for t in TEMOINS:
        marque = "" if ch[t] == ca[t] else "   <- DIVERGE"
        print("%-42s %6d %6d%s" % (t[:42], ch[t], ca[t], marque))
    print()
    print("octets HEAD  %7d  sha %s"
          % (len(ref.encode("utf-8")), hashlib.sha256(ref.encode()).hexdigest()[:16]))
    print("octets ARBRE %7d  sha %s"
          % (len(act.encode("utf-8")), hashlib.sha256(act.encode()).hexdigest()[:16]))
    lignes = act.split("\n")
    dup = {}
    for i, l in enumerate(lignes, 1):
        if l.startswith("import ") or l.strip().startswith("jugerLignesDeDocument,"):
            dup.setdefault(l.strip(), []).append(i)
    print()
    print("LIGNES D'IMPORT (les doublons se voient ici, pas au rendu):")
    for l, nums in dup.items():
        if len(nums) > 1 or "document-items" in l:
            print("  %s x%s -> %s" % (l[:78], nums, "DOUBLON" if len(nums) > 1 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
