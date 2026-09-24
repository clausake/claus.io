#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Capteur des sondes sans porte (la famille de l'article 4 de
docs/audit-2026-09-20.md, deplacee du cote du CAPTEUR).

Un capteur dont la liste est FIGEE ne peut pas dire qu'une sonde NEUVE lui
echappe: c'est le defaut de l'article 4, rejoue sur le capteur lui-meme. Donc
la liste des cibles est PRISE SUR LE DISQUE (scripts/probe-*, scripts/negative-test-*),
jamais recopiee d'une liste a la main.

PORTEE, au sens strict de la regle 6 d'AGENTS.md: une porte n'est une porte que
si elle est citee aux DEUX endroits (package.json ET le DEFAUT de
run-all-gates.py), ou jouee par le conducteur scripts/_joue_orphelines.py:
  PORTEE           = dans le DEFAUT (via sa porte verify: ou son nom) et dans
                    package.json, OU portee par le conducteur
  DEMI-PORTEE      = citee par UN SEUL des deux textes (package.json sans
                    DEFAUT: jouee seulement si un agent y pense)
  PORTEE_PAR_TIERS = citee par un autre script du depot, pas par une porte
  ORPHELINE        = citee par PERSONNE hors de son propre nom
Le reste qui est Hors Loi par contrat (les preuves de harnais qui exigent des
ports LIBRES et relancent d'autres portes: la metreaux DEFAUT les ferait
rougir pour la mauvaise raison) est CONSIGNE dans docs/reference-orphelines.json
sous la cle hors_loi, avec sa raison, pas silencie.

