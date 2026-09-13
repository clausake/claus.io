#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Distingue le rouge PERIME du rouge REEL par horodatage et octets.

Existe parce qu'un notification tardive de `E2E_RC=1` est arrivee ALORS que
la cours fraiche avait rendu `E2E_RC=0`. Le piege consigne du depot: « verifier
l'horodatage des logs rouges contre git log avant d'agir ».

Ce script ne rend PAS un verdict global: il rend les FAITS (date de chaque
log, dernier `..._RC=`, compte de tests dans le corps) pour que la conclusion
se lise, et il dit explicitement quel binome (log perime / log frais) est
lequel.
"""
import os
import re
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
RACINE = os.path.join(HOME, "cookdrive-project")
RC = re.compile(r"^(VITEST_RC|E2E_RC|BUILD_RC|PROBE_RC|UNIT_RC|SONDE_RC)=(\d+)\s*$", re.M)
COMPTE = re.compile(r"(\d+)\s+(passed|failed|did not run|skipped)", re.I)

FICHIERS = [
    ("FIN-E2E (ancien harnais)", os.path.join(HOME, "fin2.log")),
    ("FIN-VITEST (ancien harnais)", os.path.join(HOME, "fin1.log")),
    ("NEG-CONSUME3 (ancien harnais)", os.path.join(HOME, "neg-consume3.log")),
    ("S9F-UNIT (cours fraiche)", os.path.join(HOME, "s9f-unit.log")),
    ("S9F-E2E (cours fraiche)", os.path.join(HOME, "s9f-e2e.log")),
    ("S9F-BUILD (cours fraiche)", os.path.join(HOME, "s9f-build.log")),
    ("S9F-SONDE (cours fraiche)", os.path.join(HOME, "s9f-sonde.log")),
]


def git(*args):
    return subprocess.run(["git"] + list(args), cwd=RACINE, capture_output=True,
                          text=True).stdout.strip()


def main():
    # ⚠ Un seul mot par argument: `--date=format-local:…` a deja ete rogne par
    # le rendu en ligne de commane (`=` -> absence du separateur, git RC=128).
    tete = git("log", "-1", "--oneline")
    print("HEAD =", tete)
    print("REV  =", git("rev-parse", "--short", "HEAD"), "| origin/main:",
          git("rev-parse", "--short", "origin/main"))
    mainteant = time.strftime("%Y-%m-%d %H:%M:%S")
    print("MAINTENANT =", mainteant)
    print()

    for nom, chemin in FICHIERS:
        if not os.path.isfile(chemin):
            print("%-32s ABSENT" % nom)
            continue
        brut = open(chemin, "rb").read()
        txt = brut.decode("utf-8", "replace")
        quand = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(chemin)))
        rcs = ["%s=%s" % (a, b) for a, b in RC.findall(txt)]
        comptes = [
            "%s %s" % (n, v.lower()) for n, v in COMPTE.findall(txt)
            if v.lower() in ("passed", "failed", "did not run")
        ]
        print("%-32s %s | %7d octets | mtime %s"
              % (nom, os.path.basename(chemin), len(brut), quand))
        print("     RC: %s" % (" ".join(rcs) if rcs else "(aucun marqueur)"))
        if comptes:
            print("     corps: %s" % ", ".join(dict.fromkeys(comptes)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
