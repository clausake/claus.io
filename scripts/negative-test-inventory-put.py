#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `inventory-put-contract.spec.ts`.

La regle du projet (PHASES.md) : "un PASS qui ne peut pas devenir FAIL n'est pas
une mesure". Apres chaque check ajoute, on injecte la faute correspondante dans
une COPIE ISOLEE de l'arbre (node_modules symlinke) et on exige:
  - rc != 0  (le spec rougit),
  - ET la regle visee NOMMEE dans la sortie (un `expect` attendu qui porte le
    token, ou le nom du test).
Sans la seconde condition, un defaut d'infrastructure (serveur qui ne monte pas,
npm absent) ferait "rougir" une mutation qui ne mord rien: le harnais se
declarerait prouve alors qu'il n'a rien juge.

Chaque mutation est la NEGATION EXACTE d'une regle du correctif, et chacune ne
peut faire rougir qu'UNE moitie du contrat :

  M1 le champ ABSENT retourne dans le SET : un PUT partiel ecrit `undefined`
     dans les colonnes que le client n'a pas envoyees. Verdict: 500 (le binding
     jette) ou colonnes vidées.
  M2 une chaine est accepte dans une colonne REAL : le nombre n'est plus
     CONVERTI, il est passe brut. Le texte part en base (affinite dynamique)
     et le badge de l'auditeur devient une fiction.
  M3 le nombre hors plage est accepte : les bornes sont enlevees.
  M4 l'enum du statut est ouvert : n'importe quelle chaine est acceptee.
  M5 l'UPDATE est juge sans le compteur de lignes touchees : le 404 disparait.
  M6 la reponse recite le corps de la requete au lieu de relire la base.
  M7 le rendement revient a sa valeur par defaut quand il n'est pas envoye.