rc: 0 = conforme a la reference | 2 = une sonde sans porte est APPARUE depuis
la reference (le capteur a un capteur: son verdict est juge par --figer qui
exige le geste du pilote) | 3 = reference absente/vide = capteur mort | 5 = le
capteur n'a pas pu lire le disque.
"""
import json
import os
import re
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHEMIN_REF = os.path.join("docs", "reference-orphelines.json")
QUOTES = ('"', "'")


def cites_par(nom, exclus):
    """Quels fichiers du perimetre citent ce nom (hors de lui-meme)."""
    r = subprocess.run(
        ["grep", "-rl", "--include=*.py", "--include=*.json",
         "--include=*.mjs", nom, "scripts", "package.json"],
        cwd=RACINE, capture_output=True, text=True)
    if r.returncode not in (0, 1):
        return None
    out = []
    for c in r.stdout.split():
        if os.path.basename(c) == nom:
            continue
        if any(x in c for x in exclus):
            continue
        out.append(c)
    return sorted(out)


def cite(un, texte):
    return any(q + un + q in texte for q in QUOTES) or ("scripts/" + un) in texte


def inventaire():
    dossiers = os.path.join(RACINE, "scripts")
    try:
        noms = sorted(f for f in os.listdir(dossiers)
                      if (f.startswith("probe-") or f.startswith("negative-test-"))
                      and f.endswith((".mjs", ".py"))
                      and not f.startswith("_") and "pycache" not in f)
    except OSError as exc:
        print("CAPTEUR MORT: impossible de lire scripts/: " + str(exc))
        sys.exit(5)
    if not noms:
        print("CAPTEUR MORT: 0 sonde sur le disque, ce n'est pas possible")
        sys.exit(3)

    def lire(p):
        return open(os.path.join(RACINE, p), encoding="utf-8").read()

    defaut = lire(os.path.join("scripts", "run-all-gates.py"))
    pj = lire("package.json")
    cond = lire(os.path.join("scripts", "_joue_orphelines.py"))
    # les portes verify: de package.json dont la commande nomme cette sonde
    entrees = dict(re.findall(r'("(?:verify:[\w-]+)")\s*:\s*"([^"]*)"', pj))
    etat = {}
    for f in noms:
        dans_cond = cite(f, cond)
        dans_pj = cite(f, pj)
        portes_filles = [k for k, v in entrees.items() if f in v]
        dans_defaut = any(k in defaut for k in portes_filles) or cite(f, defaut)
        cites = cites_par(f, ("scripts/_joue_orphelines.py",))
        if cites is None:
            print("CAPTEUR MORT: le grep n'a pas pu tourner")
            sys.exit(5)
        # UNE CITATION PAR UNE AUTRE ORPHELINE N'EST PAS UNE PORTE. Sans ce
        # filtre, quatre sondes qui ne se citent que ENTRE elles (mesure
        # 24/09: probe-index-reel/staffday, probe-join-stats, probe-nplus1)
        # sortent « couvertes » par une boucle de citations qui se valide
        # elle-même -- le faux PASS le plus cher d'un capteur d'orphelines.
        # Seule compte une citation par un hors-sonde (package.json, un
        # mutation-test-*, un brancheur-*, un verbe du harnais).
        hors_sondes = set(noms)
        cites_reelles = [c for c in cites
                        if os.path.basename(c) not in hors_sondes]
        if dans_cond or (dans_pj and dans_defaut):
            classe = "PORTEE"
        elif dans_pj or dans_defaut:
            classe = "DEMI-PORTEE"
        elif cites_reelles:
            classe = "PORTEE_PAR_TIERS"
        else:
            classe = "ORPHELINE"
        etat[f] = {"classe": classe, "conducteur": dans_cond,
                  "package_json": dans_pj, "defaut": dans_defaut,
                  "portes": portes_filles, "cite_par": cites,
                  "cite_par_reel": cites_reelles}
    return etat


def main():
    os.chdir(RACINE)
    figer = "--figer" in sys.argv
    etat = inventaire()
    compte = {}
    for e in etat.values():
        compte[e["classe"]] = compte.get(e["classe"], 0) + 1
    if not compte:
        print("CAPTEUR MORT: 0 classe, le capteur n'a rien vu")
        sys.exit(3)
    resume = " | ".join("%s=%d" % (k, compte[k]) for k in sorted(compte))
    print("SONDES=%d %s" % (len(etat), resume))

    surveillees = {f: e for f, e in sorted(etat.items())
                   if e["classe"] in ("ORPHELINE", "DEMI-PORTEE")}

    if figer:
        ref = {"source": "scripts/capteur-orphelines.py",
               "total_sondes": len(etat), "compte": compte,
               "classes": {f: e["classe"] for f, e in sorted(etat.items())},
               "surveillees": surveillees, "hors_loi": {}}
        tmp = CHEMIN_REF + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(ref, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, CHEMIN_REF)
        print("REFERENCE FIGEE " + CHEMIN_REF + " surveillees=" +
              str(len(surveillees)))
        sys.exit(0)

    if not os.path.exists(CHEMIN_REF):
        print("CAPTEUR MORT: reference absente (" + CHEMIN_REF +
              ") -- le geste du pilote est de la figer: --figer")
        sys.exit(3)
    with open(CHEMIN_REF, encoding="utf-8") as fh:
        ref = json.load(fh)
    if not ref.get("classes"):
        print("CAPTEUR MORT: la reference est vide")
        sys.exit(3)
    connues = set(ref.get("surveillees", {})) | set(ref.get("hors_loi", {}))
    nouvelles = [f for f in surveillees if f not in connues]
    resolues = [f for f in ref.get("surveillees", {})
                if f not in surveillees and f not in ref.get("hors_loi", {})]
    for f in nouvelles:
        e = surveillees[f]
        print("  NOUVELLE_" + e["classe"] + " " + f +
              " cite_par=" + (", ".join(e["cite_par"]) or "PERSONNE"))
    for f in resolues:
        ancienne = ref["surveillees"][f]["classe"]
        print("  RESOLUE " + f + " (n'est plus " + ancienne + ")")
    if nouvelles:
        print("VERDIT_ROUGE %d sonde(s) sans porte NOUVELLE(S): une porte au "
              "sens de la regle 6 (package.json ET DEFAUT), ou un RETRAIT. "
              "Pas de silence." % len(nouvelles))
        sys.exit(2)
    print("VERDIT_VERT conforme a la reference surveillees=%d hors_loi=%d"
          % (len(ref.get("surveillees", {})), len(ref.get("hors_loi", {}))))
    sys.exit(0)


if __name__ == "__main__":
    main()
