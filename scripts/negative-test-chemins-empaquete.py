#!/usr/bin/env python3
"""La MORSURE de verify:chemins-empaquete.

Une porte qui ne peut pas rougir n'est pas une mesure. Ce script rejoue la porte
sur une COPIE du dépôt dont on a réintroduit le défaut d'origine (le chemin pris
sur `process.cwd()`), et exige qu'elle ROUGISSE. Si elle reste verte, la porte
est décorative et ce script rougit.

Lancement : python3 scripts/negative-test-chemins-empaquete.py
"""
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-chemins-empaquete")
PORTE = os.path.join(BASE, "scripts", "verify-chemins-empaquete.py")

# Le défaut d'origine, réintroduit à l'identique (il a été mesuré sur le binaire
# embarqué de la release 0.1.0 : `const distPath = path.join(process.cwd(), "dist")`).
MUTATIONS = [
    ("server.ts", "resoudreDist()", 'path.join(process.cwd(), "dist")'),
    ("epicure.ts", "resoudreDonneesEpicure()", '"vocab.json"'),
]


def rejouer(cible):
    # la porte recoit la racine à juger en argument : c'est LA copie mutée
    # qu'elle lit, pas le dépôt de travail (sinon elle resterait verte quoi
    # qu'on mute, et la morsure ne prouverait rien).
    r = subprocess.run([sys.executable, PORTE, cible], cwd=BASE, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    shutil.rmtree(WORK, ignore_errors=True)
    shutil.copytree(
        BASE, WORK, ignore=shutil.ignore_patterns("node_modules", "release", ".git", "dist", "dist-server", "test", "tmp-*")
    )
    # La porte lit ses fichiers par son propre BASE : la copie doit contenir la
    # porte elle-même, test/ excepté (il est ignoré pour ne pas se juger soi-même).
    os.makedirs(os.path.join(WORK, "scripts"), exist_ok=True)
    shutil.copy2(PORTE, os.path.join(WORK, "scripts", "verify-chemins-empaquete.py"))

    # 1) la copie non mutée doit être verte (sinon la morsure ne prouverait rien)
    rc, out = rejouer(WORK)
    if rc != 0:
        print("MORSURE_INJUSTE : la copie non mutée est déjà rouge, rien n'est prouvé")
        print(out)
        return 1

    # 2) chaque mutation du défaut d'origine doit faire rougir la porte
    rouges = 0
    for fichier, propre, defaut in MUTATIONS:
        chemin = os.path.join(WORK, fichier)
        with open(chemin, encoding="utf-8") as f:
            source = f.read()
        if propre not in source:
            print(f"MORSURE_INJUSTE : {fichier} ne contient plus `{propre}` — la mutation est impossible")
            return 1
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(source.replace(propre, defaut, 1))
        rc, out = rejouer(WORK)
        etat = "ROUGE (attendu)" if rc != 0 else "VERTE (la porte est decorative)"
        print(f"  mutation {fichier} <- `{defaut}` : {etat}")
        if rc != 0:
            rouges += 1
        # remise en propre pour la mutation suivante
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(source)

    shutil.rmtree(WORK, ignore_errors=True)
    print(f"NEGATIF-CHEMINS-EMPAQUETE mutations={len(MUTATIONS)} rouges={rouges}")
    if rouges != len(MUTATIONS):
        return 1
    print("VERDICT : la porte voit le defaut d'origine")
    return 0


if __name__ == "__main__":
    sys.exit(main())
