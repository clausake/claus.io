#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifie les ANGRES d'un installeur, SANS toucher au depot juge.

Pourquoi ce fichier existe: un installeur qui insere un bloc de code par
ancrees (find/replace sur des chaines) peut produire un fichier qui n'est PAS
du code valide, et le juge de ce depot est `npx tsc --noEmit` lance SUR L'ARBRE
DE TRAVAIL. Lancer l'installeur a sec pour decouvrir qu'il rend le depot rouge
veut dire devoir le reparer a posteriori (et un `git checkout` imprudent emporte
le reste du chantier en cours). Ici l'installeur est rejoue sur une COPIE
ISOLEE et le compilateur est lance dans la copie: le depot n'est jamais touche
avant que le verdict soit connu.

Il exige en plus les temoins SEMENTIQUES (les compteurs que l'installeur lui-
même declare) et NON un simple rc: un bloc inseré mais vide de sa substance
compile tres bien. `node --check` est le juge de SYNTAXE seule (piege consigne
dans PHASES.md: une variable declaree et utilisee 12 fois n'est pas une faute
de syntaxe), donc on l'accompagne d'un compte de NOMS reellement resolus.

Lancement: python3 scripts/probe-installeur-morsure.py <installeur.py> <cible>
Rendu en TOKENS (le rendu de ce poste altere les identifiants).
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-installeur")
BIG = 1024 * 1024


def preparer():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    keep = ("node_modules", "dist", "test-results", ".git", "__pycache__")
    for item in os.listdir(BASE):
        if item in keep or item.startswith("test"):
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE (os.walk + copy2), jamais copytree: les
            # mots-cles a doubles soulignes sont rognes par le rendu de ce poste
            # (piege consigne) et une copie muette fait conclure a une absence
            # de donnees.
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                               if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith((".log", ".pyc")):
                        continue
                    s = os.path.join(dirpath, fn)
                    d = os.path.join(dst, rel, fn)
                    if os.path.getsize(s) > BIG:
                        os.symlink(s, d)
                    else:
                        shutil.copy2(s, d)
        else:
            if os.path.getsize(src) > BIG:
                os.symlink(src, dst)
            else:
                shutil.copy2(src, dst)
    os.symlink(os.path.join(BASE, "node_modules"),
               os.path.join(WORK, "node_modules"))
    # test/ est copie en entier (les specs e2e sont jugees), sauf les
    # repertoires de travail des suites.
    src = os.path.join(BASE, "test")
    dst = os.path.join(WORK, "test")
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if not d.startswith("tmp")]
        rel = os.path.relpath(dirpath, src)
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for fn in filenames:
            s = os.path.join(dirpath, fn)
            d = os.path.join(dst, rel, fn)
            if os.path.getsize(s) > BIG:
                os.symlink(s, d)
            else:
                shutil.copy2(s, d)


def run(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=900)
    return p.returncode, ((p.stdout or "") + (p.stderr or ""))


def main(installeur, cible):
    preparer()
    T = []
    # 1) la copie est prouvable: un octet qui diverge rendrait un verdict sans objet
    a = open(os.path.join(BASE, cible), "rb").read()
    b = open(os.path.join(WORK, cible), "rb").read()
    T.append("COPIE_IDENTIQUE=%d" % (1 if a == b else 0))
    if a != b:
        print("INSTALLEUR %s" % " ".join(T))
        return 2

    rc, out = run([sys.executable, installeur], WORK)
    T.append("RC=%d" % rc)
    ligne = [l for l in out.splitlines() if l.startswith("VERIFY") or l.startswith("DEJA")
             or l.startswith("ANCRE") or l.startswith("UTF8") or l.startswith("MANQUANT")]
    T.append("SORTIE=" + ("|".join(x.replace(" ", "_")[:180] for x in ligne) or "MUETTE"))
    # temoin semantique: la cible a-t-elle REELLEMENT change d'octets?
    c = open(os.path.join(WORK, cible), "rb").read()
    T.append("OCTETS=%d/%d" % (len(a), len(c)))
    T.append("MODIFIE=%d" % (1 if c != a else 0))

    # 2) SYNTAXE seule (node --check ne voit pas les noms non resolus)
    rc2, out2 = run(["node", "--check", cible], WORK) if cible.endswith((".mjs", ".cjs", ".js")) else (0, "NON_JUGE")
    T.append("NODECHECK=%d" % rc2)
    if rc2 != 0:
        T.append("NODECHECK_DETAIL=" + re.sub(r"\s+", " ", out2)[:220])

    # 3) le VRAI juge de ce depot: le compilateur, lance DANS LA COPIE
    rc3, out3 = run(["npx", "tsc", "--noEmit"], WORK)
    T.append("TSC=%d" % rc3)
    if rc3 != 0:
        # on rend les lignes d'erreur NOMMEES: c'est le seul endroit ou un nom
        # d'identifiant corrompu devient lisible (le grep, lui, normalise la casse)
        errs = [l.strip()[:200] for l in out3.splitlines()
                if re.search(r"error TS\d+", l)][:24]
        T.append("ERREURS=%d" % len(errs))
        for e in errs:
            T.append("E_" + re.sub(r"\W+", "_", e)[:150] + "=" + e)

    # 4) compteurs SEMENTIQUES: un bloc inseré mais vide compile tres bien
    src = c.decode("utf-8", "replace")
    for nom, motif in (("push", r"\.push\("), ("get", r"db\.get\("),
                       ("run", r"db\.run\("), ("changes", r"changes\s*!=="),
                       ("status", r"res\.status\(")):
        T.append("N_%s=%d" % (nom, len(re.findall(motif, src))))

    print("INSTALLEUR " + " ".join(T))
    shutil.rmtree(WORK, ignore_errors=True)
    return 0 if (rc == 0 and rc2 == 0 and rc3 == 0) else 1


if __name__ == "__main__":
    inst = sys.argv[1] if len(sys.argv) > 1 else "scripts/install-supplier-import-contract.py"
    tgt = sys.argv[2] if len(sys.argv) > 2 else os.path.join("src", "routes", "supplierprices.ts")
    sys.exit(main(inst, tgt))
