#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Substitue le corps de POST /api/documents par le contrat de lignes.

Le bloc JS n'est PAS un litéral de ce script: il vit dans
`scripts/blocks/documents-post.block.txt` et n'est ICIs que SPICE. POURQUOI:
le rendu de ce poste rogne une emission longue (piege consigne dans
PHASES.md), et un bloc de 200 lignes noyé dans du Python produit un fichier
qui compile sans ressembler a rien. Séparer le texte du geste rend chacun
verifiable separement (le bloc est verife par ses propres compteurs, le
spice par ses anchres + SHA).

Le script refuse de patcher deux fois (garde), refuse une anchre ambigue,
refuse une zone qui contiendroit la route de validation, et re-lit le fichier
par SHA apres ecriture.
"""
import hashlib
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTE = os.path.join(BASE, "src", "routes", "documents.ts")
BLOC = os.path.join(BASE, "scripts", "blocks", "documents-post.block.txt")

ANCHOR_A = 'router.post("/api/documents", async (req, res) => {'
ANCHOR_B = 'router.post("/api/documents/:id/validate"'
GUARD = "CONTRAT LIGNES DE DOCUMENT"

# Ce que le bloc rendu DOIT contenir, et combien de fois au minimum. Un compte
# trop bas = emission rognee = on s'arrete, on n'ecrit pas un fichier estropie.
ATTENDU = [
    ("router.post(", 1),
    ("res.status(400)", 2),
    ("res.json(", 1),
    ("BEGIN TRANSACTION", 1),
    ('"COMMIT"', 1),
    ('"ROLLBACK"', 1),
    ("jugerLignesDeDocument", 1),
    ("unit_price_brut", 3),
    ("changes !== 1", 1),
    ("rejetees", 4),
    ("refused", 2),
    ("totalOuNul", 1),
    ("lireTexteDeLigne", 4),
    ("document_non_relie", 1),
    ("ligne_non_ecrite", 1),
]


def lire_chemin(chemin: str) -> str:
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def verifier_bloc(bloc: str) -> int:
    fautifs = []
    for cle, mini in ATTENDU:
        n = bloc.count(cle)
        if n < mini:
            fautifs.append("%s=%d<%d" % (cle, n, mini))
    if fautifs:
        print("BLOC FAILLI: " + ", ".join(fautifs))
        return 3
    if len(bloc.encode("utf-8")) < 4000:
        print("BLOC TROP COURT: %d octets" % len(bloc.encode("utf-8")))
        return 3
    # Un bloc qui ne se relit pas en UTF-8 est une faute de frappe (piege des
    # literals d'octets \xe9 consignee au Sprint 4).
    bloc.encode("utf-8").decode("utf-8")
    return 0


def main() -> int:
    if not os.path.isfile(BLOC):
        print("BLOC ABSENT: %s" % BLOC)
        return 2
    bloc = lire_chemin(BLOC).rstrip("\n") + "\n"
    code = verifier_bloc(bloc)
    if code:
        return code

    src = lire_chemin(ROUTE)
    avant = hashlib.sha256(src.encode("utf-8")).hexdigest()
    if GUARD in src:
        print("DEJA PATCH (garde present) - rien n'est fait.")
        return 0
    na = src.count(ANCHOR_A)
    nb = src.count(ANCHOR_B)
    if na != 1 or nb != 1:
        print("ANCHRE ambigues: A=%d B=%d" % (na, nb))
        return 4
    i = src.index(ANCHOR_A)
    j = src.index(ANCHOR_B)
    if not (i < j):
        print("ANCHRE hors ordre")
        return 4
    zone = src[i:j]
    for temoin in ("INSERT INTO document_items", "Failed to save document"):
        if temoin not in zone:
            print("ZONE SUSPECTE: %r absent de l'intervalle" % temoin)
            return 5
    if "VALIDATED" in zone:
        print("ZONE SUSPECTE: la route de validation est dans l'intervalle")
        return 5

    nouveau = src[:i] + bloc + src[j:]
    with open(ROUTE, "w", encoding="utf-8") as f:
        f.write(nouveau)
    avec = hashlib.sha256(nouveau.encode("utf-8")).hexdigest()
    relu = lire_chemin(ROUTE)
    if hashlib.sha256(relu.encode("utf-8")).hexdigest() != avec:
        print("RE-LECTURE DIVERGENTE")
        return 6
    if GUARD not in relu:
        print("CONTENU ABSENT APRES ECRITURE")
        return 6
    n_avant = len(src.encode("utf-8"))
    n_apres = len(nouveau.encode("utf-8"))
    print("octets %d -> %d" % (n_avant, n_apres))
    print("sha %s -> %s" % (avant[:16], avec[:16]))
    print("PATCH JOUE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
