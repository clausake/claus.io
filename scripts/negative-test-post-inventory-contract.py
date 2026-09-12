#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `post-inventory-contract.spec.ts` (POST /api/inventory).

Meme loi que partout dans ce depot (PHASES.md) : « un PASS qui ne peut pas
devenir FAIL n'est pas une mesure ». Chaque mutation nie EXACTEMENT une ligne
qui porte une regle du contrat, dans une COPIE ISOLEE de l'arbre
(node_modules symlinké), et le harnais exige DEUX choses :
  - rc != 0          (le spec rougit),
  - ET le test vise NOMME dans la sortie.
Sans la seconde, une panne d'infrastructure (serveur qui ne monte pas, npx
absent, port vole par un fils du run precedent) ferait « rougir » une mutation
qui ne mord rien: le harnais se declareroit prouve sans rien avoir juge.

Les mutations et leurs juges :
  M1 le texte redevient accepte dans une colonne REAL            -> P2 / P6
     (c'est le defaut le plus cher: la ligne survit en base ET disparait de
      /api/alerts, le badge de l'auditeur devient une etiquette inventee).
  M2 le nom blanc/non-str redevient accepte                      -> P4
  M3 l'enum du statut s'ouvre (le 'normal' de HaccpModules passe)-> P3
  M4 la clef deja prise redevient un 500 « Failed to create »   -> P5
  M5 le `null` serialise redevient « champ absent » (defaut
     compatissant sur une ordure)                                -> P8
  M6 le compte-rendu recite le corps de la requete               -> P0 / P7
     au lieu de relire la base.
  M7 le defaut de `quantity` revient a `undefined` (la voie
     d'ajout rapide de l'ecran facture replonge en 500)          -> P1
  M8 le statut derive est remplace par une valeur figee          -> P3
  M9 la reponse d'omission (500 fourre) revient sur toute        -> P8
     saisie refusee.

ANGLE MORT CONSIGNE (non mute, et la raison est dite) : le `500` final du
`catch` de la route ne peut plus etre atteint par aucune voie d'entree connue
(tout ce qui pouvait jeter au binding est refuse en amont par les 400). Lui
imposer une mutation ne mordroit PAS parce que la voie de commande n'existe
pas, et non parce que la garde serait inutile. Ne jamais conclure « garde
inutile » sans avoir demande quelle entree l'atteint — c'est ainsi que la porte
3 des prix fournisseurs (Sprint 7) a ete trouvee.

Lancement : python3 scripts/negative-test-post-inventory-contract.py
Le code de sortie EST le verdict : 0 = toutes les mutations mordent.
"""
import os
import re
import sys
import shutil
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negpostinv")
SPEC = os.path.join("test", "e2e", "post-inventory-contract.spec.ts")
ROUTE = os.path.join("src", "routes", "inventory.ts")
SHARED = os.path.join("src", "shared", "inventory-fields.ts")
BIG = 1024 * 1024

MUTATIONS = [
    ("M1 le texte redevient accepte dans une colonne REAL",
     ROUTE,
     "  if (quantite === undefined || !estNombreExploitable(quantite, COLONNES_NUM.quantity.min, COLONNES_NUM.quantity.max)) {",
     "  if (false) {",
     "P2"),
    ("M2 le nom blanc ou non-str redevient accepte",
     SHARED,
     "  if (propre === \"\") return undefined;",
     "  if (false) return undefined;",
     "P4"),
    ("M3 l'enum du statut s'ouvre (le 'normal' de l'ecran HACCP passe)",
     ROUTE,
     "  } else if (typeof brutS !== \"string\" || !STATUTS.includes(brutS.trim().toLowerCase() as (typeof STATUTS)[number])) {",
     "  } else if (false) {",
     "P3"),
    ("M4 la clef deja prise redevient un 500 « Failed to create »",
     ROUTE,
     "  if (existeDeja) {",
     "  if (false) {",
     "P5"),
    # ⚠ M5 A ETE RETIREE, ET LE MOTIF EST UNE MESURE et non une preference.
    # Elle nioit le `if (brut === null) return undefined;` du helper numerique.
    # Elle a rendu `9 passed` DEUX fois, avec un cas `null` par champ et les
    # formes d'origine `Infinity`/`NaN` sous la main. La raison, etablie en
    # rejouant le predicat: sous cette mutation le helper rend `Number.NaN` au
    # lieu de `undefined`, et la ROUTE, juste en dessous, refuse DEJA tout
    # `!Number.isFinite(...)` par son propre `refus.push(col)`. Les deux mondes
    # produisent donc le MEME verdict observable (400 + refused:[champ]) :
    # aucune entree ne peut les distinguer, et ce n'est pas un harnais faible —
    # c'est une garde REDONDANTE (defence en profondeur: la route refuse ce que
    # le helper laisse passer, et le helper refuse ce que la route re-teste).
    # Une garde redondante n'est pas une garde inutile: elle est ce qui fait
    # qu'un changement dans l'une des deux moities ne rouvre pas la faille. Mais
    # elle N'EST PAS JUCEABLE par mutation, et le consigner vaut mieux qu'une
    # mutation forcee qui « mordroit » par un effet de bord non demande.
    # La distinction `null` vs absent reste jugee, elle, PAR LE SPEC (P8): le
    # `null` est refuse et l'OMISSION est acceptee avec le defaut du schema —
    # les deux SEULS verdicts observables de cette regle.
    ("M5 le defaut TEXTE d'une colonne non-numerique saute (l'unite 'kg' rendue obligatoire)",
     SHARED,
     "  if (!present) return defaut;\n  if (brut === null) return undefined;\n  return lireTexte(brut, maxLen);",
     "  if (!present) return undefined as string;\n  if (brut === null) return undefined;\n  return lireTexte(brut, maxLen);",
     "P8"),
    ("M6 la reponse recite le corps de la requete au lieu de relire la base",
     ROUTE,
     "  res.json({ status: \"success\", id: relu.id, ...relu });",
     "  res.json({ status: \"success\", id: itemId, name: req.body?.name, quantity: req.body?.quantity,\n    minStock: req.body?.minStock, unit: req.body?.unit, category: req.body?.category,\n    unit_price: req.body?.unit_price, status: req.body?.status, yield_percent: req.body?.yield_percent });",
     "P7"),
    ("M7 le defaut de `quantity` revient a `undefined` (l'ajout rapide replonge en 500)",
     SHARED,
     "  if (!present) return defaut;\n  if (brut === null) return undefined;\n  return lireNombre(brut);",
     "  if (!present) return undefined as number;\n  if (brut === null) return undefined;\n  return lireNombre(brut);",
     "P1"),
    ("M8 le statut derive est fige au lieu d'etre calcule depuis les quantites",
     ROUTE,
     "    statut = statutDeparse(quantite as number, minimum as number);",
     "    statut = \"active\";",
     "P3"),
    ("M9 le refus notifie redevient un 500 fourre",
     ROUTE,
     "    statut = brutS.trim().toLowerCase();\n  }\n\n  if (refus.length > 0) {",
     "    statut = brutS.trim().toLowerCase();\n  }\n\n  if (false) {",
     "P8"),
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
            # copie recursive MANUELLE: les mots-cles a doubles soulignes sont
            # rognes par le rendu de ce poste (piege consigne) et une copie
            # muette ferait conclure a une absence de donnees.
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
    # la copie est prouvable par les octets, sinon le harnais jugeroit le vide
    for rel in (SPEC, ROUTE, SHARED):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # npx et non sys.executable: python sur un .ts sort un message de PYTHON
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
            print(out[-4000:])
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
    print("PREUVE NEGATIVE - post-inventory-contract.spec.ts")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-74s rc=%s" % ("OK   " if ok else "ROUGE", label[:74], rc))
        if not ok:
            failed += 1
            for line in (detail or "").splitlines():
                if re.search(r"(Error|expect|Expected|Received|MOTIF|passed|failed)", line):
                    print("        |", line.strip()[:170])
    total = len(results)
    print("-" * 74)
    print("  %d/%d mordent (rc!=0 + la regle visee nommee)" % (total - failed, total))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
