#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du spec `supplier-import-contract.spec.ts`.

La regle du projet (PHASES.md): « un PASS qui ne peut pas devenir FAIL n'est pas
une mesure ». Chaque mutation est la NEGATION EXACTE d'une regle du correctif de
la voie d'import; on exige rc != 0 ET la regle visee NOMMEE dans la sortie (le
token d'`expect`). Sans la seconde condition, un defaut d'infrastructure ferait
« rougir » une mutation qui ne mord rien et le harnais se declarerait prouve
alors qu'il n'a rien juge.

Le fond de ce spec, juge ici mutation par mutation: la voie d'import est la
SECONDE porte d'ecriture des prix fournisseurs et aboutit au MEME liseur de
decision (GET .../comparison designe le meilleur fournisseur). Si une de ces
mutations ne mord pas, le contrat de la voie unitaire ne prouve RIEN de cette
voie-la: c'est l'angle mort consigne au vert, et il doit rougir.

  M1  la cle etrangere fournisseur n'est plus verifiee (le 200 sur donnee perdue)
  M2  le prix negatif est de nouveau accepte par l'import
  M3  l'analyse fabrique de nouveau un 0 sur un texte (`Number(x) || 0`)
  M4  la comparaison elit de nouveau une ligne au prix fabrique
  M5  l'unite non defendable retrouve le facteur 1 herite (le x1000 muet)
  M6  l'import FABRIQUE le badge de verification sur facture
  M7  zero ligne exploitable redevient un 200 (le PASS creux du bouton du chef)
  M8  les lignes ignorees ne sont plus nommees (le 400 muet)

Lancement: python3 scripts/negative-test-supplier-import.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negspri-import")
SPEC = os.path.join("test", "e2e", "supplier-import-contract.spec.ts")
ROUTE = os.path.join("src", "routes", "supplierprices.ts")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token qui DOIT apparaitre dans la sortie)
MUTATIONS = [
    ("M1 la cle etrangere fournisseur n'est plus verifiee",
     ROUTE,
     '    return res.status(400).json({\n'
     '      status: "error",\n'
     '      message: "Fournisseur inconnu : l\'import n\'a rien ecrit.",\n'
     '      refused: ["supplier_id"],\n'
     '    });',
     '    return res.json({ status: "success", importees: 0, ignorees: 0, rejetees: [] });',
     "J2_CLE_ETRANGERE_FANTOME_REFUSEE"),
    ("M2 le prix negatif est accepte par l'import",
     ROUTE,
     '    if (!Number.isFinite(prix) || prix < 0 || prix > 1_000_000) {\n'
     '      rejetees.push({ index, raison: "prix_invalide" });\n'
     '      continue;\n'
     '    }',
     '    if (!Number.isFinite(prix)) {\n'
     '      rejetees.push({ index, raison: "prix_invalide" });\n'
     '      continue;\n'
     '    }',
     "J4_PRIX_NEGATIF_REFUSE_PAR_IMPORT"),
    ("M3 l'analyse fabrique un 0 sur un prix non numerique",
     ROUTE,
     "      raw_price: prix,",
     "      raw_price: prix === null ? 0 : prix,",
     "J5_UN_TEXTE_NE_DEVIENT_PLUS_UN_PRIX_A_ZERO"),
    # ⚠ LE TOKEN EST CELUI DU CHECK QUI DETECTE REELLEMENT LA FAUTE, pas celui
    # du titre de la mutation. Retirer le `continue` d'electionabilite fait
    # rougir J7 (la ligne non comparable est elue), J5 ne rougit PAS: sous cette
    # mutation seule, l'analyse rend deja null et confirm refuse la ligne, donc
    # aucun prix fabrique n'atteint la comparaison. Exiger le token de J5 aurais
    # rendu « ne mord pas » une mutation qui mord — l'inverse exact du faux VERT
    # que ce harnais existe pour chasser.
    ("M4 la comparaison elit une ligne non comparable",
     ROUTE,
     "      if (!election(sp.calculated_price_per_ref)) continue;",
     "      if (false) continue;",
     "J7_UNE_LIGNE_NON_COMPARABLE_NE_PEUT_ETRE_ELUE"),
    # ⚠ LA MUTATION DU MINIMUM (elle laisserait gagner la premiere ligne
    # rencontree) n'est PAS ici: son oracle, le check S6b, vit dans
    # test/e2e/supplier-price-contract.spec.ts et ce harnais ne lance QUE le
    # sien (un autre spec qui rougit pour une autre raison rendrait le verdict
    # inlisible). Elle est done jugee par scripts/negative-test-supplier-price.py
    # (M8), la ou son check existe. Une mutation deposee dans le mauvais harnais
    # se presente comme un « ne mord pas » alors qu'elle mord — fausse alerte.
    ("M5 l'unite non defendable retrouve le facteur 1 herite",
     ROUTE,
     "    const calc = defendable\n"
     "      ? calculatePricePerRef(prix, unitFournisseur, unitInventaire)\n"
     "      : null;",
     "    const calc = calculatePricePerRef(prix, unitFournisseur, unitInventaire || \"kg\");",
     "J7_INCONVERTIBLE_REND_NULL_ET_NON_UN_FACTEUR_1"),
    ("M6 l'import fabrique le badge de verification sur facture",
     ROUTE,
     "          \"UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 0 WHERE id = ?\",",
     "          \"UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 1 WHERE id = ?\",",
     "J8_UN_IMPORT_NE_VERIFIE_PAS_UNE_FACTURE"),
    ("M7 le garde de lot vide saute (zero ligne redevient un 200)",
     ROUTE,
     "  if (aEcrire.length === 0) {",
     "  if (false) {",
     "J9_ZERO_LIGNE_EXPLOITABLE_N_EST_PAS_UN_SUCCES"),
    ("M8 les lignes ignorees ne sont plus nommees",
     ROUTE,
     "      rejetees.push({ index, raison: \"prix_non_numerique\" });",
     "      rejetees.push({ index });",
     "J9_LES_RAISONS_SONT_NOMMEES_ET_INDEXEES"),
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
    for rel in (SPEC, ROUTE):
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
    print("PREUVE NEGATIVE - supplier-import-contract.spec.ts")
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
