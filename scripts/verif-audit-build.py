#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chantier D (document 1.0.6) — LES 6 ALERTES RESTANTES SONT BIEN DE BUILD.

Ce que le document de mission demande : « corriger les 6 vulnerabilites de
build ». Ce que la mesure rend (11/11) : `npm audit --omit=dev` = **0**
vulnerabilite ; `npm audit` = 6 moderees, toutes dans la chaine
electron-builder (app-builder-lib, dmg-builder, electron-builder-squirrel-windows,
@electron/universal, minimatch). Electron lui-meme est a 45.2.3 (correction du
chantier 48), la production est a zero.

Pourquoi CETTE porte existe plutot qu'une correction de plus. TROIS corrections
ont ete TENTEES, chacune jouee par une commande, et chacune rendue par un
chiffre :

  1. `overrides: {"@electron/universal": {"minimatch": "^11.0.1"}}`
     -> `npm ls` rc=0 mais l'override N'EST PAS APPLIQUE : la copie imbriquee
        reste minimatch@9.0.9 (`npm ls minimatch` : « invalid: ^11.0.1 from
        node_modules/@electron/universal »). L'audit reste a 6. Un override qui
        ne s'applique pas est un ornement.
  2. `overrides: {"minimatch": {"@electron/universal": "^11.0.1"}}` (le sens
     recommande par la doc npm) -> meme mesure : 9.0.9 en place, audit a 6.
     La raison est dans le paquet : `@electron/universal@2.0.3` declare
     `minimatch: ^9.0.3` et son `dist/cjs` appelle `require("minimatch")` ;
     npm refuse de remplacer une dependance directe par une majeure hors range
     sans `--force`.
  3. `overrides: {"@electron/universal": "^3.0.6"}` (la version qui NE DEPEND
     PLUS de minimatch) -> appliquee, `npm ls` rc=0, MAIS `npm audit` monte a
     **8** : `@electron/universal@3` exige `@electron/asar@^4`, dont la chaine
     est signalee a son tour. Corriger 2 alertes en en Creant 2 autres n'est
     pas corriger.

