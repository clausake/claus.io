#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repare package.json (insersion fautive: virgule traînante avant `}`) puis
branche les trois portes du contrat de lignes — dans le manifeste ET le lot.

CE QUI S'EST PASSE, consigne pour que la lecon tienne: la premiere version de
ce branchement a ete ECRITE sans etre JOUEE, et un rendu a pretendu « manifeste
en place ». Joue pour de vrai, il a RUINE le JSON: l'anchre etait la DERNIERE
entree de `scripts` (sans virgule finale), et mon bloc ajoutait une virgule
apres la sienne avant le `}`. Le parseur l'a dit immediatement — c'est ce qui
rend la regle « un JSON se re-parse, jamais il ne se rend » non negociable.

Le fichier etait PUR et IDENTIQUE A HEAD au moment du forfait (verifie par
`git status` + `git diff`: rien d'autrui n'y vivait), donc le retablissement
depuis HEAD n'ecrase le travial d'AUCUN editeur concurrent.

Regles appliquees ici:
  - substitution par chaine EXACTE avec count == 1 (pas de patcheur flou: il a
    matche TROIS sites sur ce manifeste, les cles `verify:*-mord` partagent
    une suffixe commune);
  - la DERNIERE cle ajoutee ne porte PAS de virgule;
  - `json.load` apr Es ecriture + les cibles des portes existent sur disque;
  - le lot (`run-all-gates.py`) est re-parse en AST (un DEFAUT corrompu = un
    lot qui ne rougit pas, le pire des faux verts).
