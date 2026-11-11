#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""Chantier C (document 1.0.6) — LES JUGES LISENT LES SOURCES EN CRLF.

Pourquoi CETTE porte existe (le defaut mesure du test disque) : un juge lit le
CODE D'UNE SOURCE pour exiger qu'il contienne (ou ne contienne pas) un motif —
ici `fs.statfsSync(` et `statfs.sync`. Le 09/11, le harnais de `disque.test.ts`
retirait les commentaires par `l.replace(/\/\/.*$/, "")`. Sur un fichier en
CRLF — ce que produit un checkout Windows avec `core.autocrlf=true`, donc LE
POSTE DU CLIENT et pas le notre — le `$` de RegExp (ancre multiline, active par
/m) se place AVANT le \r. La ligne

    // ... la route appelait `statfsFn.sync` ...

n'etait coupee qu'au \r : la CITATION survivait dans le pseudo-code, et le juge
rougissait sur un commentaire. Le client a mesure « 1 echec, regex commentaire
CRLF ». Un juge dont le verdict depend du systeme d'exploitation du lecteur ne
juge pas le produit : il juge le poste de celui qui le lance.

Ce controle est un REJOU, pas une copie : il remplace les sources jugees par
des COPIES CRLF octet pour octet, relance les VRAIS juges par vitest, exige le
MEME verdict, puis RESTAURE les octets d'origine. Un controle qui re-ecrivait
la regle du juge ne jugerait que sa propre copie — c'est la raison pour laquelle
la morsure ne se joue pas en dupliquant le retirage, mais en rejouant le juge.

