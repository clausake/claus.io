#!/usr/bin/env python3
# Preuve negative du spec purchasing-chain.spec.ts.
#
# Regle du projet : "Un PASS qui ne peut pas devenir FAIL n'est pas une mesure."
# Le spec de la chaine d'approvisionnement est passe VERT. Ce harnais le rejoue
# sur des COPIES ISOLEES de l'arbre (node_modules symlinke) en injectant, une
# par une, les fautes qu'il est cense punir. Chaque mutation DOIT rougir ET
# nommer la ligne fautive.
#
# Piege evite (consigne au Sprint 4.11) : une mutation qui declenche un 500
# general fait rougir TOUT le test, ce qui ne prouvait plus le garde vise. Les
# mutations sont donc choisies SEMANTIQUES (la valeur change) et non syntaxiques.
#
# Les motifs sont DERIVES par regex depuis le disque, jamais copies a la main :
# un motif recopie qui ne correspond plus silencieusement laisse la mutation sans
# effet et le harnais annonce "mord" pour rien (la faute du harnais d'index).
#
# Lancement : python3 scripts/mutation-test-purchasing.py
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
BASE = os.path.dirname(HERE)
SPEC = os.path.join("test", "e2e", "purchasing-chain.spec.ts")
SUCC = os.path.join("src", "routes", "suppliers.ts")
WORK = os.path.join(BASE, "test", "tmp-mutation-purchasing")

