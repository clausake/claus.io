#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `documents-validate-contract.spec.ts` (3e porte).

La regle du projet (PHASES.md): « un PASS qui ne peut pas devenir FAIL n'est pas
une mesure ». Chaque mutation est la NEGATION EXACTE d'une regle du correctif de
la validation de facture; on exige rc != 0 ET le token du check QUI DETECTE
REELLEMENT la faute (pas le titre de la mutation — une mutation qui mord mais
dont on exige le mauvais token se presente comme un « ne mord pas », ce qui est
l'inverse exact du faux VERT chasse par ce harnais).

Pourquoi CE harnais et pas seulement la sonde: la sonde
scripts/probe-documents-validate-contract.mjs a MESURE les defauts une fois,
mais elle ne rougit pas dans CI. Sans porte + mutations, un refactor peut
rouvrir le trou (le `Number(item.unit_price)` nu) et rien ne le verra.

  M1  le prix negatif de facture redevient un tarif (la borne de prix saute,
     MAIS le texte reste traite comme absent: on ne touche pas a la branche M3)
  M2  les lignes ecartees ne sont plus NOMMEES (le compte-rendu muet)
  M3  le montant non numerique refait MEURIR la validation en 500 (le trou
     d'origine, `Number(x)` jete sur un binding NaN)
  M4  le REPLI de la comparaison recite le prix de reference sans le juger
  M5  le predicat du repli ne borne plus le prix (le negatif ressort)

Lancement: python3 scripts/negative-test-documents-validate.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negdocs")
SPEC = os.path.join("test", "e2e", "documents-validate-contract.spec.ts")
DOCS = os.path.join("src", "routes", "documents.ts")
SPRI = os.path.join("src", "routes", "supplierprices.ts")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token du check qui doit rougir)
MUTATIONS = [
    ("M1 le prix negatif de facture redevient un tarif fournisseur",
     DOCS,
     "      const prixValide = prixOuNul(item.unit_price);",
     "      let prixValide: number | null = Number(item.unit_price);\n"
     "      if (Number.isNaN(prixValide)) prixValide = null;",
     "V2_AUCUN_TARIF_NE_SORT_D_UN_MONTANT_NEGATIF"),
    ("M2 les lignes de tarif ecartees ne sont plus nommees au chef",
     DOCS,
     "      } else if (supplierId && item.unit_price !== null && item.unit_price !== undefined) {",
     "      } else if (false) {",
     "V2_LA_LIGNE_REJETEE_EST_NOMMEE_ET_NON_TUEE"),
    ("M3 un montant non numerique refait meuurir la validation en 500",
     DOCS,
     "      const prixValide = prixOuNul(item.unit_price);",
     "      const prixValide = Number(item.unit_price);",
     "V3_UN_TEXTE_N_EST_UN_500_SERVEUR"),
    ("M4 le repli de la comparaison recite le prix de reference sans le juger",
     SPRI,
     "      best_price: prix_defendable ? bestPrice : null,",
     "      best_price: bestPrice,",
     "V5_LE_REFLI_D_UN_PRIX_DE_REFERENCE_CORROMPU_EST_UN_AVEU"),
    ("M5 le predicat du repli ne borne plus le prix (le negatif ressort)",
     SPRI,
     "    const prix_defendable = election(bestPrice);",
     '    const prix_defendable = typeof bestPrice === "number";',
     "V5_AUCUN_NOMBRE_DE_DEVIS_NEGATIF_NE_SORT_DU_REPLI"),
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
    keep = ("node_modules", "dist", "test-results", ".git", "test", "__pycache__")
    for item in os.listdir(BASE):
        if item in keep:
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE (os.walk + copy2), jamais copytree: les
            # mots-cles a doubles soulignes sont rognes par le rendu de ce poste
            # (piege consigne) et une copie muette fait conclure a une absence
            # de donnees.
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                               if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith(".log") or fn.endswith(".pyc"):
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
    # la copie est prouvable: un octet qui diverge rend un verdict sans objet
    for rel in (SPEC, DOCS, SPRI):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # ⚠ npx et non sys.executable: lancer python sur un .ts produit un message
    # de PYTHON qui ferait rougir la ligne de base pour une faute d'harnais.
    npx = shutil.which("npx")
    assert npx, "npx introuvable"
    proc = subprocess.run([npx, "playwright", "test", SPEC, "--reporter=line"],
                          cwd=WORK, capture_output=True, text=True, timeout=900)
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
    print("PREUVE NEGATIVE - documents-validate-contract.spec.ts")
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