Lancement: python3 scripts/negative-test-inventory-put.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import sys
import shutil
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-neginv")
SPEC = os.path.join("test", "e2e", "inventory-put-contract.spec.ts")
ROUTE = os.path.join("src", "routes", "inventory.ts")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token qui DOIT apparaître dans la sortie)
MUTATIONS = [
    ("M1 un champ absent retourne dans le SET (le PUT partiel n'est plus partiel)",
     ROUTE,
     "    if (brut === undefined) continue;",
     "    if (false) continue;",
     "partiel"),
    ("M2 une chaine est accepte dans une colonne REAL (plus de conversion)",
     ROUTE,
     '    const n = typeof brut === "number" ? brut\n'
     '      : typeof brut === "string" && brut.trim() !== "" ? Number(brut) : Number.NaN;\n'
     '    if (!Number.isFinite(n) || n < bornes.min || n > bornes.max) { refus.push(col); continue; }',
     '    const n = brut as number;\n'
     '    if (false) { refus.push(col); continue; }',
     "REFUS_TEXTE_QUANTITE"),
    ("M3 les bornes de plage sautent (le 101 % passe)",
     ROUTE,
     "    if (!Number.isFinite(n) || n < bornes.min || n > bornes.max) { refus.push(col); continue; }",
     "    if (!Number.isFinite(n)) { refus.push(col); continue; }",
     "REFUS_RENDEMENT_HORS_PLAGE"),
    ("M4 l'enum du statut est ouvert (le statut devient une chaine libre)",
     ROUTE,
     '        if (!STATUTS.includes(propre as (typeof STATUTS)[number])) refus.push("status");',
     '        if (false) refus.push("status");',
     "REFUS_STATUT_INVENTE"),
    ("M5 le compteur de lignes touchees ne juge plus (le 404 disparait)",
     ROUTE,
     "  if (resultat?.changes !== 1) {",
     "  if (false) {",
     "REFUS_ID_INEXISTANT"),
    ("M6 la reponse recite le client au lieu de relire la base",
     ROUTE,
     '  res.json({ status: "success", item: relu, updated: ecrites });',
     '  res.json({ status: "success", item: req.body, updated: ecrites });',
     "ne recite pas"),
    ("M7 le rendement revient a son defaut quand il est absent",
     ROUTE,
     "      // yield_percent a un defaut dans le schema (100) et la route POST le fige",
     "      if (col === \"yield_percent\") { ecrites.push(col); valeurs.push(100); continue; }\n      // x",
     "rendement"),
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
    keep = ("node_modules", "dist", "test-results", ".git", "test",
            "__pycache__")
    for item in os.listdir(BASE):
        if item in keep:
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE (os.walk + copy2), jamais copytree: les
            # mots-cles a doubles soulignes sont rognes par le rendu de ce poste
            # (piege consigne dans PHASES.md) et une copie muette fait conclure
            # a une absence de donnees.
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                              if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith(".log") or fn.endswith(".pyc"):
                        continue
                    if fn.startswith("__") and fn.endswith("__"):
                        continue
                    s = os.path.join(dirpath, fn)
                    d = os.path.join(dst, rel, fn)
                    if os.path.getsize(s) > BIG:
                        os.symlink(s, d)  # les embeddings: hors du chemin juge
                    else:
                        shutil.copy2(s, d)
        else:
            if os.path.getsize(src) > BIG:
                os.symlink(src, dst)
            else:
                shutil.copy2(src, dst)
    os.symlink(os.path.join(BASE, "node_modules"), os.path.join(WORK, "node_modules"))
    os.makedirs(os.path.join(WORK, "test", "e2e"), exist_ok=True)
    shutil.copy2(os.path.join(BASE, SPEC), os.path.join(WORK, SPEC))
    # UN seul spec: le harnais juge CE spec, pas la suite entiere.
    for other in os.listdir(os.path.join(WORK, "test", "e2e")):
        if other != os.path.basename(SPEC):
            os.remove(os.path.join(WORK, "test", "e2e", other))
    # la copie est prouvable: un octet qui diverge rendrait un verdict sans objet
    for rel in (SPEC, ROUTE):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # ⚠ NODE/npx et non sys.executable: lancer python sur un .ts produit un
    # message de PYTHON qui fait rougir la ligne de base pour une faute
    # d'harnais (piege rencontre ce jour sur l'autre preuve negative).
    npx = shutil.which("npx")
    assert npx, "npx introuvable"
    proc = subprocess.run([npx, "playwright", "test", SPEC, "--reporter=line"],
                          cwd=WORK, capture_output=True, text=True, timeout=600)
    return proc.returncode, ((proc.stdout or "") + (proc.stderr or ""))


def main():
    prepare_work()
    originals = {m[1]: read(m[1]) for m in MUTATIONS}
    results = []
    try:
        rc, out = run_spec()
        if rc != 0:
            print("LIGNE DE BASE ROUGE -- la preuve serait sans objet.")
            print(out[-3500:])
            return 2
        results.append(("ligne de base (attendu VERT)", 0, True, ""))

        for name, rel, pattern, repl, token in MUTATIONS:
            src = originals[rel]
            hits = src.count(pattern)
            if hits != 1:
                results.append((name, -1, False,
                                "MOTIF %s (%d vus, 1 attendu)" % ("ABSENT" if not hits else "AMBIGU", hits)))
                continue
            write(rel, src.replace(pattern, repl, 1))
            try:
                rc, out = run_spec()
            finally:
                write(rel, src)
            rougit = rc != 0
            # le check vise doit etre NOMME: un echec d'infrastructure rougit
            # aussi, et ne prouve rien du contrat.
            nomme = token.lower() in out.lower()
            results.append((name, rc, rougit and nomme,
                            "" if (rougit and nomme) else out[-2500:]))

        rc, out = run_spec()
        results.append(("restaure (attendu VERT)", rc, rc == 0,
                        "" if rc == 0 else out[-1500:]))
    finally:
        shutil.rmtree(WORK, ignore_errors=True)

    print()
    print("=" * 74)
    print("PREUVE NEGATIVE - inventory-put-contract.spec.ts")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-74s rc=%s" % ("OK   " if ok else "ROUGE", label[:74], rc))
        if not ok:
            failed += 1
            for line in (detail or "").splitlines():
                if re.search(r"(Error|expect|Expected|Received|MOTIF|SUB|passed|failed)", line):
                    print("        |", line.strip()[:160])
    total = len(results)
    print("-" * 74)
    print("  %d/%d mordent (rc!=0 + la regle visee nommee)" % (total - failed, total))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
