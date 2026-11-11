#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chantier 51 — LE SMOKE DES INSTALLATEURS N'EST PAS UN ORNEMENT.

Le defaut mesure le 11/11 (run 43049934179, job build-linux de
.github/workflows/build-windows.yml) : l'etape « smoke AppImage » a ete
JIGEE apres 10 minutes, et le journal du job (359 lignes) s'ARRETE a la
277e ligne — la ligne `sudo apt-get update -qq` du script de l'etape.
AUCUNE ligne `Get:`/`Unpacking`/`Setting up`, et MEME PAS les `echo` du
propre script. Un rouge sans temoin n'est pas un diagnostic : c'est un mur.

Cette porte joue le CONTRAT de cette etape, dans le YAML REEL du workflow
(elle ne re-ecrit pas le shell, elle verifie ce qui est ecrit — un controle
qui duplique la logique d'un juge ne juge que sa copie) :

  A. l'etape existe, elle n'est PAS en continue-on-error (le plan du 02/11
     l'interdit : un vert sans sonde ou un rouge tolere est un faux vert) ;
  B. la boucle d'attente est BORNEE par une horloge explicite et son echec
     NOMME la cause (jamais `sleep 60` nu, jamais un `wait` infini) ;
  C. LE CAPTEUR EST VIVANT : l'etape ecrit sa propre sortie PENDANT qu'elle
     tourne — `set -x` (chaque commande tracee avant d'etre jouee) et un
     chronometre `horloge`. C'est LA correction du 11/11 : sans ces deux-la,
     une etape jigee ne rend jamais que l'echoing du script.
  D. le chemin lent est CONDITIONNEL : `apt-get` n'est appele que si un
     paquet manque (sonde `dpkg -s`, JAMAIS `ldconfig -p | grep`, qui rend
     une absence fausse sur ce poste — mesure du 11/11), et `apt-get` n'est
     PAS muselle par `-qq`.
  E. le smoke est JOUE LOCALEMENT par ce script : le VRAI AppImage construit
     par electron-builder est lance sous xvfb-run et son serveur doit repondre
     200 sur /api/settings avec le compte-rendu de pret. Si aucun AppImage
     n'est construit sur ce poste, la porte rend SANS TERRAIN en nommant
     l'absence (rc=0, comme les autres sondes sans terrain du depot) — elle
     ne rend PAS un PASS gratuit : elle dit qu'elle n'a pas rejoue.

La MORSURE est jouee par ce script lui-meme (regle du depot : un capteur qui
ne peut pas rougir est un ornement) : il rejoue les quatre controles A-D sur
des copies MUTEREES du YAML, et chacune DOIT rougir. Une mutation qui ne
rougit pas est rendue comme faute.

Lancement : python3 scripts/verif-smoke-installateurs.py   (le rc EST le verdict)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOW = os.path.join(BASE, ".github", "workflows", "build-windows.yml")


def etape_smoke(texte):
    """Retourne le script de l'etape smoke, lu dans le YAML (pas dans un copie)."""
    try:
        import yaml
    except ImportError:
        raise RuntimeError("PyYAML absent : impossible de juger le YAML (ce n'est pas un vert)")
    data = yaml.safe_load(texte)
    jobs = data.get("jobs") or {}
    for nom, job in jobs.items():
        for pas in (job or {}).get("steps") or []:
            if "smoke" in str(pas.get("name", "")).lower():
                return nom, pas, (pas.get("run") or "")
    return None, None, ""


def controls(nom, pas, script):
    """Les quatre controle A-D, rendus sous forme (label, ok, detail)."""
    out = []

    def ajouter(label, ok, detail=""):
        out.append((label, bool(ok), detail))

    if nom is None:
        ajouter("A l'etape smoke existe dans le workflow", False, "aucune etape dont le nom contient « smoke »")
        return out

    ajouter("A l'etape smoke existe dans le workflow", True, nom)
    ajouter("A l'etape n'est pas en continue-on-error (plan du 02/11)",
            not pas.get("continue-on-error"))
    to = pas.get("timeout-minutes")
    ajouter("A l'etape a un timeout borne", isinstance(to, int) and 0 < to <= 20,
            "timeout-minutes=%s" % to)

    # B — la boucle d'attente est bornee ET nommee.
    ajouter("B la boucle d'attente est bornee par une horloge explicite",
            re.search(r"fin=\$\(\(SECONDS\s*\+\s*\d+\)\)", script) and re.search(r"while\s+\[\s*\$SECONDS\s*-lt\s+\$fin\s*\]", script),
            "fin=$((SECONDS + N)) puis while [ $SECONDS -lt $fin ]")
    echecs = re.findall(r'echec\s+"([^"]{5,})"', script)
    ajouter("B chaque echec NOMME sa cause", len(echecs) >= 3,
            "%d motifs d'echec nommes" % len(echecs))
    ajouter("B aucune attente aveugle (sleep nu sans horloge, wait infini)",
            not re.search(r"^\s*wait\s*$", script, re.M) and "sleep 60" not in script)

    # C — LE capteur vivant : la sortie doit sortir PENDANT l'etape.
    ajouter("C l'etape se trace elle-meme (set -x)", re.search(r"^\s*set\s+-x\s*(#.*)?$", script, re.M),
            "une etape jigee sans trace ne rend que l'echoing du script")
    ajouter("C l'etape rend un chronometre (horloge)",
            re.search(r"horloge\(\)\s*\{", script) and script.count("horloge ") >= 2,
            "le temps de chaque phase est ecrit AVANT la phase")

    # D — le chemin lent est conditionnel et non muselle.
    ajouter("D apt-get est conditionne par une sonde de paquet installe",
            re.search(r"dpkg\s+-s", script),
            "dpkg -s = le rc qui decide (jamais ldconfig -p | grep : faux positif mesure du 11/11)")
    ajouter("D ldconfig n'est PAS la sonde (le piege du 11/11)",
            # meme regle que pour -qq : le nom du capteur faux est ECrit dans la
            # consigne, ce qui le juge est la commande reellement appelee.
            not re.search(r"ldconfig", re.sub(r"#.*", "", script)),
            "ldconfig ne doit apparaître que dans le commentaire qui le nomme")
    ajouter("D apt-get n'est pas muselle par -qq",
            # on juge les COMMANDES, pas le commentaire qui raconte le defaut :
            # « -qq » cite dans la consigne n'est pas un apt-get muselle (le
            # retirer ferait rougir le juge sur une ligne de documentation).
            not re.search(r"apt-get[^\n|]*\s-qq", re.sub(r"#.*", "", script)),
            "la ligne de commandement seule decide, pas le commentaire")
    return out


def jouer_smoke_local():
    """E : le VRAI AppImage est lance et son serveur repond. rc=0/1/2 = vert/rouge/sans-terrain."""
    release = os.path.join(BASE, "release")
    candidats = []
    version = json.load(open(os.path.join(BASE, "package.json"), encoding="utf-8"))["version"]
    if os.path.isdir(release):
        candidats = [f for f in sorted(os.listdir(release)) if f.endswith(".AppImage") and version in f]
    if not candidats:
        print("  SANS TERRAIN aucun AppImage de la version %s dans release/ "
              "(construire `npm run build:linux` pour jouer cette voie)" % version)
        return 2
    if not shutil.which("xvfb-run"):
        print("  SANS TERRAIN xvfb-run absent de ce poste")
        return 2
    appimage = os.path.join(release, candidats[-1])
    port = "3995"
    tmp = os.path.join("/tmp/opencode", "smoke-porte")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    env = dict(os.environ, TMPDIR=tmp, PORT=port)
    log_path = os.path.join(tmp, "smoke.log")
    log = open(log_path, "w")
    # PAS de `xvfb-run` sans-cas : mesure du 11/11, la PORTE elle-meme laissait
    # un AppImage orphelin, et le deuxieme lancement rendait `rc=127` (xvfb-run
    # meurt quand son affichage est deja pris). On fixe un affichage et on tue
    # TOUT l'arbre (processus groupe) a la sortie : une sonde qui souille la
    # machine ne rejoue pas deux fois, donc elle ne prouve rien.
    affiche = os.environ.get("SMOKE_PORTE_AFFICHAGE", "77")
    proc = subprocess.Popen(["xvfb-run", "-a", "-f", "/tmp/opencode/xvfb-%s.server" % affiche,
                             appimage, "--appimage-extract-and-run",
                             "--no-sandbox", "--disable-gpu"],
                            stdout=log, stderr=subprocess.STDOUT, env=env,
                            preexec_fn=os.setsid)
    rendu = 2
    try:
        fin = time.time() + 90
        pret = os.path.join(tmp, "cookdrive-ready.json")
        while time.time() < fin:
            if proc.poll() is not None:
                print("  FAUTE l'AppImage est mort avant de repondre (rc=%s)" % proc.returncode)
                rendu = 1
                break
            if os.path.exists(pret):
                code = subprocess.run(["curl", "-s", "-m", "5", "-o", "/dev/null",
                                       "-w", "%{http_code}",
                                       "http://127.0.0.1:%s/api/settings" % port],
                                      capture_output=True, text=True).stdout.strip()
                if code == "200":
                    jeton = json.load(open(pret, encoding="utf-8")).get("instance", "")
                    entete = subprocess.run(
                        ["curl", "-s", "-m", "5", "-D", "-", "-o", "/dev/null",
                         "http://127.0.0.1:%s/api/settings" % port],
                        capture_output=True, text=True).stdout
                    corps = subprocess.run(["curl", "-s", "-m", "5",
                                            "http://127.0.0.1:%s/" % port],
                                           capture_output=True, text=True).stdout
                    if jeton and ("x-cookdrive-instance: %s" % jeton in entete.replace("\r", "").lower()
                                  or "X-Cookdrive-Instance: %s" % jeton in entete.replace("\r", "")):
                        if '<div id="root">' in corps:
                            print("  OK   E le VRAI AppImage repond : /api/settings 200, "
                                  "jeton %s conforme, UI rendue" % jeton[:8])
                            rendu = 0
                        else:
                            print("  FAUTE E GET / ne rend pas <div id=\"root\">")
                            rendu = 1
                    else:
                        print("  FAUTE E le jeton d'instance du compte-rendu ne correspond pas a l'en-tete")
                        rendu = 1
                else:
                    print("  FAUTE E /api/settings rend %s (attendu 200)" % code)
                    rendu = 1
                break
            time.sleep(2)
        else:
            print("  FAUTE E aucun compte-rendu de pret en 90 s")
            rendu = 1
    finally:
        # on tue le GROUPE de processus entier (xvfb-run, l'AppImage extrait,
        # ses enfants) : leave un orphelin casse le prochain lancement (rc=127).
        try:
            os.killpg(os.getpgid(proc.pid), 15)
        except (ProcessLookupError, PermissionError):
            proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), 9)
            except (ProcessLookupError, PermissionError):
                proc.kill()
        log.close()
        # La sonde des orphelins se nomme ELLE-MEME : `pgrep -f appimage_extracted`
        # matche AUSSI le pgrep qui cherche (sa propre ligne de commande porte le
        # motif). Mesure du 11/11 : un pgrep seul rend 0 ligne alors que python3 -c
        # rend 2 lignes — deux instruments, deux verdicts. On croise donc par
        # /proc (la cmdline du noyau, pas une table d'outils) et on ne signale que
        # ce qui survit a l'attendre : un orphelin qui meurt pendant qu'on le
        # regarde n'est pas une machine souillee.
        motif = "appimage_" + "extracted"
        with open("/proc/self/cmdline", "rb") as fh:
            moi = fh.read().replace(b"\0", b" ").decode("utf-8", "replace")

        def orphelins():
            vivants = []
            for pid in os.listdir("/proc"):
                if not pid.isdigit() or int(pid) == os.getpid():
                    continue
                try:
                    with open("/proc/%s/cmdline" % pid, "rb") as fh:
                        cmd = fh.read().replace(b"\0", b" ").decode("utf-8", "replace")
                except OSError:
                    continue
                # UN SEUL instrument, et il est nommé : le motif est épelé pour
                # que la cmdline de CETTE sonde ne puisse pas le porter, et la
                # propre cmdline de python3 est lue AVANT la boucle (mesure du
                # 11/11 : `pgrep -f` rendait 0 ligne alors que /proc en rendait
                # 2 — deux instruments, deux verdicts, et le doute est un
                # capteur mort).
                if motif in cmd and motif not in moi:
                    vivants.append(pid)
            return vivants
        # L'attente est JUEGEE par le meme instrument que le verdict. La
        # premiere version bouclait sur `orphelins()` et imprimait un DEUXIEME
        # appel a `orphelins()` : la variable locale `motif` n'existait que dans
        # la portée de la fermeture, le second appel levait donc NameError au
        # moment precis ou la porte aurait du crier. Mesure du 11/11 : la FAUTE
        # etait imprimee sur un pid fantome et VERDICT : VERT quand meme. Depuis,
        # le verdict est rendu par LA MEME liste que celle qui a fait tourner la
        # boucle, et le compte est ecrit.
        vivants = []
        for _ in range(10):
            vivants = orphelins()
            if not vivants:
                break
            time.sleep(1)
        if vivants:
            print("  FAUTE des AppImage orphelins survivent a la sonde : %s "
                  "(la porte souille la machine, elle ne pourra pas rejouer)"
                  % ",".join(vivants[:4]))
        shutil.rmtree(tmp, ignore_errors=True)
    return rendu


def morsure(texte_original):
    """Les quatre mutations, chacune DOIT rougir. Rend la liste des muterons decoratifs."""
    mutations = [
        ("A continue-on-error: true est tolere",
         lambda t: t.replace("- name: smoke AppImage",
                             "- name: smoke AppImage\n        continue-on-error: true", 1)),
        ("B la boucle d'attente perd son horloge (while 1)",
         lambda t: t.replace("while [ $SECONDS -lt $fin ]; do", "while true; do", 1)),
        ("C l'etape ne se trace plus (set -x retire)",
         lambda t: t.replace("          set -x  ", "          # set -x  ", 1)),
        ("D apt-get redevient inconditionnel et muselle (-qq)",
         lambda t: t.replace('if [ -n "$manque" ]; then', "if [ -n \"$manque\" ] || true; then", 1)
                 .replace("apt-get -o Dpkg::Use-Pty=0 update", "apt-get -qq update", 1)),
    ]
    decoratifs = []
    for label, muter in mutations:
        texte = muter(texte_original)
        if texte == texte_original:
            decoratifs.append(label + " — la mutation ne change RIEN au YAML (morsure morte)")
            continue
        nom, pas, script = etape_smoke(texte)
        rouges = [c for c in controls(nom, pas, script) if not c[1]]
        print("  %-58s -> %s" % (label, "ROUGE (%s)" % rouges[0][0] if rouges else "VERT : MORSURE MORTE"))
        if not rouges:
            decoratifs.append(label + " — le juge ne rougit pas")
    return decoratifs


def principale():
    echecs = []
    if not os.path.exists(WORKFLOW):
        print("  FAUTE le workflow est absent : %s" % WORKFLOW)
        return 1
    texte = open(WORKFLOW, encoding="utf-8").read()
    nom, pas, script = etape_smoke(texte)
    for label, ok, detail in controls(nom, pas, script):
        print(("  OK   " if ok else "  FAUTE ") + label + ((" — " + detail) if detail else ""))
        if not ok:
            echecs.append(label)

    print("MORSURE (quatre mutations du YAML reel, chacune doit rougir) :")
    decoratifs = morsure(texte)
    for d in decoratifs:
        print("  FAUTE " + d)
        echecs.append("morsure: " + d)

    print("SMOKE LOCAL (le vrai AppImage, lance par cette porte) :")
    rendu = jouer_smoke_local()
    if rendu == 1:
        echecs.append("le vrai AppImage ne repond pas")

    print("SMOKE_INSTALLATEURS=%s  FAUTES=%d"
          % ("SANS_TERRAIN" if rendu == 2 else ("VERT" if rendu == 0 else "ROUGE"), len(echecs)))
    if echecs:
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1
    print("VERDICT : VERT (etape bornee, capteur vivant, apt-get conditionnel"
          + (", AppImage rejoue localement" if rendu == 0 else ", AppImage non rejoue : sans terrain") + ")")
    return 0


if __name__ == "__main__":
    sys.exit(principale())
