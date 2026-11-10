#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chantier 46 — le VRAI CLI JavaScript de tsx, resolu par le PAQUET.

Pourquoi ce module existe : les juges Python lanchaient le serveur via
`node_modules/.bin/tsx`. Sous Windows, ce fichier est un SCRIPT SHELL : le
passer a node.exe le faisait lire comme du shell (message mesure :
« basedir=$(dirname ...) — SyntaxError: missing ) after argument list »), et
le serveur ne demarrait pas. Le client a mesure : verify:auth echouait sur
« serveur pas pret ».

On resout donc le paquet `tsx` et on prend son entree `bin` (le VRAI
JavaScript, `dist/cli.mjs`), que node sait executer sur les deux systemes.
"""
import json
import os


def chemin_tsx(base):
    """Le chemin du CLI JavaScript de tsx (dist/cli.mjs) pour une racine donnee.

    La lecture du `bin` du paquet evite de coder en dur un chemin de version
    (le nom du fichier d'entree a change au fil des versions de tsx).
    """
    racine = os.path.join(base, "node_modules", "tsx")
    manifest = os.path.join(racine, "package.json")
    if os.path.isfile(manifest):
        try:
            with open(manifest, "r", encoding="utf-8") as f:
                data = json.load(f)
            binaire = (data.get("bin") or {}).get("tsx")
            if isinstance(binaire, str):
                candidat = os.path.normpath(os.path.join(racine, binaire))
                if os.path.isfile(candidat):
                    return candidat
        except Exception:
            pass  # manifeste illisible : on tente le nom classique
    classique = os.path.join(racine, "dist", "cli.mjs")
    if os.path.isfile(classique):
        return classique
    raise RuntimeError(
        "tsx introuvable sous %s : ni le bin du paquet ni dist/cli.mjs" % racine
    )
