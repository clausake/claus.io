#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `consume-contract.spec.ts`.

La regle du depot (PHASES.md) : « un PASS qui ne peut pas devenir FAIL n'est pas
une mesure ». Pour chaque regle du contrat de POST /api/inventory/consume on
nie EXACTEMENT la ligne qui la porte dans une COPIE ISOLEE de l'arbre
(node_modules symlinke) et on exige DEUX choses :
  - rc != 0            (le spec rougit),
  - ET le test vise NOMME dans la sortie.
Sans la seconde condition, une panne d'infrastructure (serveur qui ne monte pas,
npx absent, port pris par un fils du run precedent) ferait « rougir » une
mutation qui ne mord rien et le harnais se declarerait prouve sans rien juger.

Les mutations et leurs juges :
  M1 le compteur de lignes touchees ne juge plus : une clef inexistante (changes
     = 0) redevient un succes et l'ecriture partielle reste en base  -> C2.
  M2 l'annulation n'est plus declenchee quand une clef est inconnue : la premiere
     ligne du lot reste DEJA consommee quand la reponse dit 400            -> C2.
  M3 le garde d'entree se transforme en ce que faisait l'ANCIEN code : une entree
     malformee est `continue` (siglee) et le 200 sort quand meme            -> C3/C4.
  M4 le compte-rendu recite le corps de la requete au lieu de relire la base
                                                                          -> C1.
  M5 les quantites negatives et nulles redeviennent acceptees             -> C1/C3.
  M6 le `items` vide n'est plus refuse (le 400 de C5 disparait)            -> C5.

Lancement : python3 scripts/negative-test-consume-contract.py
Le code de sortie EST le verdict : 0 = toutes les mutations mordent.
"""
import os
import re
import sys
import shutil
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negconsume")
SPEC = os.path.join("test", "e2e", "consume-contract.spec.ts")
ROUTE = os.path.join("src", "routes", "inventory.ts")
BIG = 1024 * 1024

MUTATIONS = [
    ("M1 le compteur changes ne juge plus (clef inexistante = succes)",
     ROUTE,
     "      if (!r || r.changes !== 1) inconnues.push(ligne.index);",
     "      if (false) inconnues.push(ligne.index);",
     "C2"),
    ("M2 plus d'annulation quand une clef est inconnue (l'ecriture partielle reste)",
     ROUTE,
     '      await db.run("ROLLBACK");\n      en_transaction = false;',
     '      en_transaction = false;',
     "C2"),
    ("M3 l'entree malformee redevient siglee au lieu d'etre refusee",
     ROUTE,
     "      rejetees.push(index);",
     "      void index;",
     "C3"),
    ("M4 la reponse recite le corps de la requete au lieu de relire la base",
     ROUTE,
     "    res.json({ success: true, consumed: touches, items: relues });",
     "    res.json({ success: true, consumed: touches, items: valides.map((l) => ({ id: l.id, name: '', quantity: l.quantite })) });",
     "C1"),
    ("M5 les quantites nulles et negatives redeviennent acceptees",
     ROUTE,
     "      quantite <= 0",
     "      false",
     "C3"),
    ("M7 la borne basse saute (une consommation abusive devient une quantite negative)",
     ROUTE,
     '        "UPDATE inventory SET quantity = CASE WHEN quantity - ? < 0 THEN 0 ELSE quantity - ? END WHERE id = ?",',
     '        "UPDATE inventory SET quantity = quantity - ? - 0 WHERE id = ?",',
     "C6"),
    # ⚠ ANGLE MORT CONSIGNE (et non une mutation): le drapeau `en_transaction`
    # n'est exercé que si une ecriture LEVE apres BEGIN mais avant COMMIT. Aucune
    # voie d'entree connue de la route ne produit cette levee (les payloads sont
    # valides avant le premier UPDATE, et la relécture qui suit le COMMIT ne peut
    # pas lever sur des clefs deja verifiees). Cette mutation ne mordroit donc PAS
    # pour une raison d'absence de voie, et non parce que le drapeau serait
    # inutile: la porte M2 juge l'annulation qui EST atteignable (clef inconnue).
    # Ne pas conclure « garde inutile » sans avoir demandé quelle entree l'atteint.
    ("M8 le compte-rendu `unknown` est collecte et jamais rendu",
     ROUTE,
     '        unknown: inconnues,',
     '        unknown: [],',
     "C2"),
    ("M6 le lot vide n'est plus refuse",
     ROUTE,
     '    return res.status(400).json({ error: "Invalid payload: items must not be empty" });',
     '    res.json({ success: true, consumed: 0, items: [] });\n    return;',
     "C5"),
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
            # copie recursive MANUELLE, jamais copytree: les mots-cles a doubles
            # soulignes sont rognes par le rendu de ce poste (piege consigne).
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
                        os.symlink(s, d)
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
    # la copie doit etre prouvable par les octets: une copie muette ferait juger
    # le vide (piege consigne du 09/09 sur les index « refuses par mesure »).
    for rel in (SPEC, ROUTE):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # ⚠ npx et non sys.executable: python sur un .ts sort un message de PYTHON
    # qui s'est deja lu ici comme « serveur pas pret » (piege consigne).
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
                                "MOTIF %s (%d vus, 1 attendu)"
                                % ("ABSENT" if not hits else "AMBIGU", hits)))
                continue
            write(rel, src.replace(pattern, repl, 1))
            try:
                rc, out = run_spec()
            finally:
                write(rel, src)
            rougit = rc != 0
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
    print("PREUVE NEGATIVE - consume-contract.spec.ts")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-74s rc=%s" % ("OK   " if ok else "ROUGE", label[:74], rc))
        if not ok:
            failed += 1
            for line in (detail or "").splitlines():
                if re.search(r"(Error|expect|Expected|Received|MOTIF|passed|failed)", line):
                    print("        |", line.strip()[:160])
    total = len(results)
    print("-" * 74)
    print("  %d/%d mordent (rc!=0 + la regle visee nommee)" % (total - failed, total))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