# (id, fichier, regex du motif, remplacement, jeton qui doit etre nomme)
#
# ⚠ Ce que la premiere version de ce harnais a revele sur LUI-MEME :
#  - M2 avait un MOTIF ABSENT : la formule avait ete reecrite entre-temps, et un
#    motif recopie a la main qui ne correspond plus laisse la mutation SANS EFFET
#    tout en annoncant un verdict. Les motifs sont donc DERIVES par regex et le
#    harnais rougit si le motif ne tombe qu'une fois (cf. prepare/verify).
#  - M3 a d'abord rendu un 500 « column index out of range » : la mutation etait
#    TROP forte (les 2 parametres de DATE() restaient passes a 3 places). Un 500
#    fait rougir tout le test et ne prouvait donc plus le FILTRE. Une mutation
#    doit changer la SEMANTIQUE en laissant la route VIVANTE.
#  - M5 ne changeait RIEN (rc=0) parce que la route a DEUX gardes d'idempotence :
#    retirer l'un laisse l'autre (le clamp) faire le travail. La mutation est
#    donc RETIRE-E (une mutation qui ne peut pas rougir ne prouve rien), et le
#    double-garde est une force, pas une faiblesse.
DOC = os.path.join("src", "routes", "documents.ts")
MUTATIONS = [
    ("M1 besoin fige a 0 (le defaut d'origine)", SUCC,
     r"besoin_recettes:\s*needs[^\n]*?,",
     "besoin_recettes: 0,",
     "besoin_recettes", 1),
    ("M2 rendement retire du diviseur", SUCC,
     r"raw / \(pct / 100\)",
     "raw / 1",
     "besoin_recettes", 1),
    # Le filtre de date porte DEUX bornes hautes volontairement (une indexable
    # sur mp.date, une precise sur DATE(mp.date)) : elargir l'UNE SEULE est un
    # no-op decide — l'autre continue de borner (defense en profondeur, et
    # c'est ce qui rend la forme robuste devant une date heritee non padee).
    # Une mutation qui ne peut pas rougir ne prouvant rien, M3 elargit la PAIRE
    # et exige 2 occurrences : sans quoi le harnais annoncerait « mord » sur une
    # moitie de filtre seulement (la faute du harnais d'index du 09/09).
    ("M3 les DEUX bornes hautes elargies (le hors-fenetre entre)", SUCC,
     r"<= DATE\(\?, '\+' \|\| \? \|\| ' days'\)",
     "<= DATE(?, '+' || (0 * ? + 9999) || ' days')",
     "besoin_recettes", 2),
    ("M4 le bon ecrit le NOM et non l'id", SUCC,
     r"it\.inventory_id,\n        it\.nom_resolu",
     "it.nom_resolu ?? it.original_name,\n        it.nom_resolu",
     "ligne branche sur un nom et non un id", 1),
    ("M5 le double-encodage n'est plus re-parse", SUCC,
     r"if \(typeof parsed === .string.\) \{",
     "if (false) {",
     "besoin_recettes", 1),
    ("M6 un COMMANDE peut entrer en stock par validation", DOC,
     r'const TYPES_VALISIBLES = \[[^\]]*\];',
     'const TYPES_VALISIBLES = ["FACTURE", "BL", "BON_LIVRAISON", "AVOIR", "COMMANDE"];',
     "ne doit pas se valider"),
    ("M7 double validation de la factrure permise", DOC,
     r'=== "VALIDATED"',
     '=== "IMPOSSIBLE-9"',
     "seconde validation"),
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
    for item in os.listdir(BASE):
        if item in {"node_modules", "dist", "test-results", ".git", "test"}:
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE en os.walk + copy2 : ni shutil.copytree
            # ni ses mots-cles, pour ne jamais dependre d'un identifiant a
            # doubles souignees que ce poste rogne a l'ecriture (piege consigne).
            keep = ("node_modules", "dist", "test-results", ".git", "test")
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                              if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith(".log") or fn.endswith(".pyc"):
                        continue
                    if fn.startswith("__") and fn.endswith("__"):
                        continue  # cache de bytecode
                    shutil.copy2(os.path.join(dirpath, fn),
                                 os.path.join(dst, rel, fn))
        else:
            shutil.copy2(src, dst)
    os.symlink(os.path.join(BASE, "node_modules"), os.path.join(WORK, "node_modules"))
    os.makedirs(os.path.join(WORK, "test", "e2e"), exist_ok=True)
    shutil.copy2(os.path.join(BASE, SPEC), os.path.join(WORK, SPEC))
    # un seul spec : le harnais juge CE spec, pas la suite entiere
    for other in os.listdir(os.path.join(WORK, "test", "e2e")):
        if other != os.path.basename(SPEC):
            os.remove(os.path.join(WORK, "test", "e2e", other))


def run_spec():
    npx = shutil.which("npx")
    assert npx, "npx introuvable"
    proc = subprocess.run([npx, "playwright", "test", SPEC, "--reporter=line"],
                         cwd=WORK, capture_output=True, text=True, timeout=300)
    return proc.returncode, ((proc.stdout or "") + (proc.stderr or ""))


def main():
    prepare_work()
    originals = {}
    results = []
    try:
        for mut in MUTATIONS:
            originals.setdefault(mut[1], read(mut[1]))

        rc, out = run_spec()
        if rc != 0:
            print("LIGNE DE BASE ROUGE -- la preuve serait sans objet.")
            print(out[-3000:])
            return 2
        results.append(("ligne de base (attendu VERT)", 0, True, ""))

        for mut in MUTATIONS:
            name, rel, pattern, repl, token = mut[:5]
            attendu = mut[5] if len(mut) > 5 else 1
            src = originals[rel]
            hits = re.findall(pattern, src)
            if len(hits) != attendu:
                results.append((name, -1, False,
                                "MOTIF %s (%d vus, %d attendu(s))"
                                % ("ABSENT" if not hits else "AMBIGU",
                                   len(hits), attendu)))
                continue
            # count=0 : la PAIRE de bornes doit etre mutée d'un coup (M3), sinon
            # on ne jugerait qu'une moitie du filtre.
            mutated, n = re.subn(pattern, lambda _: repl, src)
            if n != attendu or mutated == src:
                results.append((name, -1, False, "SUB SANS EFFET"))
                continue
            write(rel, mutated)
            rc, out = run_spec()
            rougit = rc != 0
            nomme = bool(re.search(r"spec\.ts:\d+:\d+", out)) and (token.lower() in out.lower())
            ok = rougit and nomme
            results.append((name, rc, ok, "" if ok else out[-2500:]))
            write(rel, src)

        rc, out = run_spec()
        results.append(("restaure (attendu VERT)", rc, rc == 0,
                        "" if rc == 0 else out[-1500:]))
    finally:
        shutil.rmtree(WORK, ignore_errors=True)

    print()
    print("=" * 74)
    print("PREUVE NEGATIVE - purchasing-chain.spec.ts")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-50s rc=%s" % ("OK   " if ok else "ROUGE", label, rc))
        if not ok:
            failed += 1
            for line in (detail or "").splitlines():
                if re.search(r"(Error|expect|Expected|Received|MOTIF|spec\.ts:\d)", line):
                    print("        |", line.strip()[:150])
    total = len(results)
    print("-" * 74)
    print("  %d/%d mordent (rc=1 + le check vise nomme)" % (total - failed, total))
    return 1 if failed else 0


sys.exit(main())
