#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chantier C (document 1.0.6) — AUCUN LANCEMENT NE PASSE PAR LE SCRIPT SHELL.

Le defaut mesure chez le client (audit du 09/11, chantier 46) : les harnais
lancaient le serveur via `node_modules/.bin/tsx`. SOUS WINDOWS CE FICHIER EST
UN SCRIPT SHELL, et le passer a node.exe le faisait lire comme du shell :

    basedir=$(dirname ...)
    SyntaxError: missing ) after argument list

Le serveur ne demarrait donc JAMAIS — mesures du client : verify:auth echouait
sur « serveur pas pret », verify:routes sur « 1 echec de demarrage, 43 tests
non executes ». Le harnais partage (scripts/harnais-serveur.cjs) et le module
Python (scripts/lib/tsx_cli.py) resolvent des lors le VRAI CLI JavaScript du
paquet (`tsx/cli` -> dist/cli.mjs), que node sait executer sur les deux
systemes.

Pourquoi CETTE porte existe : le correctif est un geste de deux caracteres dans
une liste d'arguments. Rien dans le lot ne empeche quelqu'un de le reintroduire
 — et sous Linux, le `.bin` marche, donc AUCUN test ne rougit ici. Le defaut
est invisible jusqu'a la machine d'un client Windows. Ce juge est le seul
capteur possible hors de cette machine : il lit les LANCEMENTS, pas les
resultats.

Ce qui est juge :
  A. dans tout le depot (sauf le texte qui DECRIT le defaut : commentaires,
     docstrings, PHASES.md), aucune invocation ne passe par `.bin/tsx` ;
  B. les lancements connues du lot passent bien par le resolveur
     (cheminTsx / chemin_tsx) ;
  C. le resolveur lui-meme fonctionne ICI (il trouve un fichier .mjs qui
     existe) — un resolveur casse ne rougirait que chez le client.

