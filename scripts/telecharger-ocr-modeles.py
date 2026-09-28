#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Telecharge les poids OCR hors git (package registry GitLab) puis les juge.

Les poids (12,8 Mo) ne sont PAS sous git — decision du contrat du 25/09 (la
lourdeur que le depot refuse). Le juge est scripts/modeles-ocr.manifest.json
(sha256 + tailles). Ce script remplit resources/ocr/modeles/ en relisant
chaque poids au registre de packages du projet, puis appelle le juge deja la
(scripts/verif-modeles-ocr.py) — le telechargement ne s'auto-atteste pas.

Authentification : JOB-TOKEN (le jeton du job CI) en priority, sinon
PRIVATE-TOKEN depuis ~/.netrc en local. Sortie nominale, jamais du vide en
silence : chaque poids est nomme, l'empreinte est comparee.

Usage : python3 scripts/telecharger-ocr-modeles.py
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFESTE = os.path.join(RACINE, "scripts", "modeles-ocr.manifest.json")
DOSSIER = os.path.join(RACINE, "resources", "ocr", "modeles")
PROJET = os.environ.get("CI_PROJECT_ID", "83203842")
VERSION = "v2"
BASE = "https://gitlab.com/api/v4/projects/%s/packages/generic/ocr-modeles/%s" % (PROJET, VERSION)


def sha256_de(chemin):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def entetes():
    jeton = os.environ.get("CI_JOB_TOKEN")
    if jeton:
        return {"JOB-TOKEN": jeton}
    netrc = os.path.expanduser("~/.netrc")
    if os.path.isfile(netrc):
        m = re.search(r"machine gitlab\.com\s+login \S+\s+password (\S+)", open(netrc).read())
        if m:
            return {"PRIVATE-TOKEN": m.group(1)}
    raise SystemExit("FAUTE: aucun jeton pour le registre (CI_JOB_TOKEN absent, netrc muet)")


def telecharger(nom, bytes_attendus, sha_attendu):
    cible = os.path.join(DOSSIER, nom)
    if os.path.isfile(cible) and sha256_de(cible) == sha_attendu:
        print("  %s deja conforme (%d octets) — pas de telechargement" % (nom, bytes_attendus))
        return True
    url = "%s/%s" % (BASE, urllib.parse.quote(nom))
    req = urllib.request.Request(url, headers=entetes())
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    if len(data) != bytes_attendus:
        print("  %s ECHEC taille: recu %d, attendu %d" % (nom, len(data), bytes_attendus))
        return False
    got = hashlib.sha256(data).hexdigest()
    if got != sha_attendu:
        print("  %s ECHEC empreinte: recu %s, attendu %s" % (nom, got[:12], sha_attendu[:12]))
        return False
    os.makedirs(DOSSIER, exist_ok=True)
    with open(cible, "wb") as f:
        f.write(data)
    print("  %s OK (%d octets, empreinte %s conforme)" % (nom, len(data), got[:12]))
    return True


def main():
    if not os.path.isfile(MANIFESTE):
        print("FAUTE: manifeste absent:", MANIFESTE)
        return 2
    manifeste = json.load(open(MANIFESTE, encoding="utf-8"))
    import urllib.parse
    ok = 0
    for e in manifeste["fichiers"]:
        if telecharger(e["nom"], e["octets"], e["sha256"]):
            ok += 1
        else:
            print("ECHEC: %s non conforme" % e["nom"])
    total = len(manifeste["fichiers"])
    if ok != total:
        print("BILAN: %d/%d poids conformes" % (ok, total))
        return 1
    print("BILAN: %d/%d poids telecharges et controles (empreinte par piece)" % (ok, total))
    # Le juge officiel du depot, rejoue tel quel (le telechargement ne s'auto-atteste pas).
    rc = subprocess.call([sys.executable, os.path.join(RACINE, "scripts", "verif-modeles-ocr.py")])
    return 0 if rc == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