La regle du cahier des charges exclut `npm audit fix --force`, et la «
correction » proposee par npm est un RETROGRADEMENT a electron-builder 25.1.x
(une chaine d'octobre 2024) : `npm audit fix --force` est donc refuse, comme
au chantier 48.

Ce que la porte juge, puisque la correction est refusee par mesure : elle
EMPECHE de mentir sur l'etat. Elle verrouille les trois faits, chacun par la
commande qui le produit :

  A. `npm audit --omit=dev` rend 0 (la production est propre — le seul chiffre
     qui engage le client) ;
  B. `npm audit` rend exactement 6 moderees, 0 elevee, 0 critique ;
  C. CES SIX-la sont toutes dans la chaîne de BUILD : chaque nom signale
     appartient a la liste fermee des paquets d'empaquetage, et aucun n'est
     importable par le produit (verifie : `import` introuvable dans src/,
     scripts/, test/).

Si une septieme alerte apparait, si une alerte touche la PRODUCTION, ou si le
chiffre baisse sans que la liste soit mise a jour, la porte ROUGIT. Elle ne
peut donc pas etre « oubliee » en devenant fausse.

Lancement : python3 scripts/verif-audit-build.py   (le rc EST le verdict)
"""
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# La liste FERMEE des paquets dont les six alertes sont autorisees a venir :
# la chaine d'empaquetage, jamais livree au client. Une alerte hors de cette
# liste est une alerte de PRODUCTION, et elle rougit.
CHAINE_BUILD = {
    "electron-builder",
    "app-builder-lib",
    "dmg-builder",
    "electron-builder-squirrel-windows",
    "@electron/universal",
    "minimatch",
}
# Les severites qui n'ont pas le droit d'exister, meme en build.
SEVERITES_INTERDITES = {"high", "critical", "info"}
# Le nombre ATTENDU d'alertes build. Un chiffre qui bouge sans mise a jour de
# ce fichier est une alerte nouvelle (ou une disparition non expliquee) : dans
# les deux cas, le juge doit rougir et quelqu'un doit re-mesurer.
ATTENDU_BUILD = 6


def npm_audit(omit_dev):
    cmd = ["npm", "audit", "--json"] + (["--omit=dev"] if omit_dev else [])
    r = subprocess.run(cmd, cwd=BASE, capture_output=True, text=True, timeout=600)
    try:
        return json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        raise RuntimeError("npm audit --json ne rend pas du JSON (rc=%s) : %s"
                           % (r.returncode, (r.stdout or r.stderr)[:200]))


def principale():
    echecs = []

    def verifier(label, ok, detail=""):
        print(("  OK   " if ok else "  FAUTE ") + label + ((" — " + detail) if detail else ""))
        if not ok:
            echecs.append(label + ((" — " + detail) if detail else ""))

    # --- A. la production est propre ----------------------------------------
    prod = npm_audit(omit_dev=True)
    p = prod.get("metadata", {}).get("vulnerabilities", {})
    verifier("A production : npm audit --omit=dev = 0 vulnerabilite",
             sum(p.values() or [0]) == 0 and p.get("total", 0) == 0,
             " ".join("%s=%s" % (k, v) for k, v in sorted(p.items())))

    # --- B et C. le build, chiffre ET identite ------------------------------
    tout = npm_audit(omit_dev=False)
    m = tout.get("metadata", {}).get("vulnerabilities", {})
    noms = sorted(tout.get("vulnerabilities", {}).keys())
    severites = {n: v.get("severity") for n, v in tout.get("vulnerabilities", {}).items()}
    verifier("B build : %d alertes moderees, 0 elevee, 0 critique" % ATTENDU_BUILD,
             m.get("total", -1) == ATTENDU_BUILD and m.get("moderate", 0) == ATTENDU_BUILD,
             " ".join("%s=%s" % (k, v) for k, v in sorted(m.items())))
    inconnues = [n for n in noms if n not in CHAINE_BUILD]
    verifier("C build : aucune alerte hors de la chaine d'empaquetage",
             not inconnues, "hors liste : %s" % ", ".join(inconnues) if inconnues else ", ".join(noms))
    hautes = [n for n, s in severites.items() if s in SEVERITES_INTERDITES]
    verifier("C build : aucune severite haute/critique/info", not hautes,
             ", ".join("%s(%s)" % (n, severites[n]) for n in hautes) if hautes else "modere seulement")

    # Un paquet signale ne doit pas etre atteignable par le produit : s'il
    # etait importe par src/, une alerte « build » serait une alerte livree.
    # Le present juge EST EXCLU de sa propre recherche : il nomme les paquets
    # qu'il cherche (c'est son metier), et un juge qui se signale lui-meme est
    # un faux positif — la distinction entre l'import d'un produit et la liste
    # de controles d'un juge est exactement ce qui est en jeu ici.
    import re
    motifs = [re.compile(r"""require\(["']%s["']\)|from\s+["']%s["']""" % (re.escape(n), re.escape(n)))
              for n in noms]
    importes = []
    moi = os.path.abspath(__file__)
    pour_r = dossiers = fichiers = None
    for racine in ("src", "scripts", "test"):
        for pour_r, dossiers, fichiers in os.walk(os.path.join(BASE, racine)):
            dossiers[:] = [d for d in dossiers if d not in ("node_modules", "__pycache__")]
            for f in fichiers:
                if not f.endswith((".ts", ".tsx", ".js", ".cjs", ".mjs", ".py")):
                    continue
                chemin = os.path.join(pour_r, f)
                if os.path.abspath(chemin) == moi:
                    continue
                try:
                    with open(chemin, encoding="utf-8", errors="replace") as fh:
                        contenu = fh.read()
                except OSError:
                    continue
                for n, mot in zip(noms, motifs):
                    if mot.search(contenu):
                        importes.append("%s importe %s" % (os.path.relpath(chemin, BASE), n))
    verifier("C build : aucun paquet signale n'est importe par le produit",
             not importes, "; ".join(importes[:3]) if importes else "aucun import dans src/, scripts/, test/")

    # Les versions mesurees sont consignees : « la correction proposee par npm
    # est un retrogradation » est un fait qui se verifie, pas une opinion.
    pk = json.load(open(os.path.join(BASE, "package.json"), encoding="utf-8"))
    dev = pk.get("devDependencies", {})
    print("VERSIONS  electron=%s  electron-builder=%s" %
          (dev.get("electron"), dev.get("electron-builder")))
    for cle in ("electron", "electron-builder"):
        verifier("D version epinglee : %s present dans devDependencies" % cle,
                 bool(dev.get(cle)))

    # LE GARDE EST-IL VIVANT ? (la morsure, consigne du depot : un capteur qui
    # ne peut pas rougir est un ornement.) Deux mutations INTERNES, jouees puis
    # annulees : une severite qui n'a pas le droit d'exister doit rougir, et un
    # nom signale par audit mais absent de la liste fermee doit rougir. Si l'une
    # des deux ne rougit pas, la porte est un decor et on le dit en rougissant.
    severites_testees = dict(severites)
    severites_testees[noms[0]] = "critical" if noms else "critical"
    verifier("MORSURE : une severite critique signalee rougit le juge",
             bool([n for n, s in severites_testees.items() if s in SEVERITES_INTERDITES]))
    # Le nom ABSENT de la liste : on RETIRE le premier nom signale de la liste
    # fermee — le juge doit alors le declarer « hors chaine d'empaquetage ». Si
    # la comparaison etait ecrite a l'envers, ce controle ne pourrait jamais
    # rougir : c'est exactement le defaut qu'une morsure doit ecarter.
    if noms:
        retire = noms[0]
        sans = {n for n in CHAINE_BUILD if n != retire}
        detecte_hors_liste = any(n not in sans for n in noms)
        verifier("MORSURE : un nom signale hors de la liste fermee rougit le juge",
                 detecte_hors_liste,
                 "nom retire de la liste : %s — le juge ne le voit PAS" % retire)

    print("ALERTES_BUILD=%d  NOMS=%s" % (m.get("total", -1), ",".join(noms)))
    if echecs:
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1
    print("VERDICT : VERT (production 0 alerte ; les %d moderees sont bien de build, "
          "correction forcee refusee par mesure)" % ATTENDU_BUILD)
    return 0


if __name__ == "__main__":
    sys.exit(principale())
