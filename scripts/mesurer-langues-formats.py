#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La porte des formats par langue (Sprint 15, Tache 16).

Trois clauses du contrat, jouées ICI (les modules tsx sont LE produit ; ce
Python ne fait que juger la sortie du couloir, jamais relire les sources) :
  (a) la matrice locale → script OCR ne promet que les QUATRE scripts prouvés
      (latin/cyrillic/arabic/devanagari, mesure 25/09 par curl AVEC suivi des
      redirections) ; toute autre locale à script inconnu doit REFUSER ;
  (b) CHAQUE locale declaree lit les nombres/dates/mots-cles de la piece du
      banc selon SA regle (419,60 fr = 419.6 ; 1.234,56 de = 1234.56 ;
      1,234.56 us = 1234.56 — le separateur est le multiplicateur du prix) ;
  (c) clause de MORSURE : une valeur structurellement ambiguë ("1.234" sans
      locale, "05/09/2026" licite deux fois) qui rend une VALEUR au lieu de
      null fait ROUGIR la porte et est NOMMEE.

Lancement : python3 scripts/mesurer-langues-formats.py
Le code de sortie EST le verdict : 0 vert, 1 faute nommee, 2 capteur mort.
"""
import json
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COULOIR = os.path.join(BASE, "test", "banc", "couloir-i18n.mjs")

# (brut, locale, verdict attendu, valeur attendue) — mesures du 25/09.
NOMBRES = [
    ("419,60", "fr-FR", "VALEUR", 419.6),
    ("1.234,56", "de-DE", "VALEUR", 1234.56),
    ("1,234.56", "en-US", "VALEUR", 1234.56),
    ("419.60", "fr-FR", "FORME_REFUSEE", None),
    ("1,234.56", "fr-FR", "FORME_REFUSEE", None),
    ("41,96", "fr-FR", "VALEUR", 41.96),
    ("41.96", "en-GB", "VALEUR", 41.96),
    ("1.234", None, "SEPARATEUR_AMBIGU", None),   # clause (c) : JAMAIS 1234 ni 1.234
    ("419,60", None, "LOCALE_REQUISE", None),
]
DATES = [
    ("05/09/2026", "fr-FR", "DATE_AMBIGUE", None),  # clause (c) : null + les deux
    ("25/12/2026", "fr-FR", "VALEUR", "2026-12-25"),
    ("12/25/2026", "en-US", "VALEUR", "2026-12-25"),
    ("31/02/2026", "fr-FR", "DATE_INVALIDE", None),
    ("05/09/2026", None, "LOCALE_REQUISE", None),
]
MOTS_CLES = [
    ("TVA 10,0 % 41,96", "fr-FR", "tva", True),
    ("IVA 22% 9,13", "it-IT", "tva", True),
    ("BTW 21% 8,74", "nl-NL", "tva", True),
    ("MwSt. 19% 7,94", "de-DE", "tva", True),
    ("BTW 21% 8,74", "fr-FR", "tva", False),        # hors langue : refuse
    ("TOTAL TTC 461,56", None, "total_ttc", False),  # sans declaration : rien ne joue
]
SCRIPTS_PROUVES = {"latin", "cyrillic", "arabic", "devanagari"}


def jouer():
    if not os.path.exists(COULOIR):
        print("COULOIR INTROUVABLE :", COULOIR)
        return None
    npx = shutil.which("npx")
    if npx is None:
        print("npx introuvable — capteur mort.")
        return None
    proc = subprocess.run(
        [npx, "tsx", COULOIR],
        input=json.dumps({"nombres": [[b, l] for b, l, _, _ in NOMBRES],
                          "dates": [[b, l] for b, l, _, _ in DATES],
                          "motsCles": [[l, lo, c] for l, lo, c, _ in MOTS_CLES]},
                         ensure_ascii=False),
        cwd=BASE, capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        print("LE COULOIR EST MORT (rc=%d) :" % proc.returncode)
        print(proc.stderr[-2000:])
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print("LE COULOIR REND DU NON-JSON (piege consigne) :", e)
        return None


def main():
    sortie = jouer()
    if sortie is None:
        return 2
    fautes = 0
    print("=" * 74)
    print("(a) LA MATRICE : seuls les scripts PROUVÉS (mesure 25/09) sont promesses")
    promesses = {(l["code"]): l for l in sortie.get("locales", [])}
    for code, l in sorted(promesses.items()):
        hors = l["script_ocr"] not in SCRIPTS_PROUVES
        if hors and l["script_prouve"]:
            print(f"  {code:<6} script {l['script_ocr']} NON PROUVE et marque garanti : FAUTE")
            fautes += 1
        if not hors and not l["script_prouve"]:
            print(f"  {code:<6} script {l['script_ocr']} proûve mais refuse : FAUTE")
            fautes += 1
    if any(l["script_ocr"] == "inconnu" and l["script_prouve"] for l in sortie.get("locales", [])):
        print("  <<< un script 'inconnu' se dit prouvé : remplacement silencieux.")
        fautes += 1
    if not fautes:
        print("  ok : les seules promesses sont latin/cyrillic/arabic/devanagari.")

    print("=" * 74)
    print("(b) CHAQUE locale lit la piece selon SA regle (le separateur MULTIPLIE)")
    for i, (brut, locale, attendu, valeur) in enumerate(NOMBRES):
        rendu = sortie["nombres"][i]
        ok = rendu["verdict"] == attendu and (
            attendu != "VALEUR" or rendu.get("valeur") == valeur)
        if attendu == "SEPARATEUR_AMBIGU":
            lus = sorted(rendu.get("lectures") or [])
            ok = ok and rendu.get("valeur") is None and 1.234 in lus and 1234.0 in lus
        if attendu != "VALEUR":
            ok = ok and rendu.get("valeur") is None
        print(f"  {brut:<10} [{str(locale):<6}] -> {rendu['verdict']:<17} "
              f"{rendu.get('valeur') if rendu.get('valeur') is not None else 'null'}   "
              f"{'OK' if ok else f'<<< attendu {attendu} / {valeur}'}")
        fautes += 0 if ok else 1
    for i, (brut, locale, attendu, valeur) in enumerate(DATES):
        rendu = sortie["dates"][i]
        ok = rendu["verdict"] == attendu and (
            attendu != "VALEUR" or rendu.get("iso") == valeur)
        if attendu == "DATE_AMBIGUE":
            ok = ok and rendu.get("iso") is None and sorted(rendu.get("lectures") or []) == \
                ["2026-05-09", "2026-09-05"]
        if attendu != "VALEUR":
            ok = ok and rendu.get("iso") is None
        print(f"  {brut:<10} [{str(locale):<6}] -> {rendu['verdict']:<17} "
              f"{rendu.get('iso') if rendu.get('iso') is not None else 'null'}   "
              f"{'OK' if ok else f'<<< attendu {attendu} / {valeur}'}")
        fautes += 0 if ok else 1
    for i, (ligne, locale, champ, attendu) in enumerate(MOTS_CLES):
        rendu = sortie["motsCles"][i]
        ok = rendu["joue"] == attendu
        print(f"  {ligne:<20} [{str(locale):<6}] {champ:<9} joue={rendu['joue']}   "
              f"{'OK' if ok else f'<<< attendu joue={attendu}'}")
        fautes += 0 if ok else 1

    print("=" * 74)
    if fautes:
        print(f"VERDICT : {fautes} FAUTE(S) — la locale ne gouverne pas les formats.")
        return 1
    print("VERDICT : la locale est DECLAREE et gouverne nombre, date, mots-cles.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