"""
import ast
import hashlib
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PK = os.path.join(BASE, "package.json")
GATES = os.path.join(BASE, "scripts", "run-all-gates.py")

CLES = ("verify:document-items",
        "verify:document-items-mord",
        "verify:document-items-voices")

# L'anchre est LA DERNIERE entree de `scripts` (sans virgule): c'est precisely
# ce qui a piege la premiere tentative.
ANCRE_PK = ('    "verify:post-inventory-mord": '
            '"python3 scripts/negative-test-post-inventory-contract.py"')
NOUVELLES = [
    ('    "verify:document-items": "npx playwright test '
     'test/e2e/document-items-contract.spec.ts --reporter=line",'),
    '    "verify:document-items-mord": "python3 scripts/negative-test-document-items.py",',
    '    "verify:document-items-voices": "node scripts/probe-document-items-voices.mjs"',
]

ANCRE_GATES = ('          "verify:post-inventory", "verify:post-inventory-mord"]')
AJOUT_GATES = (
    '          "verify:post-inventory", "verify:post-inventory-mord",\n'
    '          # Les trois portes du contrat des LIGNES DE DOCUMENT (Sprint 9):\n'
    '          # le spec de contrat, sa preuve de morsure, et la sonde des voies\n'
    '          # REELLES (celle qui force le payload vide de l\'UI a ARRIVER vide).\n'
    '          # Les retirer rend la porte d\'entree de document_items jugeable\n'
    '          # partiellement sans qu\'aucun lot ne le voie.\n'
    '          "verify:document-items", "verify:document-items-mord",\n'
    '          "verify:document-items-voices"]'
)


def git(args):
    p = subprocess.run(["git"] + args, cwd=BASE, capture_output=True, text=True)
    return (p.stdout or "").strip() or (p.stderr or "").strip()


def lire(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def ecrire(p, t):
    with open(p, "w", encoding="utf-8") as f:
        f.write(t)
    relu = lire(p)
    if relu != t:
        raise SystemExit("RE-LECTURE DIVERGENTE SUR %s" % p)


def main():
    # -- 1) etat d'entree, par octets -------------------------------------
    brut = lire(PK).encode("utf-8")
    try:
        json.loads(brut.decode("utf-8"))
        brise = False
    except json.JSONDecodeError as e:
        brise = True
        print("package.json EST BRISE (%s) -> retablissement depuis HEAD" % e)
    if brise:
        # Prouver d'abord que rien d'autrui n'y vit: seul un fichier sans
        # travial d'un autre editeur a le droit d'etre retabli.
        #
        # ⚠ Regle d'attribution: une ligne `+` est a CE SPRINT si son contenu
        # existe dans HEAD a l'exception pres d'une virgule FINALE. Sans cette
        # tolerance, ma propre insersion (qui ajoute la virgule qui manquait a
        # la derniere entree de `scripts`) fait apparaitre la ligne de HEAD
        # comme un ajout ETRANGER et la garde s'abstient sur un forfait qu'elle
        # ne peut pas attribuer — un faux negatif qui laisse le JSON brise en
        # place. Une ligne dont le contenu n'est PAS dans HEAD reste un motif
        # d'abstention strict.
        head = git(["show", "HEAD:package.json"]).splitlines()
        head_net = {l.strip().rstrip(",") for l in head}
        # Les lignes QUE CE SPRINT AJOUTE sont aussi « a lui »: absentes de
        # HEAD par construction. Sans cette exemption, la garde declarait mes
        # propres trois cles « etrangeres » (elles ne sont pas dans HEAD) et
        # s'abstenoit sur un forfait entierement mien, en laissant le JSON
        # BRISE en place — le pire des issues: la regle de jugement doit
        # reconnaitre CE QU'ELLE A ELLE-MEME ECRIT, sinon elle protège contre
        # un adversaire qu'elle invente.
        miennes = {l.strip().rstrip(",") for l in NOUVELLES}
        admis = head_net | miennes
        diff = git(["diff", "--", "package.json"])
        etrangers = []
        for l in diff.splitlines():
            if not l.startswith("+") or l.startswith("+++"):
                continue
            contenu = l[1:].strip().rstrip(",")
            if contenu and contenu not in admis:
                etrangers.append(l)
        if etrangers:
            print("ABSTENTION: le fichier porte un travial ETRANGER a ce sprint:")
            for l in etrangers[:8]:
                print("   ", l[:150])
            return 4
        ret = git(["checkout", "--", "package.json"])
        print("  git checkout:", ret or "(fait)")
        if os.path.getsize(PK) == 0:
            print("  RETABLISSEMENT A RENDU UN FICHIER VIDE")
            return 5

    # -- 2) insersion correcte --------------------------------------------
    src = lire(PK)
    if '"verify:document-items"' in src:
        print("manifeste DEJA dote (insersion ignoree)")
    else:
        n = src.count(ANCRE_PK)
        if n != 1:
            print("ANCHRE package.json non unique: %d" % n)
            return 2
        bloc = ANCRE_PK + ",\n" + "\n".join(NOUVELLES)
        nouveau = src.replace(ANCRE_PK, bloc, 1)
        ecrire(PK, nouveau)
        # ⚠ Le compte-rendu rend la taille du FICHIER relu, et non celle du
        # fragment inseré: afficher len(bloc) a deja fait rendre « 6211 -> 370
        # octets » pour un fichier de 6,4 Ko — une mesure qui ment sur sa
        # propre echelle est pire qu'une absence de mesure.
        n_avant = len(src.encode("utf-8"))
        n_apres = len(lire(PK).encode("utf-8"))
        print("manifeste: %d -> %d octets" % (n_avant, n_apres))

    with open(PK, encoding="utf-8") as f:
        m = json.load(f)
    scripts = m["scripts"]
    manque = [k for k in CLES if not scripts.get(k)]
    for k in CLES:
        print("  %-32s %s" % (k, scripts.get(k) or "*** ABSENTE ***"))

    # -- 3) les cibles des portes existent-elles ? ------------------------
    for k in CLES:
        for cible in re.findall(r"(scripts/[\w./-]+|test/[\w./-]+)", scripts.get(k) or ""):
            if not os.path.isfile(os.path.join(BASE, cible)):
                print("  CIBLE ABSENTE %s -> %s" % (k, cible))
                manque.append("%s->%s" % (k, cible))

    # -- 4) le lot ---------------------------------------------------------
    g = lire(GATES)
    if '"verify:document-items"' in g:
        print("lot DEJA dote")
    else:
        if g.count(ANCRE_GATES) != 1:
            print("ANCHRE lot non unique: %d (DEFAUT a change de forme)"
                  % g.count(ANCRE_GATES))
            return 3
        g2 = g.replace(ANCRE_GATES, AJOUT_GATES, 1)
        ecrire(GATES, g2)
        try:
            ast.parse(g2)
        except SyntaxError as e:
            print("LOT IRREPROCHABLE ABIME, restauration:", e)
            ecrire(GATES, g)
            return 3
        print("lot: %d -> %d octets (AST OK)" % (len(g.encode()), len(g2.encode())))
    for k in CLES:
        if '"%s"' % k not in lire(GATES):
            manque.append("lot:" + k)

    brut = lire(PK).encode("utf-8")
    print("\npackage.json octets=%d sha=%s"
          % (len(brut), hashlib.sha256(brut).hexdigest()[:16]))
    print("un JSON ne se REND pas, il se RE-PARSE.")
    if manque:
        print("FAILLI: " + ", ".join(manque))
        return 1
    print("3/3 PORTES BRANCHEES (manifeste + cibles sur disque + lot)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
