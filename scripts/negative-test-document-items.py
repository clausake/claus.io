#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `document-items-contract.spec.ts` (Sprint 9).

La regle du depot (PHASES.md): « un PASS qui ne peut pas devenir FAIL n'est
pas une mesure ». Chaque mutation est la NEGATION EXACTE d'une regle du
correctif; on exige rc != 0 ET le token du check vise NOMME dans la sortie.
Sans la seconde condition, un defaut d'infrastructure ferait « rougir » une
mutation qui ne mord rien et le harnais se declarerait prouve alors qu'il
n'a rien juge.

Le fond de ce spec: `document_items` a DEUX portes d'ecriture (la facture et
le bon de commande) et DEUX liseurs de decision (la validation de facture, la
reception du bon). Les huit specs herites jugeoient la colonne de prix EN
AVAL; aucune ne postait une ligne invalide a la porte d'entree. Si une de ces
mutations ne mord pas, c'est que la porte n'est pas reellement garde: angle
mort consigne au vert, et il doit rougir.

  M1  le bon de commande accepte de nouveau une quantite NEGATIVE
  M2  la clef d'article n'est plus verifiee contre la base (le defaut G:
      200 + ligne ORPHELINEE qui ne pourra jamais bouger le stock)
  M3  une clef absente redevient une ligne libre POUR LE BON (un bon sans
      clef ne se receptionne jamais et bloque la cloture pour toujours)
  M4  un montant indefendable redevient un 0 en base (le defaut I3: un
      ingredient gratuit au devis, un tarif que le chef croit releve)
  M5  le brut n'est plus conserve: la ligne sans tarif DEVIENT MUETTE (ni la
      creation ni /validate ne peuvent plus la nommer)
  M6  /validate efface de nouveau le PRIX DE REFERENCE quand la ligne n'en a
      pas (le NULL silencieux de node-sqlite3 sur une colonne NULLABLE)
  M7  une ligne sans designation redevient acceptee (invisible au GET)
  M8  le garde « zero ligne exploitable » saute: le 200 sur facture vide
  M9  le compte-rendu devient MUET (les lignes ecartees ne sont plus comptees)
  M10 le nom ECIT redevient le nom SAISI au lieu du nom REEL (le bon s'imprime
      dans la langue du chef et se receptionne contre l'inventaire)

Lancement: python3 scripts/negative-test-document-items.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negdocitems")
SPEC = os.path.join("test", "e2e", "document-items-contract.spec.ts")
SHARED = os.path.join("src", "shared", "document-items.ts")
DOCS = os.path.join("src", "routes", "documents.ts")
SPRI = os.path.join("src", "routes", "suppliers.ts")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token du check qui DOIT rougir)
MUTATIONS = [
    ("M1 le bon accepte une quantite negative",
     SPRI,
     "    quantiteMin: 1e-9,",
     "    quantiteMin: -1e9,",
     "K6 quantite -5 -> 400 et non 0"),
    ("M2 la clef d'article n'est plus verifiee contre la base",
     SHARED,
     "      if (!trouve) {",
     "      if (false) {",
     "K3 une clef inexistante est refusee"),
    ("M3 une clef absente redevient libre pour le bon",
     SPRI,
     "    exigerClef: true,",
     "    exigerClef: false,",
     "K6b une clef absente est une FAUTE pour un bon"),
    ("M4 un montant indefendable redevient un 0 en base",
     SHARED,
     "        prixRejete = true;\n        prixBrut = brutPourTrace(l.unit_price);",
     "        prix = 0;",
     "K4_LE_MONTANT_INDEFENDABLE_NE_DEVIENT_PAS_UN_ZERO"),
    ("M5 le brut n'est plus conserve (la ligne sans tarif devient muette)",
     SHARED,
     "        prixBrut = brutPourTrace(l.unit_price);",
     "        prixBrut = null;",
     "K4_LE_BRUT_RESTE_FIDELE_AU_PAPIER"),
    ("M6 /validate efface le prix de reference d'une ligne sans tarif",
     DOCS,
     "    if (item.unit_price !== null && item.unit_price !== undefined) {",
     "    if (true) {",
     "K5_LE_PRIX_DE_REFERENCE_SURVIT_A_UNE_LIGNE_SANS_TARIF"),
    ("M7 une ligne sans designation redevient acceptee",
     SHARED,
     '    if (clef === null && nomTexte === "") {',
     "    if (false) {",
     "K3c une ligne sans designation est refusee"),
    ("M8 le garde de lot vide saute (zero ligne redevient un 200)",
     DOCS,
     "  if (ecrites.length === 0) {",
     "  if (false) {",
     "K1_A lignes telles que handleAddItem les cree -> 400"),
    ("M9 le compte-rendu devient muet (lignes ecartees non comptees)",
     DOCS,
     "      ignorees: rejetees.length,\n      rejetees,",
     "      ignorees: 0,\n      rejetees: [],",
     "K1_B la ligne fautive est COMPTee"),
    ("M10 le nom ecit redevient le nom saisi et non le nom reel",
     SPRI,
     "        it.nom_resolu ?? it.original_name,",
     "        it.original_name,",
     "K6d le nom ECIT est le nom REEL de l'article"),
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
            # mots-cles a doubles soulignes sont rognes par le rendu de ce
            # poste (piege consigne) et une copie muette ferait conclure a une
            # absence de donnees.
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
    # UN seul spec: le harnais juge CE spec, pas la suite entiere. Un autre
    # spec qui rougit pour une autre raison rendrait le verdict inlisible.
    for other in os.listdir(os.path.join(WORK, "test", "e2e")):
        if other != os.path.basename(SPEC):
            os.remove(os.path.join(WORK, "test", "e2e", other))
    # la copie est prouvable: un octet qui diverge rend un verdict sans objet
    for rel in (SPEC, SHARED, DOCS, SPRI):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # ⚠ npx et non sys.executable: lancer python sur un .ts produit un
    # message de PYTHON qui ferait rougir la ligne de base pour une faute
    # d'harnais.
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
    print("PREUVE NEGATIVE - document-items-contract.spec.ts")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-72s rc=%s" % ("OK   " if ok else "ROUGE", label[:72], rc))
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
