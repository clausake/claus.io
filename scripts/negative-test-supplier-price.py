#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `supplier-price-contract.spec.ts`.

La regle du projet (PHASES.md): « un PASS qui ne peut pas devenir FAIL n'est pas
une mesure ». Apres chaque check ajoute, la faute correspondante est injectee
dans une COPIE ISOLEE de l'arbre (node_modules symlinke) et on exige:
  - rc != 0  (le spec rougit),
  - ET la regle visee NOMMEE dans la sortie (le token d'`expect` du check).
Sans la seconde condition, un defaut d'infrastructure (serveur qui ne monte pas,
npx absent) ferait « rougir » une mutation qui ne mord rien: le harnais se
declarerait prouve alors qu'il n'a rien juge.

Chaque mutation est la NEGATION EXACTE d'une regle du correctif:

  M1 les bornes du prix sautent : un prix NEGATIF repart en base (et, avant le
     correctif d'election, il gagnait la comparaison des fournisseurs).
  M2 la cle etrangere fournisseur n'est plus verifiee : le 200 revient sur une
     donnee que le JOIN du GET avale (le client croit avoir enregistre).
  M3 la cle etrangere article n'est plus verifiee : meme degat, autre cle.
  M4 l'UPDATE est juge sans le compteur de lignes touchees : le 404 disparait.
  M5 la reponse recite le corps de la requete au lieu de relire la base.
  M6 une ligne NON COMPARABLE (calculated_price_per_ref a null) peut de nouveau
     etre ELUE au meilleur prix.
  M7 le predicat d'election ne borne plus le prix a 0 (le negatif redevient
     electionable).

⚠ Une mutation qui NE MORD PAS n'est pas automatiquement un harnais faible: elle
signale soit un garde REDONDANT, soit un garde dont AUCUNE voie de commande
n'atteint l'entree (angle mort). C'est le verdict `NON_MORD`, rendu comme un
ECHEC du lot: il exige une re-mesure, pas un heritage. (C'est exactement ce que
la lecon de Sprint 5 impose: « une mesure qui contredit un verdict consigne doit
etre RE-MESUREE et le consensus corrige, pas herite ».)

Lancement: python3 scripts/negative-test-supplier-price.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negspri")
SPEC = os.path.join("test", "e2e", "supplier-price-contract.spec.ts")
ROUTE = os.path.join("src", "routes", "supplierprices.ts")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token qui DOIT apparaître dans la sortie)
MUTATIONS = [
    ("M1 les bornes du prix sautent (le prix negatif revient en base)",
     ROUTE,
     "  if (Number.isNaN(prix) || prix < 0 || prix > 1_000_000) refused.push(\"raw_unit_price\");",
     "  if (Number.isNaN(prix)) refused.push(\"raw_unit_price\");",
     "S2_PRIX_NEGATIF_REFUSE"),
    ("M2 la cle etrangere fournisseur n'est plus verifiee",
     ROUTE,
     '  if (!fournisseur) refused.push("supplier_id");',
     "  if (false) refused.push(\"supplier_id\");",
     "S4_CLE_ETRANGERE_FANTOME_REFUSEE"),
    ("M3 la cle etrangere article n'est plus verifiee",
     ROUTE,
     '  if (!inv) refused.push("inventory_id");',
     "  if (false) refused.push(\"inventory_id\");",
     "S4b_ARTICLE_FANTOME_REFUSE"),
    # Le bloc de deux lignes est UNIQUE: le motif court `if (resultat?.changes`
    # apparait DEUX fois (UPDATE et INSERT) et un motif ambigu serait refuse
    # par le harnais — un motif qui matche deux fois ne nie rien de precis.
    ("M4 le compteur de lignes touchees ne juge plus l'UPDATE (le 404 disparait)",
     ROUTE,
     "    if (resultat?.changes !== 1) {\n"
     '      return res.status(404).json({ status: "error", message: "Prix fournisseur introuvable" });',
     "    if (false) {\n"
     '      return res.status(404).json({ status: "error", message: "Prix fournisseur introuvable" });',
     "S5_UPDATE_ZERO_LIGNE_EST_UN_404"),
    ("M5 la reponse recite le client au lieu de relire la base",
     ROUTE,
     "    item: relu,",
     "    item: req.body,",
     "R_LA_REPONSE_NE_RECITE_PAS_LE_CORPS_DE_LA_REQUETE"),
    ("M6 une ligne non comparable peut de nouveau etre elue",
     ROUTE,
     "      if (!election(sp.calculated_price_per_ref)) continue;",
     "      if (false) continue;",
     "S6_UNE_LIGNE_NON_CONVERTIBLE_NE_PEUT_ETRE_ELUE"),
    # ⚠ LE TOKEN EST CELUI DU CHECK QUI DETECTE REELLEMENT LA FAUTE. Le predicat
    # `v >= 0` ne peut etre atteint que par une ligne HERITEE deja en base (les
    # trois portes d'ecriture la rejettent avant): c'est donc S6c, la seule
    # voie de commande qui l'exerce, qui rougit — et non S6. Exiger le token de
    # S6 aurais declare « ne mord pas » une mutation qui mord, l'inverse exact
    # du faux VERT que ce harnais chasse.
    ("M7 le predicat d'election ne borne plus le prix (le negatif herite redevient electionable)",
     ROUTE,
     '      typeof v === "number" && Number.isFinite(v) && v >= 0;',
     '      typeof v === "number" && Number.isFinite(v);',
     "S6c_UN_PRIX_HERITE_NEGATIF_NE_PEUT_ETRE_ELUS"),
    # L'autre moitie de l'election, jugee par S6b: retirer la COMPARAISON de
    # prix laisse gagner la premiere ligne rencontree. Sans cette mutation, un
    # correctif qui elirait « la premiere ligne valide » satisferait S6, S6c,
    # J5 et J7 — et le cuisinier acheterait au mauvais tarif. Un check
    # unidirectionel ne prouve que la moitie qu'il arpente.
    ("M8 l'election ne compare plus les prix (la premiere ligne gagne)",
     ROUTE,
     "      if (bestPriceEntry === null ||\n"
     "          sp.calculated_price_per_ref < (bestPriceEntry.calculated_price_per_ref as number)) {",
     "      if (bestPriceEntry === null) {",
     "S6b_LELU_EST_LE_PRIX_LE_PLUS_BAS"),
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
    # UN seul spec: le harnais juge CE spec, pas la suite entiere (les autres
    # specs rougiraient pour des raisons qui ne regardent pas ce contrat).
    for other in os.listdir(os.path.join(WORK, "test", "e2e")):
        if other != os.path.basename(SPEC):
            os.remove(os.path.join(WORK, "test", "e2e", other))
    # la copie est prouvable: un octet qui diverge rend un verdict sans objet
    for rel in (SPEC, ROUTE):
        a = open(os.path.join(BASE, rel), "rb").read()
        b = open(os.path.join(WORK, rel), "rb").read()
        assert a == b, "copie divergente sur %s" % rel


def run_spec():
    # ⚠ npx et non sys.executable: lancer python sur un .ts produit un message
    # de PYTHON qui fait rougir la ligne de base pour une faute d'harnais.
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
    print("PREUVE NEGATIVE - supplier-price-contract.spec.ts")
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