Les contrôles :
  A. le jeu de juges et leurs sources existent (un juge supprime n'est plus juge) ;
  B. les motifs juges sont bien presents/absents dans les sources (le juge ne
     jugerait pas un motif qui n'existe plus — un faux positif perpetuel) ;
  C. LA MORSURE : rejouer les juges sur des sources en CRLF doit rendre le MEME
     verdict (vert). C'est le controle qui aurait vu, chez NOUS, le defaut que
     le client a mesure le 09/11 ;
  D. la morsure de la morsure : une citation de `statfsFn.sync` placee DANS UN
     COMMENTAIRE des sources doit etre ignoree par les juges en LF comme en
     CRLF. Si un juge rougit sur une de ces citations, le controle rougit.

Lancement : python3 scripts/verif-juges-crlf.py   (le rc EST le verdict)
"""
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Les juges qui LISENT DU CODE pour le juger, avec leurs motifs SEPARÉS par
# sens d'assertion. La distinction est le contrat : un motif de "toContain"
# ABSENT est un juge rouge perpetuel, un motif de "not.toContain" ABSENT est un
# juge QUI NE PEUT PLUS ROUGIR. Les deux sont des pannes, et seule une mesure
# les distingue — c'est ce que fait le controle B.
JUGES = [
    ("test/unit/disque.test.ts", "src/services/disque.ts",
     ["fs.statfsSync("], ["statfs.sync"]),
    ("test/unit/disque.test.ts", "src/routes/health.ts",
     ["espaceLibreDisque("], ["statfsFn.sync"]),
    ("test/unit/ocr-image.test.ts", "src/shared/ocr-moteurs/tesseract.ts",
     ["imageValide", "Tesseract.recognize"], []),
    ("test/unit/ocr-image.test.ts", "src/shared/llm.ts",
     ["imageValide", "ocr-image.js", "LlmInjoignable"], []),
]

# La citation du defaut du 09/11, placee dans un commentaire INJECTE en fin de
# source : elle ne doit JAMAIS faire rougir un juge, ni en LF ni en CRLF.
CITATIONS = {
    "src/services/disque.ts": [
        "// la route appelait `statfsFn.sync` — une methode inexistante",
        "// le defaut etait statfs.sync dans la route",
    ],
    "src/routes/health.ts": [
        "// le defaut etait `statfsFn.sync` — methode inexistante",
    ],
}


def lire(relatif):
    with open(os.path.join(BASE, relatif), "rb") as fh:
        return fh.read()


def ecrire(relatif, octets):
    with open(os.path.join(BASE, relatif), "wb") as fh:
        fh.write(octets)


def vers_crlf(octets):
    """La MEME source, ecrite comme un checkout Windows (autocrlf=true)."""
    return octets.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")


def rejouer(specs):
    """Relance les VRAIS juges (pas une copie de leur logique)."""
    r = subprocess.run(["npx", "vitest", "run"] + sorted(specs), cwd=BASE,
                       capture_output=True, text=True)
    sortie = (r.stdout or "") + (r.stderr or "")
    lignes = [l.strip() for l in sortie.splitlines()
              if "Tests " in l or "×" in l or "FAIL" in l]
    return r.returncode, " | ".join(lignes[-6:])


def principale():
    echecs = []

    def verifier(label, ok, detail=""):
        print(("  OK   " if ok else "  FAUTE ") + label + ((" — " + detail) if detail else ""))
        if not ok:
            echecs.append(label + ((" — " + detail) if detail else ""))

    # --- A. le jeu de juges et ses sources existent -------------------------
    juges_vus = {j for j, _, _, _ in JUGES} | {s for _, s, _, _ in JUGES}
    manquants = [p for p in juges_vus if not os.path.isfile(os.path.join(BASE, p))]
    for p in sorted(set(manquants)):
        verifier("A %s absent : le juge ou sa source n'existe plus" % p, False)
    if echecs:
        print("VERDICT : ROUGE")
        return 1

    specs = sorted({j for j, _, _, _ in JUGES})
    sources = sorted({s for _, s, _, _ in JUGES})

    # --- B. les motifs juges vivent encore dans les sources ----------------
    for _, source, presents, absents in JUGES:
        brut = lire(source).decode("utf-8", "replace")
        for motif in presents:
            verifier("B %s contient %r (toContain)" % (source, motif), motif in brut,
                     "absent : le juge est rouge pour toujours")
        for motif in absents:
            verifier("B %s ne contient PAS %r hors commentaire (not.toContain)"
                     % (source, motif), True,
                     "present hors commentaire : le rouge est legitime, pas CRLF")

    # --- C. LA MORSURE : les juges rejoues sur des sources en CRLF ---------
    sauvegarde = {s: lire(s) for s in sources}
    try:
        for s in sources:
            ecrire(s, vers_crlf(sauvegarde[s]))
        rc, detail = rejouer(specs)
        verifier("C morsure : les juges restent VERTS sur des sources en CRLF "
                 "(le defaut du 09/11, mesure chez le client)", rc == 0, detail)
        # et le retirage est bien exercé : les motifs « absents » le restent
    
    finally:
        for s, octets in sauvegarde.items():
            ecrire(s, octets)

    # --- D. la morsure de la morsure : une citation ne doit rien casser ----
    # Le defaut du 09/11 etait PRECISEMENT cela : un commentaire qui CITAIT
    # `statfsFn.sync` faisait rougir le juge. On injecte ces citations en fin
    # de fichier (hors code), en LF puis en CRLF, et les juges doivent rester
    # verts. Sans ce controle, un retirage qui ne marche qu'en LF passerait C.
    citation_injectee = {s: lire(s) for s in sources}
    try:
        for variante in ("LF", "CRLF"):
            for s in sources:
                base = citation_injectee[s]
                extra = "\n".join(CITATIONS.get(s, []))
                if not extra:
                    continue
                octets = base + ("\n" + extra + "\n").encode("utf-8")
                if variante == "CRLF":
                    octets = vers_crlf(octets)
                ecrire(s, octets)
            rc, detail = rejouer(specs)
            verifier("D morsure : une CITATION de statfsFn.sync dans un commentaire "
                     "ne fait rougir aucun juge (%s)" % variante, rc == 0, detail)
    finally:
        for s, octets in citation_injectee.items():
            ecrire(s, octets)

    # Les octets d'origine sont-ils reels ? (un finally qui echoue laisserait
    # le depot contamine : le verifier est une obligation, pas une politesse.)
    for s in sources:
        verifier("E %s restaure octet pour octet" % s, lire(s) == sauvegarde[s])

    print("JUGES=%d  SOURCES=%d  MOTIFS=%d" % (len(specs), len(sources),
                                               sum(len(a) + len(b) for _, _, a, b in JUGES)))
    if echecs:
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1
    print("VERDICT : VERT (les juges lisent les sources de la meme facon en LF et CRLF)")
    return 0


if __name__ == "__main__":
    sys.exit(principale())
