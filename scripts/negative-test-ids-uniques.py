#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative de la porte `verify:ids-uniques` (cles primaires sous rafale).

Meme loi que partout dans ce depot (PHASES.md) : « un PASS qui ne peut pas
devenir FAIL n'est pas une mesure ». Chaque mutation remet EXACTEMENT le defaut
mesure le 30/10 — la cle primaire fabriquee par `Date.now().toString()` — dans
une COPIE ISOLEE de l'arbre (node_modules symlinke), et le harnais exige DEUX
choses :

  - rc != 0                     (la porte rougit),
  - ET le verdict vise NOMME dans la sortie.

Sans la seconde, une panne d'infrastructure (serveur qui ne monte pas, port
vole, tsx absent) ferait « rougir » une mutation qui ne mord rien : on se
declarerait prouve sans avoir juge.

Les mutations et leurs juges :
  M1 le generateur redevient `Date.now().toString()` (src/shared/util.ts)
     -> U0_generateur_sync (20 000 appels SYNCHRONES : deterministe, le meme
        verdict mord sur toute machine ; U2/U6 dependent du planning reseau et
        ne peuvent pas servir de juge unique — mesure du 30/10 sur la CI)
  M2 la planification n'utilise plus le generateur (elle rappelle Date.now())
     -> U2_parallele OU U1_sequentiel (la route contourne le remede ; selon la
        vitesse de la machine la collision tombe dans l'une ou l'autre rafale)
  M3 les fournisseurs n'utilisent plus le generateur
     -> U7_fournisseurs

Lancement: python3 scripts/negative-test-ids-uniques.py
Le code de sortie EST le verdict : 0 = toutes les mutations mordent.
"""
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negids")
UTIL = os.path.join("src", "shared", "util.ts")
PLANNING = os.path.join("src", "routes", "menuplanning.ts")
SUPPLIERS = os.path.join("src", "routes", "suppliers.ts")
PROBE = os.path.join("scripts", "probe-ids-uniques.mjs")
BIG = 1024 * 1024

MUTATIONS = [
    ("M1 le generateur redevient l'horloge nue",
     UTIL,
     "  return rangDansLaMs === 0 ? maintenant.toString() : `${maintenant}-${rangDansLaMs.toString(36)}`;",
     "  return Date.now().toString();",
     ("U0_generateur_sync",)),
    ("M2 la planification contourne le generateur",
     PLANNING,
     "  const id = nouvelId();",
     "  const id = Date.now().toString();",
     ("U2_parallele", "U1_sequentiel")),
    ("M3 les fournisseurs contournent le generateur",
     SUPPLIERS,
     "  const id = nouvelId();",
     "  const id = Date.now().toString();",
     ("U7_fournisseurs",)),
]


def read(rel, racine=None):
    with open(os.path.join(racine or BASE, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    p = os.path.join(WORK, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def prepare_work():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    keep = ("node_modules", "dist", "dist-server", "test-results", ".git", "test",
            "__pycache__", "release")
    for item in os.listdir(BASE):
        if item in keep:
            continue
        s = os.path.join(BASE, item)
        d = os.path.join(WORK, item)
        if os.path.isdir(s):
            # copie recursive MANUELLE : les noms a doubles soulignes sont rognes
            # par le rendu de ce poste, une copie muette ferait croire a une absence.
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
    os.symlink(os.path.join(BASE, "node_modules"), os.path.join(WORK, "node_modules"))


def play():
    """Joue la porte DANS la copie (elle prend son cwd pour racine du depot)."""
    p = subprocess.run(["node", PROBE], cwd=WORK, capture_output=True,
                       text=True, timeout=300)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def main():
    prepare_work()
    # les fichiers de la porte elle-meme : la copie doit les porter, mais on les
    # lit depuis le depot de travail (ce sont les memes).
    for rel in (PROBE, os.path.join("scripts", "_sondes_serveur.py")):
        if os.path.isfile(os.path.join(BASE, rel)):
            write(rel, read(rel))

    rc, out = play()
    if "GATES_IDS=" not in out:
        print("INFRASTRUCTURE: la porte ne s'est pas jouee dans la copie.")
        print(out[-900:])
        return 9
    if rc != 0:
        print("INFRASTRUCTURE: la porte est rouge AVANT toute mutation.")
        print(out[-900:])
        return 9
    print("TETE DE COURSE: porte verte sans mutation (rc=0).")

    aveugles, muettes = [], []
    for nom, rel, anc, mot, vise in MUTATIONS:
        base = read(rel)
        n = base.count(anc)
        if n != 1:
            # Une ancre qui matche zero ou deux fois n'est PAS une mutation :
            # c'est le harnais qui ment. On ne joue pas, on nomme.
            print("ANCRE FAUSSE %s: %d occurrence(s), 1 attendue" % (nom, n))
            aveugles.append(nom)
            continue
        write(rel, base.replace(anc, mot, 1))
        try:
            rc2, out2 = play()
        finally:
            write(rel, base)
        nomme = [v for v in vise if ("VERDICT " + v + " ROUGE") in out2]
        if rc2 == 0:
            print("NE MORD PAS %s: la porte reste verte avec la mutation" % nom)
            muettes.append(nom)
        elif not nomme:
            print("ROUGE SANS NOM %s: rougit mais ne nomme aucun de %s"
                  % (nom, "|".join(vise)))
            muettes.append(nom + " (rougit sans nommer)")
        else:
            print("MORD %s -> %s nomme" % (nom, "|".join(nomme)))

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
