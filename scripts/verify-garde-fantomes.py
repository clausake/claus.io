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
leçon du 03/10 prétendait avoir réglé. Une correction consignée dans un
commentaire, c'est une correction qui ne mord pas : cette porte la remesure.

Elle juge ce que le code FIT, pas ce qu'il dit : la chaîne visée doit être un
chemin que la cmdline porte RÉELLEMENT, et le motif ne doit plus être l'ancien
nom. Lue dans les sept fichiers, jamais recopiée d'un seul.

Lancement : python3 scripts/verify-garde-fantomes.py
"""
import glob
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Les juges qui lèvent un serveur sur un port fixé : chacun DOIT rattraper son
# propre fils orphelin, sinon le port reste tenu par une vieille base.
EXIGES = [
    "verify-auth", "verify-audit", "verify-hermes", "verify-mode-agent",
    "verify-mode-manuel", "verify-suggestions", "verify-surveillance",
]

ANCIEN_MOTIF = "cookdrive-project"
# Le dépôt est nommé `.clausio/claus.io` sur cette machine et c'est le MÊME nom
# que le dossier de données (src/db/init.ts) : le garde ne peut pas tuer les
# serveurs d'un dépôt voisin, il ne vise que celui-ci.
MOTIF_VIVANT = ".clausio/claus.io"


def fils_serveur_de_ce_depot():
    """Les PIDs dont la cmdline porte server.ts ET ce dépôt — ce que le garde doit voir."""
    vues = []
    for chemin in glob.glob("/proc/[0-9]*/cmdline"):
        try:
            with open(chemin, "rb") as f:
                brut = f.read().replace(b"\0", b" ").decode("utf-8", "replace")
        except OSError:
            continue
        if "server.ts" in brut and "tsx" in brut and MOTIF_VIVANT in brut:
            vues.append(int(chemin.split("/")[2]))
    return vues


def main():
    echecs = []
    jouees = 0

    # 1) le capteur est vivant : on démarre UN serveur de ce dépôt et on exige
    #    que la détection le voie. Sans cette étape, un garde qui ne tue rien
    #    passerait pour un garde qui a bien tué (c'est le défaut d'origine).
    donnees = os.path.join(BASE, "test", "tmp-garde-fantomes")
    os.makedirs(donnees, exist_ok=True)
    # 4177 est le port de scripts/probe-inventory-put-partial.mjs (qui le juge
    # PORT_OCCUPE=1 -> rc=5). Un port fixe est un contrat chez l'AUTRE : cette
    # porte ne le prend pas, elle se cale sur un port libre. Mesuré le 30/10 :
    # le fils de cette porte tenait 4177 et make verify:inventory-put-voices
    # rougissait rc=5 — une porte qui en fait rougir une autre n'est pas une
    # mesure, c'est une pollution du terrain.
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = str(s.getsockname()[1])
    s.close()
    env = dict(os.environ, PORT=port, USER_DATA_PATH=donnees, NODE_ENV="development")
    tsx = os.path.join(BASE, "node_modules", ".bin", "tsx")
    if not os.path.exists(tsx):
        print("SANS TERRAIN : node_modules/.bin/tsx absent — lancer `npm ci`")
        return 0
    import time
    import urllib.request
    journal = open(os.path.join(donnees, "serveur.log"), "w")
    fils = subprocess.Popen(["node", tsx, "server.ts"], cwd=BASE, env=env,
                            stdout=journal, stderr=subprocess.STDOUT)
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen("http://127.0.0.1:%s/api/settings" % port, timeout=2)
                break
            except Exception:
                time.sleep(0.25)
        vus = fils_serveur_de_ce_depot()
        jouees += 1
        if fils.pid not in vus:
            echecs.append(
                "le capteur de la porte ne voit pas son propre fils serveur (pid %d) — "
                "la porte serait decorative" % fils.pid)
    finally:
        try:
            fils.kill()
        except Exception:
            pass

    # 2) les sept juges doivent viser un motif que la cmdline porte vraiment.
    for nom in EXIGES:
        jouees += 1
        chemin = os.path.join(BASE, "scripts", nom + ".mjs")
        if not os.path.isfile(chemin):
            echecs.append("%s.mjs absent : le juge a disparu, sa garde aussi" % nom)
            continue
        with open(chemin, encoding="utf-8") as f:
            source = f.read()
        if "server.ts" not in source:
            echecs.append("%s.mjs ne demarre plus de serveur : le garde n'a plus d'objet" % nom)
            continue
        # Le motif est lu dans le CODE EXECUTABLE : un commentaire qui raconte la
        # lecon ("le motif etait cookdrive-project") n'est pas un garde. Juger les
        # commentaires ferait rougir un fichier correctement corrige.
        code = "\n".join(l for l in source.split("\n") if not l.lstrip().startswith("//"))
        if re.search(r'"%s"' % re.escape(ANCIEN_MOTIF), code):
            echecs.append(
                "%s.mjs tue sur l'ancien nom de depot (`%s`) : aucun fils ne le porte, "
                "le garde ne tue rien et le port reste tenu par une vieille base" % (nom, ANCIEN_MOTIF))
        elif MOTIF_VIVANT not in source:
            echecs.append("%s.mjs ne vise pas le nom reel du depot (`%s`)" % (nom, MOTIF_VIVANT))

    print("GARDE-FANTOMES portees=%d rouges=%d fils_vus=%d" % (jouees, len(echecs), len(vus)))
    for e in echecs:
        print("  ROUGE " + e)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
