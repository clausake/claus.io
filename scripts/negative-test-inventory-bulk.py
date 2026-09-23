#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative de la porte `verify:inventory-bulk` (POST /api/inventory/bulk).

Meme loi que partout dans ce depot (PHASES.md): « un PASS qui ne peut pas
devenir FAIL n'est pas une mesure ». Chaque mutation nie EXACTEMENT une ligne
qui porte une regle du contrat, dans une COPIE ISOLEE de l'arbre
(node_modules symlinke), et le harnais exige DEUX choses:
  - rc != 0            (la porte rougit),
  - ET le verdict vise NOMME dans la sortie.
Sans la seconde, une panne d'infrastructure (serveur qui ne monte pas, tsx
absent, port vole par un fils du run precedent) ferait « rougir » une mutation
qui ne mord rien: le harnais se declareroit prouve sans rien avoir juge.

Les mutations et leurs juges:
  M1 le compte-rendu de refus ne nomme plus la faute  -> B4_refuse_nomme
  M2 la clef deja prise en base n'est plus refusee    -> B7_clef_prise_409
  M3 un lot vide redevient un succes                  -> B5_lot_vide_refuse
  M4 un lot non-tableau redevient un 500              -> B6_non_tableau_refuse
  M5 le statut derive est fige a 'active'             -> B8_statut_derive
  M6 la garde de forme numerique saute (le texte
     'beaucoup' entre dans une colonne REAL)           -> B4_refuse_nomme
  M7 une ligne fautive n'empeche plus l'ecriture du
     reste du lot (l'import partial, le pire des
     imports)                                         -> B4_rien_ecrit

ANGLE MORT CONSIGNE (non mute, et la raison est dite): le 500 du `catch` final
ne peut etre atteint par aucune voie d'entree connue (tout ce qui pouvait jeter
au binding est refuse en amont par les 400). Lui imposer une mutation ne
mordroit PAS parce que la voie de commande n'existe pas, et non parce que la
garde serait inutile. Ne jamais conclure « garde inutile » sans avoir demande
quelle entree l'atteint.

Lancement: python3 scripts/negative-test-inventory-bulk.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-neginvbulk")
ROUTE = os.path.join("src", "routes", "inventory.ts")
PROBE = os.path.join("scripts", "probe-inventory-bulk.mjs")
BIG = 1024 * 1024

MUTATIONS = [
    ("M1 le refus notifie ne nomme plus la faute",
     ROUTE,
     '      for (const f of fautes) refus.push(i + ":" + f);',
     '      for (const f of fautes) refus.push(i + ":");',
     "B4_refuse_nomme"),
    ("M2 la clef deja prise en base n'est plus refusee",
     ROUTE,
     "  if (prises.length > 0) {",
     "  if (false) {",
     "B7_clef_prise_409"),
    ("M3 un lot vide redevient un succes",
     ROUTE,
     '  if (brut.length === 0) {',
     '  if (false) {',
     "B5_lot_vide_refuse"),
    # La mutation vise LE CODE DE LA GARDE, pas la garde: supprimer la garde
    # d'amont ferais remonter un TypeError hors du try de la route (le serveur
    # meurt, la porte rougit sans nommer son verdict) — ce qui n'est pas une
    # mesure, c'est une panne d'infrastructure.
    ("M4 le refus d'un lot non-tableau redevient un 500",
     ROUTE,
     '  if (!Array.isArray(brut)) {\n    return res.status(400).json({\n'
     '      status: "error",\n      message: "items doit etre un tableau",',
     '  if (!Array.isArray(brut)) {\n    return res.status(500).json({\n'
     '      status: "error",\n      message: "items doit etre un tableau",',
     "B6_non_tableau_refuse"),
    ("M5 le statut derive est fige a 'active'",
     ROUTE,
     "      statut = statutDeparse(quantite as number, minimum as number);",
     '      statut = "active";',
     "B8_statut_derive"),
    ("M6 la garde de forme numerique saute",
     ROUTE,
     '      fautes.push("quantity");',
     "      ;",
     "B4_refuse_nomme"),
    # L'ancre emporte le message du refus: `if (refus.length > 0) {` seul
    # appartiendrait aux trois routes du fichier (POST d'unite, POST en bloc,
    # PUT) et ne muterait donc pas la seule que nous voulons juger.
    ("M7 une ligne fautive n'empeche plus l'ecriture du lot",
     ROUTE,
     '  if (refus.length > 0) {\n    return res.status(400).json({\n'
     '      status: "error",\n      message: "Champs refuses: aucune ligne'
     " n'est ecrite\",",
     '  if (false) {\n    return res.status(400).json({\n'
     '      status: "error",\n      message: "Champs refuses: aucune ligne'
     " n'est ecrite\",",
     "B4_rien_ecrit"),
]


