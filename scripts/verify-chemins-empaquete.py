#!/usr/bin/env python3
"""La PORTE des chemins de ressources de l'application empaquetée.

Pourquoi ce fichier existe (défaut mesuré sur l'installeur Windows 0.1.0) :
le serveur empaqueté cherchait `dist`, `vocab.json` et `public/` depuis
`process.cwd()`. Empaquetée, l'application porte ces fichiers DANS son archive
(`…/resources/app.asar/…`) alors que le cwd est le dossier de l'exe (ou
`C:\\Windows\\System32` selon le raccourci). Trois défauts en un seul, tous
silencieux :

  1. la fenêtre Electron affichait la page Express « Not Found » ;
  2. Epicure chargeait des vecteurs NULS en silence (« CRITICAL error loading
     EpicureModel » rendu dans la console, l'UI fonctionnait à côté) ;
  3. le téléchargement du guide rendait 404.

Cette porte est une LECTURE DE CONTRAT, pas une imitation du lanceur : elle
exige que la source contienne la résolution par candidats ET qu'aucun des trois
chemins ne retombe sur le cwd nu. Un correctif qui consigne l'erreur dans un
commentaire sans changer le code rougit ici.

Lancement : python3 scripts/verify-chemins-empaquete.py
"""
import json
import os
import re
import sys

# Le fichier JUgé est passé en argument par la morsure (qui rejoue la porte sur
# une copie mutée du dépôt). Sans argument, on se juge SOI-MÊME : le dépôt de
# travail. Une porte qui ne peut pas être pointée sur une copie ne peut pas
# prouver qu'elle voit le défaut (regle 6 : une porte qui ne pique pas est
# decorative — et c'est exactement ce que la morsure a mesuré au premier essai).

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (fichier, motif INTERDIT, ce qu'on exige à la place, nom de la règle)
DEFENSES = [
    (
        "server.ts",
        r'path\.join\(\s*process\.cwd\(\)\s*,\s*"dist"\s*\)',
        r'resoudreDist\(\s*\)',
        "le frontend se résout par candidats, jamais par le cwd",
    ),
    (
        "epicure.ts",
        r'readFileSync\(\s*"vocab\.json"',
        r'resoudreDonneesEpicure\(\s*\)',
        "le vocabulaire Epicure se résout par candidats, jamais par le cwd",
    ),
    (
        "src/routes/admin.ts",
        r'path\.join\(\s*process\.cwd\(\)\s*,\s*"public"\s*,\s*"Executive_Guide\.pdf"\s*\)\s*;',
        r'resoudreDist\(\)',
        "le guide se cherche dans dist (l'asar), public/ n'est qu'un repli dev",
    ),
]

# Le lanceur doit donner au serveur le chemin EXACT du frontend : sans cette
# ligne, le serveur n'a que ses deux candidats devinés (parent du module, cwd).
LANCEUR = ("electron/main.cjs", r"COOKDRIVE_DIST\s*=\s*path\.join\(\s*__dirname\s*,\s*'\.\.'\s*,\s*'dist'\s*\)")

# Les fichiers de données que l'installeur doit embarquer (défaut n°2 ci-dessus :
# non embarqués, Epicure tournait sur des vecteurs nuls).
DONNEES_OBLIGATOIRES = [
    "vocab.json",
    "vocab_translations.json",
    "embeddings.chem.safetensors",
    "embeddings.cooc.safetensors",
    "embeddings.core.safetensors",
]

# Ce que le module de résolution doit rendre quand rien n'est trouvé : une erreur
# NOMMÉE. Un `return null` ferait revenir le 404 muet, celui qu'on a pris pour un
# bug d'interface pendant des semaines.
ERREUR_NOMMEE = ("src/services/chemin-ressources.ts", r"RESSOURCE_INTROUVABLE")


RACINE = BASE


def lire(chemin):
    with open(os.path.join(RACINE, chemin), encoding="utf-8") as f:
        return f.read()


def main(racine=BASE):
    global RACINE
    RACINE = racine
    echecs = []
    jouees = 0

    for fichier, interdit, exige, regle in DEFENSES:
        jouees += 1
        try:
            source = lire(fichier)
        except OSError as e:
            echecs.append(f"{regle} : {fichier} illisible ({e})")
            continue
        if re.search(interdit, source):
            echecs.append(f"{regle} : {fichier} contient encore le chemin relatif au cwd ({interdit})")
        elif not re.search(exige, source):
            echecs.append(f"{regle} : {fichier} n'appelle pas le résolveur ({exige})")

    jouees += 1
    fichier, motif = LANCEUR
    if not re.search(motif, lire(fichier)):
        echecs.append(f"le lanceur donne le chemin exact du frontend : {fichier} ne pose pas COOKDRIVE_DIST")

    jouees += 1
    with open(os.path.join(RACINE, "package.json"), encoding="utf-8") as f:
        fichiers_packager = json.load(f)["build"]["files"]
    manquants = [d for d in DONNEES_OBLIGATOIRES if d not in fichiers_packager]
    if manquants:
        echecs.append("l'installeur embarque les données Epicure : manquants dans build.files -> " + ", ".join(manquants))

    jouees += 1
    fichier, motif = ERREUR_NOMMEE
    if not re.search(motif, lire(fichier)):
        echecs.append(f"la résolution qui échoue nomme son échec : {fichier} ne lève plus RESSOURCE_INTROUVABLE")

    print(f"CHEMINS-EMPAQUETE portees={jouees} rouges={len(echecs)}")
    for e in echecs:
        print("  ROUGE " + e)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main(os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else BASE))