Lancement : python3 scripts/verif-harnais-windows.py  (le rc EST le verdict)
"""
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Les extensions de script qui peuvent lancer le serveur.
EXTENSIONS = (".py", ".sh", ".cjs", ".mjs", ".js", ".ts")
# Les fichiers qui ONT DROIT de nommer le defaut (le correctif et sa trace).
# Ils sont juges quand meme sur le B : un resolveur n'est pas une faveur.
DESCRIPTIONS = (
    os.path.join("scripts", "lib", "tsx_cli.py"),
    os.path.join("scripts", "harnais-serveur.cjs"),
)
# Les lignes qui decrivent le defaut sont des commentaires : elles sont permises.
COMMENTAIRE = re.compile(r"^\s*(#|//|\*|/\*)")
# Les mots qui annoncent qu'une ligne de code NOMME le defaut sans l'invoquer.
RECIT = ("audit", "defaut", "mesure", "windows", "shell", "faute", "harnais")

# LA syntaxe d'un lancement : le defaut mesure etait toujours la MEME forme,
# le chemin du script shell passe comme EXECUTABLE (element de liste
# d'arguments, ou mot de commande apres `node `). Une chaine de diagnostic
# (« SANS TERRAIN : … absent ») n'a jamais cette forme. Distinguer par la
# SYNTAXE et non par une liste de fichiers est ce qui empeche un lancement de
# se deguiser en commentaire.
#
# Le chemin est ecrit en MOTIF et non en litteral : un scanner ne contient pas
# ce qu'il cherche, sinon le present fichier serait son propre faux positif.
# Les groupes sont volontairement souples ; le juge est calibre par l'auto-test
# de la fonction `auto_test` (faux negatifs ET faux positifs sont des fautes).
CHEMIN_SHELL = r"node_modules\s*[/\\.]*[.,\\]+bin[/\\]+tsx"
APRES_NODE = r"[^\"'\s]*bin[/\\]tsx"
INVOCATION = re.compile(
    r"""\[\s*[^\]\[]*?,\s*["']%s["']            # element d'une liste d'arguments
      | (?:^|[\s&;`(])node\s+["']?%s["']?       # un mot de commande apres `node `
      | [^\s`]*node\s+%s(?=[\s"']|$)            # un executable dans une commande
    """ % (CHEMIN_SHELL, APRES_NODE, CHEMIN_SHELL),
    re.VERBOSE | re.IGNORECASE,
)

DIAGNOSTIC = re.compile(
    r"""^(?:print\(|echo\s|console\.(?:log|error|warn)|raise\s|return\s|sys\.exit\()""",
)

# L'auto-test du capteur : un juge qui ne peut pas rougir est decoratif
# (consigne du 11/11). Les deux listes sont des VERITES, pas des gouts.
DOIT_VOIR = [
    '    ch = ss.Popen_sonde([NODE, "node_modules/.bin/tsx", "server.ts"],',
    '  subprocess.run(["node", "node_modules/.bin/tsx", "server.ts"])',
    '  node "$RACINE/node_modules/.bin/tsx" "$RACINE/server.ts" &',
    r"  node 'node_modules\.bin\tsx' server.ts",
    # un lancement DEGUISE en commentaire reste une faute : la grammaire d'appel
    # prime, l'excuse de forme ne peut pas l'effacer.
    "#    ch = subprocess.Popen([NODE, \"node_modules/.bin/tsx\", \"server.ts\"])",
]
DOIT_IGNORER = [
    '        print("SANS TERRAIN : node_modules/.bin/tsx absent — lancer `npm ci`")',
    "# les juges lancaient le serveur via `node_modules/.bin/tsx`.",
    '  node "$TSX" "$RACINE/server.ts" &',
    '    fils = subprocess.Popen([noeud, tsx, "server.ts"], cwd=BASE, env=env,',
]
# Les lignes de RECIT (un texte qui raconte le defaut hors d'un commentaire).
# Elles ne sont pas des lancements, et le savoir est ce qui empeche le defaut
# de revenir : elles sont therefore jugees a part, par la grammaire seule.
DOIT_IGNORER_RECIT = [
    "    #    `node <RACINE>/node_modules/tsx/dist/cli.mjs server.ts` et tsx relance",
]


def auto_test():
    """Les fautes du capteur lui-meme : faux negatif = porte decorative,
    faux positif = porte qui rougit pour rien. Rend la liste des fautes."""
    fautes = []
    for l in DOIT_VOIR:
        if autorise(os.path.abspath(__file__) + ".autre", l):
            fautes.append("FAUX NEGATIF (capteur decoratif) : %s" % l.strip()[:70])
    for l in DOIT_IGNORER + DOIT_IGNORER_RECIT:
        if not autorise(os.path.abspath(__file__) + ".autre", l):
            fautes.append("FAUX POSITIF : %s" % l.strip()[:70])
    return fautes


def ligne_interdite(ligne):
    """Vraie si la ligne INVOQUE le script shell (et ne le raconte pas)."""
    return bool(INVOCATION.search(ligne))


def fichiers_du_depot():
    exclus = {"node_modules", ".git", "dist", "test-results", "__pycache__",
              "coverage", ".sonde", "var"}
    for racine, dossiers, fichiers in os.walk(BASE):
        dossiers[:] = [d for d in dossiers if d not in exclus and not d.startswith(".")]
        for f in fichiers:
            if f.endswith(EXTENSIONS):
                yield os.path.join(racine, f)


RECIT = re.compile(r"""(?:lance|lanc\w+|via|execute|appel\w*)\s+[`'"]""", re.IGNORECASE)


def autorise(chemin, ligne):
    """Vraie si la ligne NOMME le chemin shell sans jamais l'invoquer.

    Trois formes, et seulement trois, ont droit de citer le chemin : un
    COMMENTAIRE, la chaine d'une fonction de DIAGNOSTIC, ou un RECIT — une
    phrase qui RAconte un lancement verbe + guillemet (« … lance
    `node_modules/.bin/tsx …` », « via `…` »). Aucune des trois n'est une
    syntaxe d'appel : pas d'element de liste d'arguments, pas d'executable
    apres `node `. Un lancement deguise en phrase resterait pris par la
    grammaire d'appel, qui est evaluee EN PREMIER et n'excuse rien.
    Le capteur est calibre par l'auto_test : un faux negatif laisse revenir le
    defaut chez le client, un faux positif rougit le lot pour rien.
    """
    if os.path.abspath(chemin) == os.path.abspath(__file__):
        return True  # le juge porte lui-meme le motif qu'il cherche
    # 1. LA GRAMMAIRE D'APPEL PRIME : ce qui est un lancement est une faute,
    #    quel que soit le reste de la ligne (ni commentaire, ni recit n'excuse).
    if INVOCATION.search(ligne):
        return False
    # 2. Ce n'est pas un appel : un texte qui nomme le chemin est permis.
    return True


def principale():
    echecs = []

    # --- A. aucune invocation du script shell -------------------------------
    nombre_lus = 0
    for chemin in fichiers_du_depot():
        try:
            with open(chemin, encoding="utf-8", errors="replace") as fh:
                for n, ligne in enumerate(fh, 1):
                    if ligne_interdite(ligne) and not autorise(chemin, ligne):
                        echecs.append(
                            "A %s:%d invoque le script shell : %s"
                            % (os.path.relpath(chemin, BASE), n, ligne.strip()[:90]))
                    nombre_lus += 1
        except OSError:
            continue

    # --- B. les lancements du lot utilisent le resolveur --------------------
    LANCEMENTS = [
        (os.path.join("scripts", "harnais-serveur.cjs"), "cheminTsx"),
        (os.path.join("scripts", "lib", "tsx_cli.py"), "def chemin_tsx"),
        (os.path.join("scripts", "probe-labor-cost-zero.py"), "chemin_tsx(REPO)"),
        (os.path.join("scripts", "probe-index-installe.py"), "chemin_tsx(REPO)"),
        (os.path.join("scripts", "verify-garde-fantomes.py"), "chemin_tsx(BASE)"),
        (os.path.join("scripts", "instance-pentest.sh"), "chemin_tsx"),
    ]
    for relatif, attente in LANCEMENTS:
        chemin = os.path.join(BASE, relatif)
        if not os.path.isfile(chemin):
            echecs.append("B %s absent : le lancement n'existe plus" % relatif)
            continue
        with open(chemin, encoding="utf-8", errors="replace") as fh:
            contenu = fh.read()
        if attente not in contenu:
            echecs.append("B %s ne contient plus « %s » : le lancement est revenu "
                          "au script shell" % (relatif, attente))

    # --- C. le resolveur fonctionne ICI (sinon il ne rougit que chez le client)
    sys.path.insert(0, os.path.join(BASE, "scripts"))
    try:
        from lib.tsx_cli import chemin_tsx
        tsx = chemin_tsx(BASE)
        if not os.path.isfile(tsx):
            echecs.append("C chemin_tsx rend un fichier absent : %s" % tsx)
        elif not tsx.endswith(".mjs") and not tsx.endswith(".js"):
            echecs.append("C chemin_tsx ne rend pas le CLI JavaScript : %s" % tsx)
        else:
            print("RESOLVEUR : %s" % os.path.relpath(tsx, BASE))
    except Exception as e:  # un resolveur qui leve n'est pas un resolveur
        echecs.append("C chemin_tsx leve : %s" % e)

    # --- le capteur est-il vivant ? (la morsure, consigne du 11/11) ---------
    # Un juge qui ne peut pas rougir est decoratif, et un juge qui rougit pour
    # rien est un bruit. Les DEUX defauts sont des fautes de la porte.
    fautes_capteur = auto_test()
    echecs.extend("MORSURE " + f for f in fautes_capteur)
    if not fautes_capteur:
        print("MORSURE : le juge voit le script shell dans un lancement et "
              "l'ignore dans un texte (auto-test %d/%d)"
              % (len(DOIT_VOIR) + len(DOIT_IGNORER), len(DOIT_VOIR) + len(DOIT_IGNORER)))

    print("FICHIERS_LUS=%d  LANCEMENTS_JUGES=%d" % (nombre_lus, len(LANCEMENTS)))
    if echecs:
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1
    print("VERDICT : VERT (aucun lancement par le script shell, resolveur vivant)")
    return 0


if __name__ == "__main__":
    sys.exit(principale())
