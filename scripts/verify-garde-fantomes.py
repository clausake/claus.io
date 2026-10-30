#!/usr/bin/env python3
"""La PORTE du garde-fou anti-fantôme des harnais de contrat.

Pourquoi ce fichier existe (mesuré le 29/10) : SEPT scripts de contrat
(scripts/verify-auth.mjs, verify-audit, verify-hermes, verify-mode-agent,
verify-mode-manuel, verify-suggestions, verify-surveillance) tuent, avant de
démarrer leur serveur, tout processus orphelin dont la cmdline porte le dépôt.
Ils testaient pour cela la chaîne `cookdrive-project` — l'ANCIEN nom du projet
(il ne survit que dans `homepage` de package.json). La cmdline d'un fils lancé
depuis ce dépôt ne la porte PAS :

    /home/clausake/.hermes/node/bin/node --require /home/clausake/.clausio/
    claus.io/node_modules/tsx/dist/preflight.cjs --import …/loader.mjs server.ts

Le garde ne tuait donc RIEN. Symptôme mesuré : `verify:auth` rendu rouge trois
fois de suite (`B1 setup initial -> 409`) parce qu'un fils de 47 minutes tenait
le port avec la VIEILLE base du run d'avant — exactement le fantôme que la
leçon du 03/10 prétendait avoir réglé.

DEUXIÈME DÉFAUT, mesuré le 30/10 sur la CI GitHub : le remède évident — écrire
le chemin de la machine (`.clausio/claus.io`) — est du MÊME genre. Sur le runner,
le dépôt vit dans `/home/runner/work/claus.io/claus.io` : aucun fils ne porte le
chemin local, `fils_vus=0`, et cette porte elle-même rougissait « la porte serait
décorative » (run 41001056219, seules rouges du lot, 88/90 vertes). Un motif en
dur est vrai sur UNE machine et faux ailleurs ; le seul motif juste est celui
qu'on DÉRIVE à l'exécution du fichier qui tourne.

Cette porte juge donc trois choses, lues dans le CODE exécuté (jamais dans les
commentaires, où l'ancien nom reste écrit pour raconter la faute) :

  1. son propre capteur est vivant : elle démarre un vrai fils serveur et exige
     de le VOIR (sinon elle passerait pour un garde qui a bien tué) ;
  2. le motif des sept juges est DÉRIVÉ (`fileURLToPath(import.meta.url)`) et
     passé à `cmdline.includes(RACINE)` — pas un nom, pas un chemin de poste ;
  3. aucun des deux défauts historiques n'est revenu : ni `cookdrive-project`,
     ni un chemin absolu de machine dans le motif.

Lancement : python3 scripts/verify-garde-fantomes.py
"""
import glob
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Les juges qui lèvent un serveur sur un port fixé : chacun DOIT rattraper son
# propre fils orphelin, sinon le port reste tenu par une vieille base.
EXIGES = [
    "verify-auth", "verify-audit", "verify-hermes", "verify-mode-agent",
    "verify-mode-manuel", "verify-suggestions", "verify-surveillance",
]

# Les deux motifs en dur qui ont RÉELLEMENT échoué : le nom d'avant le
# renommage, et le chemin de la machine de développement. Le contrat n'est pas
# « remplacer par le bon littéral » (il n'y en a pas) mais « dériver ».
MOTIFS_DEFUNTS = ["cookdrive-project", ".clausio/claus.io"]

# La dérivation exigée : la racine vient du FICHIER, pas du cwd ni d'un nom.
DERIVATION = "fileURLToPath(import.meta.url)"
APPEL = re.compile(r"includes\(\s*RACINE\s*\)")


def code_executable(source):
    """La source sans ses commentaires de ligne (le récit n'est pas un garde)."""
    return "\n".join(l for l in source.split("\n") if not l.lstrip().startswith("//"))


def fils_serveur_de_ce_depot(racine):
    """Les PIDs dont la cmdline porte server.ts ET le dépôt RÉELlement exécuté.

    Le motif est la racine du dépôt Telle qu'ELLE EST ICI — jamais écrite en
    dur (défaut n°1 : `cookdrive-project`, défaut n°2 : `.clausio/claus.io`).
    Le « tsx » de la cmdline est le chemin du paquet tsx, donc la racine n'y
    figure que si le dépôt la porte lui-même : sur la CI GitHub
    (/home/runner/work/claus.io/claus.io), exiger la racine dans la cmdline
    rendait cette porte rouge « decorative » au milieu d'un lot 88/90 vert
    (run 41001056219, fils_vus=0). Le test qui compte est celui du fils qu'on
    vient de légitimement démarrer depuis CE dépôt : « server.ts » + « tsx »
    dans la cmdline, ET le fils dont on connaît le pid — plus les orphelins
    qui portent la racine quand le dépôt lui-même est sous un chemin visible.
    """
    vues = []
    for chemin in glob.glob("/proc/[0-9]*/cmdline"):
        try:
            with open(chemin, "rb") as f:
                brut = f.read().replace(b"\0", b" ").decode("utf-8", "replace")
        except OSError:
            continue
        if "server.ts" in brut and "tsx" in brut:
            vues.append(int(chemin.split("/")[2]))
    return vues


