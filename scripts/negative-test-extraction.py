#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du contrat d'extraction (Sprint 15, Tache 15).

La regle du depot : « un PASS qui ne peut pas devenir FAIL n'est pas une
mesure ». Pour chaque garde du contrat on NIE exactement la ligne qui la
porte, dans une COPIE ISOLEE de l'arbre (node_modules symlinke), et on exige
DEUX choses :
  - rc != 0                              (le test unitaire rougit),
  - ET le test vise NOMME dans la sortie (le test que la mutation devait
    tuer). Sans la seconde condition, une panne d'infrastructure ferait
    « rougir » une mutation qui ne mord rien.

Les mutations (chacune annule UNE garde, laisse les autres vivantes) :
  M1 ligneCoherente accepte tout          -> le glissement decimal 112,50->11,25
     ne rougit plus la ligne (la mutation du banc 25/09)   -> "glissement decimal"
  M2 sommeConcorde accepte tout           -> le total HT falsifie passe        -> "total HT falsifie"
  M3 preuveAncre toujours vrai            -> le champ sans preuve devient une VALEUR
     (l'hallucination reine, le contrat nie)                -> "SANS PREUVE"
  M4 la clef SIRET n'est plus verifiee    -> 00027 devient VALIDE              -> "CLEF_SIRET"
  M5 la clef TVA n'est plus verifiee      -> FR79 devient VALIDE               -> "CLEF_TVA"
  M6 la DLC passee n'est plus refusee     -> 20/09 DLC future-passee passe     -> "PASSEE"

Lancement : python3 scripts/negative-test-extraction.py
Le code de sortie EST le verdict : 0 = les six mutations mordent.
"""
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", ".isol-extraction")
BIG = 4 * 1024 * 1024
SPEC = "test/unit/extraction-gardes.test.ts"

GARDE_ARITH = "src/shared/extraction/garde-arithmetique.ts"
GARDE_PREUVE = "src/shared/extraction/preuve-ancree.ts"
GARDE_IDENT = "src/shared/extraction/garde-identifiants.ts"
GARDE_DLC = "src/shared/extraction/garde-dlc.ts"

# (nom, fichier, old, new, le test que la mutation DOIT tuer — nom exact)
MUTATIONS = [
    ("M1 ligneCoherente morte", GARDE_ARITH,
     "  return Math.abs(cents(l.quantite * l.prix_unitaire) - cents(l.montant)) <= 0;",
     "  return true; // MUTATION M1",
     "glissement decimal"),
    ("M2 sommeConcorde morte", GARDE_ARITH,
     "  return Math.abs(s - cents(totalHt)) <= 0;",
     "  return true; // MUTATION M2",
     "total HT falsifie"),
    ("M3 preuveAncre toujours vrai", GARDE_PREUVE,
     "  if (!champ.preuve) return false;",
     "  if (!champ.preuve) return true; // MUTATION M3",
     "SANS preuve est refuse"),
    ("M4 clef SIRET non verifiee", GARDE_IDENT,
     "  if (clefLue !== pad3(onzieme % 97)) {",
     "  if (false) { // MUTATION M4",
     "CLEF_SIRET_FAUSSE"),
    ("M5 clef TVA non verifiee", GARDE_IDENT,
     "  if (clefTvaAttendue(siren) !== clefLue) {",
     "  if (false) { // MUTATION M5",
     "CLEF_TVA_FAUSSE"),
    ("M6 DLC passee acceptee", GARDE_DLC,
     '  return passee\n    ? { ...base, genre, verdict: "PASSEE", date: iso }\n    : { ...base, genre, verdict: "ACCEPTE", date: iso };',
     '  return { ...base, genre, verdict: "ACCEPTE", date: iso }; // MUTATION M6',
     "PASSEE"),
]


def read(rel):
    with open(os.path.join(BASE, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(WORK, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def prepare_work():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    keep = ("node_modules", "dist", "dist-server", "test-results", ".git",
            "release", "resources", ".hermes", "__pycache__")
    for item in os.listdir(BASE):
        if item in keep:
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE (piege consigne : copytree rogne les
            # mots-cles a doubles soulignes via le rendu de ce poste).
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
    os.symlink(os.path.join(BASE, "node_modules"), os.path.join(WORK, "node_modules"))
    # la copie doit etre prouvable par les octets : une copie muette ferait
    # juger le vide (piege consigne du 09/09).
    for rel in [SPEC, GARDE_ARITH, GARDE_PREUVE, GARDE_IDENT, GARDE_DLC]:
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    npx = shutil.which("npx")
    assert npx, "npx introuvable"
    proc = subprocess.run([npx, "vitest", "run", SPEC],
                          cwd=WORK, capture_output=True, text=True, timeout=600)
    return proc.returncode, ((proc.stdout or "") + (proc.stderr or ""))


def main():
    prepare_work()
    originals = {}
    results = []
    try:
        rc, out = run_spec()
        if rc != 0:
            print("LIGNE DE BASE ROUGE -- la preuve serait sans objet.")
            print(out[-3500:])
            return 2
        print("ligne de base : VERTE (22 tests joues avant mutations)")
        for nom, rel, old, new, doit_nommer in MUTATIONS:
            if rel not in originals:
                originals[rel] = read(rel)
            source = originals[rel]
            if source.count(old) != 1:
                print(f"  {nom:<28} <<< la cible n'est pas unique ({source.count(old)}) : "
                      f"la mutation n'a pas de sede — refusee.")
                results.append((nom, None))
                continue
            write(rel, source.replace(old, new))
            rc, out = run_spec()
            tueur = doit_nommer in out
            if rc != 0 and tueur:
                etat = f"ROUGE nommee ({doit_nommer})"
                ok = True
            elif rc != 0:
                etat = f"ROUGE mais le test vise ({doit_nommer}) n'est PAS nomme"
                ok = False
            else:
                etat = f"<<< VERTE : la garde mutlee ne mord plus, le test passe"
                ok = False
            print(f"  {nom:<28} {etat}")
            results.append((nom, ok))
            write(rel, originals[rel])  # restaurant la piece saine
    finally:
        shutil.rmtree(WORK, ignore_errors=True)

    rouges = [n for n, ok in results if ok is False]
    absentes = [n for n, ok in results if ok is None]
    print(f"\nmutations mordantes : {len(results) - len(rouges) - len(absentes)}/{len(MUTATIONS)}")
    if rouges or absentes:
        print("VERDICT : porte NON PROUVEE —", "; ".join(rouges + absentes))
        return 1
    print("VERDICT : les six gardes mordent (le PASS peut devenir FAIL — c'est une mesure).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
