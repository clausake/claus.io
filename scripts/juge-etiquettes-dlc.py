#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La porte des etiquettes DLC/DDM multilingues (Sprint 15, taches 15+16).

Ce que le chef a rappele (et le contrat, tache 15) : la piece ALIMENTAIRE
n'est pas la facture. Une facture ne porte pas de peremption ; la DLC vit sur
les etiquettes, et les libelles sont PROPRES A CHAQUE LANGUE (mesure 25/09 :
fr « a consommer jusqu'au / de preference », de « Verbrauchen bis / Mindestens
haltbar bis », it « Da consumarsi entro », nl « Te gebruiken tot »). Une garde
qui ne connait qu'un libelle refuse en bloc ce qu'elle lit mal.

La voie jouee est CELLE DU PRODUIT, entiere :
  image (fab-etiquettes.py, scellee par sa propre fabrique)
   -> couloir du produit (couloir-juge-ocr.mjs, le VRAI moteur paddle)
   -> garde du produit (couloir-garde-dlc.mjs -> src/shared/extraction/garde-dlc.ts)
Python ne lit rien : il joue les pieces, recolle les LIGNES ATTENDUES de la
fabrique aux LIGNES LUES par le moteur (distance d'edition < 0.35, sinon la
piece est frappee LECTURE_MORTE — une garde ne peut pas juger ce que l'OCR
n'a pas rendu), et exige le VERDIT nomme. Les dates sont FIGEES sur
2026-09-25 (la mesure du 25/09) : une piece qui depend de l'horloge rougit
seule le lendemain.

Les 8 pieces et leurs verdicts ecrits ICI avant de jouer (fab-etiquettes.py) :
  fr-dlc future            -> ACCEPTE (genre dlc)
  fr-ddm passee            -> ACCEPTE (genre ddm)   <- la DDM passee est LICITE
  de-dlc future            -> ACCEPTE (genre dlc)
  de-ddm passee            -> ACCEPTE (genre ddm)
  it-dlc future            -> ACCEPTE (genre dlc)
  nl-ddm future            -> ACCEPTE (genre ddm)   <- « Te gebruiken tot » est DDM
  fr-dlc PASSEE            -> PASSEE                <- la morsure : doit refuser
  fr-dlc 31/02 (inexist.)  -> DATE_INVALIDE         <- la morsure : doit refuser

Lancement : python3 scripts/juge-etiquettes-dlc.py [moteur=paddle]
rc : 0 = les huit verdicts justes sur les huit pieces ; 1 = faute NOMMEE ;
2 = capteur mort (couloir, moteur, pieces absentes).
"""
import difflib
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANC = os.path.join(BASE, "test", "banc")
COULOIR_OCR = os.path.join(BANC, "couloir-juge-ocr.mjs")
COULOIR_DLC = os.path.join(BANC, "couloir-garde-dlc.mjs")
TSX = os.path.join(BASE, "node_modules", ".bin", "tsx")

ATTENTES = {
    "etiquette-fr-dlc":          ("ACCEPTE", "dlc"),
    "etiquette-fr-ddm":          ("ACCEPTE", "ddm"),
    "etiquette-de-dlc":          ("ACCEPTE", "dlc"),
    "etiquette-de-ddm":          ("ACCEPTE", "ddm"),
    "etiquette-it-dlc":          ("ACCEPTE", "dlc"),
    "etiquette-nl-ddm":          ("ACCEPTE", "ddm"),
    "etiquette-fr-dlc-passee":   ("PASSEE", "dlc"),
    "etiquette-fr-dlc-invalide": ("DATE_INVALIDE", "dlc"),
}
SEUIL_LECTURE = 0.35  # distance d'edition / len : au-dessus, la piece est MORTE


def jouer(cmd, stdin_text=None):
    proc = subprocess.run(cmd, cwd=BASE, input=stdin_text,
                          capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip() or f"rc={proc.returncode}")
    return json.loads(proc.stdout)


def norm(s):
    return " ".join(str(s).split()).upper()


def recolle(lues, attendues):
    """La ligne attendue est-elle RENDUE par le moteur (tollerance de
    lecture, pas de re-signification) ?"""
    fautes = []
    lues_n = [norm(l) for l in lues]
    for attendue in attendues:
        cible = norm(attendue)
        if cible == "":
            continue
        # igualite, INCLUSION (le moteur rend le libelle et la date en une
        # ligne fusionnee — mesure 27/09 sur etiquette-fr-ddm), ou distance
        # d'edition : c'est la meme regle que le juge de la facture.
        meilleur = max((max(difflib.SequenceMatcher(None, l, cible).ratio(),
                            1.0 if (cible in l or l in cible) else 0.0)
                        for l in lues_n), default=0.0)
        if meilleur < 1.0 - SEUIL_LECTURE:
            fautes.append(f"{attendue!r} rendu « ? » (meilleure ressemblance {meilleur:.2f})")
    return fautes


def main():
    moteur = sys.argv[1] if len(sys.argv) > 1 else "paddle"
    if not os.path.exists(TSX):
        print("CAPTEUR MORT : tsx introuvable — npm install ?")
        return 2
    fautes = 0
    for nom, (verdict_attendu, genre_attendu) in ATTENTES.items():
        image = os.path.join(BANC, nom + ".png")
        etat = os.path.join(BANC, nom + ".png.etat.json")
        if not (os.path.exists(image) and os.path.exists(etat)):
            print(f"CAPTEUR MORT {nom}: piece ou etat absent — python3 test/banc/fab-etiquettes.py")
            return 2
        consigne = json.load(open(etat, encoding="utf-8"))
        if consigne["verdict_attendu"] != verdict_attendu:
            print(f"CAPTEUR MORT {nom}: l'etat de la fabrique contredit la porte "
                  f"({consigne['verdict_attendu']} != {verdict_attendu})")
            return 2
        try:
            lu = jouer([TSX, COULOIR_OCR, image, moteur])
        except RuntimeError as e:
            print(f"FAUTE {nom}: lecture morte — {e}")
            fautes += 1
            continue
        lignes = lu["lignes"]
        # Seuls le LIBELLE et la DATE sont exigibles a la lecture : la ligne
        # LOT est un decor de l'image, pas un champ du contrat.
        attendues = [t for t, v in consigne["lignes"] if v] + [v for _, v in consigne["lignes"] if v]
        trous = recolle(lignes, attendues)
        if trous:
            print(f"FAUTE {nom}: LECTURE_MORTE — {trous}")
            fautes += 1
            continue
        rendu = jouer([TSX, COULOIR_DLC], json.dumps(
            {"lignes": lignes, "aujourdhui": consigne["aujourdhui"]}, ensure_ascii=False))
        ok = rendu["verdict"] == verdict_attendu and rendu["genre"] == genre_attendu
        manquant = (f" (attendu {verdict_attendu}/{genre_attendu}, rendu "
                    f"{rendu['verdict']}/{rendu['genre']})") if not ok else ""
        print(f"  {nom:<26} moteur={lu['moteur']:<8} libelle={rendu['libelle'][:28]!r:<30} "
              f"{rendu['verdict']}/{rendu['genre']}{manquant}")
        fautes += 0 if ok else 1
    if fautes:
        print(f"ROUGE: {fautes} etiquette(s) en faute")
        return 1
    print(f"GARDE DLC/DDM: les {len(ATTENTES)} etiquetes rendent leur verdict (4 langues)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