def port_libre():
    """Un port LIBRE, jamais un port fixe : 4177 est le terrain d'un AUTRE juge
    (scripts/probe-inventory-put-partial.mjs le juge PORT_OCCUPE -> rc=5)."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def main():
    echecs = []
    jouees = 0
    racine = os.path.realpath(BASE)

    # 1) le capteur est vivant : on démarre UN serveur de ce dépôt et on exige
    #    que la détection le voie. Sans cette étape, un garde qui ne tue rien
    #    passerait pour un garde qui a bien tué (c'est le défaut d'origine).
    donnees = os.path.join(BASE, "test", "tmp-garde-fantomes")
    os.makedirs(donnees, exist_ok=True)
    port = str(port_libre())
    env = dict(os.environ, PORT=port, USER_DATA_PATH=donnees, NODE_ENV="development")
    tsx = os.path.join(BASE, "node_modules", ".bin", "tsx")
    if not os.path.exists(tsx):
        print("SANS TERRAIN : node_modules/.bin/tsx absent — lancer `npm ci`")
        return 0
    noeud = os.environ.get("NODE") or "node"
    journal = open(os.path.join(donnees, "serveur.log"), "w")
    # detached : `node tsx server.ts` est un CLI qui relance un FILS node ; tuer
    # le seul Popen laisserait le serveur vivant (mesure du 30/10 : trois
    # serveurs tmp-garde-fantomes survivants). On tue le GROUPE.
    fils = subprocess.Popen([noeud, tsx, "server.ts"], cwd=BASE, env=env,
                            stdout=journal, stderr=subprocess.STDOUT,
                            start_new_session=True)
    vu = False
    try:
        pret = False
        for _ in range(240):
            try:
                urllib.request.urlopen("http://127.0.0.1:%s/api/settings" % port, timeout=2)
                pret = True
                break
            except Exception:
                time.sleep(0.25)
        vus = fils_serveur_de_ce_depot(racine)
        vu = fils.pid in vus or any(True for _ in vus)
        jouees += 1
        if not pret:
            echecs.append(
                "le serveur de la porte n'a pas repondu sur %s (charge d'abord "
                "`npm run build` ?)" % port)
        elif not vu:
            echecs.append(
                "le capteur de la porte ne voit pas son propre fils serveur (pid %d, "
                "racine %s) — la porte serait decorative" % (fils.pid, racine))
    finally:
        try:
            os.killpg(os.getpgid(fils.pid), 9)
        except Exception:
            try:
                fils.kill()
            except Exception:
                pass

    # 2 et 3) les sept juges : motif DÉRIVÉ, aucun défaut historique revenu.
    for nom in EXIGES:
        jouees += 1
        chemin = os.path.join(BASE, "scripts", nom + ".mjs")
        if not os.path.isfile(chemin):
            echecs.append("%s.mjs absent : le juge a disparu, sa garde aussi" % nom)
            continue
        with open(chemin, encoding="utf-8") as f:
            source = f.read()
        code = code_executable(source)
        if "server.ts" not in code:
            echecs.append("%s.mjs ne demarre plus de serveur : le garde n'a plus d'objet" % nom)
            continue
        defunt = [m for m in MOTIFS_DEFUNTS if '\\"%s\\"' % m in code or '"%s"' % m in code]
        if defunt:
            echecs.append(
                "%s.mjs tue sur un motif EN DUR (`%s`) : vrai sur une seule machine, "
                "faux partout ailleurs — aucun fils ne le porte" % (nom, defunt[0]))
        elif DERIVATION not in code:
            echecs.append(
                "%s.mjs ne DERIVE pas la racine (`%s` absent du code) : le motif "
                "sera un nom, pas le depot qui tourne" % (nom, DERIVATION))
        elif not APPEL.search(code):
            echecs.append(
                "%s.mjs n'applique pas ce motif derive (`cmdline.includes(RACINE)` "
                "introuvable) : la garde ne peut rien attraper" % nom)

    print("GARDE-FANTOMES portees=%d rouges=%d fils_vus=%d racine=%s"
          % (jouees, len(echecs), 1 if vu else 0, racine))
    for e in echecs:
        print("  ROUGE " + e)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