def read(rel):
    with open(os.path.join(BASE, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    p = os.path.join(WORK, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def prepare_work():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    keep = ("node_modules", "dist", "test-results", ".git", "test", "__pycache__")
    for item in os.listdir(BASE):
        if item in keep:
            continue
        s = os.path.join(BASE, item)
        d = os.path.join(WORK, item)
        if os.path.isdir(s):
            # copie recursive MANUELLE: les mots-cles a doubles soulignes sont
            # rognes par le rendu de ce poste (piege consigne) et une copie
            # muette ferait conclure a une absence de donnees.
            for dirpath, dirnames, filenames in os.walk(s):
                dirnames[:] = [x for x in dirnames
                              if x not in keep and not x.startswith(".")]
                rel = os.path.relpath(dirpath, s)
                os.makedirs(os.path.join(d, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith(".log") or fn.endswith(".pyc"):
                        continue
                    if fn.startswith("__") and fn.endswith("__"):
                        continue
                    a = os.path.join(dirpath, fn)
                    b = os.path.join(d, rel, fn)
                    if os.path.getsize(a) > BIG:
                        os.symlink(a, b)
                    else:
                        shutil.copy2(a, b)
        else:
            if os.path.getsize(s) > BIG:
                os.symlink(s, d)
            else:
                shutil.copy2(s, d)
    os.symlink(os.path.join(BASE, "node_modules"),
               os.path.join(WORK, "node_modules"))


def play():
    """Joue la porte dans la copie de travail et rend (rc, sortie)."""
    p = subprocess.run(["node", PROBE], cwd=WORK, capture_output=True,
                       text=True, timeout=180,
                       env=dict(os.environ, COOKDRIVE_NEGPASS="1"))
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def main():
    src = read(ROUTE)
    prepare_work()
    write(PROBE, read(PROBE))

    rc, out = play()
    if "GATES_BULK=" not in out:
        print("INFRASTRUCTURE: la porte ne s'est pas jouee dans la copie.")
        print(out[-700:])
        return 9
    if rc != 0:
        print("INFRASTRUCTURE: la porte est rouge AVANT toute mutation.")
        print(out[-700:])
        return 9
    print("TETE DE COURSE: porte verte sans mutation (rc=0).")

    aveugles = []
    muettes = []
    for nom, rel, anc, mot, vise in MUTATIONS:
        base = read(rel)
        n = base.count(anc)
        if n != 1:
            # Une ancre qui matche zero ou deux fois n'est PAS une mutation:
            # c'est le harnais qui ment. On ne joue pas, on nomme.
            print("ANCRE FAUSSE %s: %d occurrences attendues 1" % (nom, n))
            aveugles.append(nom)
            continue
        write(rel, base.replace(anc, mot, 1))
        try:
            rc2, out2 = play()
        finally:
            write(rel, base)
        nomme = ("VERDICT " + vise + " ROUGE") in out2
        if rc2 == 0:
            print("NE MORD PAS %s: la porte reste verte avec la mutation" % nom)
            muettes.append(nom)
        elif not nomme:
            print("ROUGE SANS NOM %s: rougit mais ne nomme pas %s" % (nom, vise))
            muettes.append(nom + " (rougit sans nommer)")
        else:
            print("MORD %s -> %s nomme" % (nom, vise))

    shutil.rmtree(WORK, ignore_errors=True)
    print("MUTATIONS=%d MUETTES=%d ANCRERIES=%d"
          % (len(MUTATIONS), len(muettes), len(aveugles)))
    if muettes:
        print("LISTE_MUETTES " + "|".join(muettes))
    if aveugles:
        print("LISTE_ANCRERIES " + "|".join(aveugles))
    return 1 if (muettes or aveugles) else 0


if __name__ == "__main__":
    sys.exit(main())
