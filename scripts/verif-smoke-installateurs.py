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


def decoupe_etapes(texte):
    """Les etapes du workflow, LUES SANS DEPENDANCE EXTERNE.

    MESURE DU 11/11 (run 43064621842, artefact gates-output, artefact
    conserve) : la porte a rouge sur le runner par `ModuleNotFoundError: No
    module named 'yaml'`. La cause etait dans CETTE porte : elle appelait
    `import yaml` (PyYAML n'est installe ni par npm ci, ni par
    actions/setup-python, ni par requirements.txt — `grep -rln "import yaml"
    scripts/` ne la citait qu'elle, ce qui voulait dire qu'aucune autre porte
    du depot n'avait jamais rencontre le probleme). Deux issues, toutes deux
    gardees :

      - un capteur qui ne tourne pas chez celui qu'il est cense surveiller
        n'est pas un capteur. Ici le rouge etait REEL (la porte ne pouvait pas
        juger) et bien visible : elle ne s'est pas tuee en vert, ce qui est la
        seule chose qu'un capteur absent a le droit de faire ;
      - la dependance est RETIREe plutot que declaree. Le depot a une regle :
        aucune dependance inutile. Or ce qui est juge est une propriete
        SYNTAXIQUE du YAML — « telle etape porte-t-elle `timeout-minutes`,
        `continue-on-error`, et quel est son `run:` ». Un lecteur de 25 lignes,
        borne aux deux niveaux qui nous interessent (les etapes d'un job, leurs
        cles scalaires et leurs blocs `run: |`), suffit et ne peut pas tomber
        en panne d'importation sur un runner.

    PyYAML reste UTILISE quand il est la (il est sur ce poste) : la porte
    croise alors les deux lecteurs et ROUGIT s'ils ne rendent pas le meme
    script d'etape. Un lecteur maison non croise serait une copie de mauvaise
    foi ; croise, il est un instrument.
    """
    # Les sauts de ligne sont CONSERVES (re.split sur une expression avec
    # groupe capturant les rendrait en elements separes, ce qui detruit le
    # texte) : chaque element commence par un tiret d'etape, les commentaires
    # de niveau liste restent attaches a l'etape qui les precede — donc une
    # ligne `# set -x` mutee dans le script d'une etape est vue PAR CETTE
    # ETAPE, et sa morsure ne peut pas devenir muette.
    # Les sauts de ligne sont CONSERVES (un re.split avec groupe CAPTURANT
    # rend les groupes en elements separes, ce qui detruit le texte : mesure du
    # 11/11, le premier lecteur ne rendait qu'un seul bloc). Le filtre sur
    # `- name|uses|run|shell` est pareillement FAUX : les premieres cles d'une
    # etape sont `uses: actions/checkout@v4`, `run: npm ci` ou `- id:`, jamais
    # `name:` — meme mesure, il rendait « 1 etape » et la porte declarait
    # l'etape smoke ABSENTE. On decompe donc le YAML PAR INDENTATION : le tirage
    # d'un item est porte par son TIRET, fait exact et independant de tout nom
    # de cle. Les commentaires de niveau liste restent attaches a l'etape qui
    # les precede, donc une ligne `# set -x` mutee dans le script d'une etape
    # est vue PAR CETTE ETAPE et sa morsure ne peut pas devenir muette.
    lignes = texte.split("\n")
    etapes = []

    def indentation(l):
        return len(l) - len(l.lstrip(" \t"))

    cles_etape = r"(?:name|uses|run|shell|id|if|env|with|timeout-minutes|continue-on-error)"

    def extrait(corps):
        nom = re.search(r"^\s*-?\s*name:\s*(.+?)\s*$", corps, re.M)
        if not nom:
            return None
        pas = {"name": nom.group(1).strip().strip("'\"")}
        co = re.search(r"^\s*continue-on-error:\s*(true|false)\s*$", corps, re.M)
        if co:
            pas["continue-on-error"] = (co.group(1) == "true")
        to = re.search(r"^\s*timeout-minutes:\s*(\d+)\s*$", corps, re.M)
        if to:
            pas["timeout-minutes"] = int(to.group(1))
        if re.search(r"^\s*uses:\s*softprops/action-gh-release", corps, re.M):
            pas["_uses_release"] = True
        m = re.search(r"^([ \t]*)run:[ \t]*[|>]-?[ \t]*\n", corps, re.M)
        if not m:
            pas["run"] = ""
            return pas
        # le corps du bloc s'arrete a la premiere ligne pas plus indentifiee que
        # la cle `run:` : [ \t]{8,} etait un choix fragile (corps a 10 espaces,
        # cle d'etape a 8 — la suivante aurait pu etre avalee).
        retrait = len(m.group(1))
        corps_run = []
        for ligne in corps[m.end():].split("\n"):
            if ligne.strip() == "":
                corps_run.append(ligne)
                continue
            if (len(ligne) - len(ligne.lstrip(" \t"))) <= retrait:
                break
            corps_run.append(ligne)
        while corps_run and corps_run[-1].strip() == "":
            corps_run.pop()
        pas["run"] = "\n".join(corps_run) + ("\n" if corps_run else "")
        return pas

    i = 0
    while i < len(lignes):
        l = lignes[i]
        m = re.match(r"^([ \t]*)-\s", l)
        if not m or not re.match(r"^[ \t]*-[ \t]+" + cles_etape + r":", l):
            i += 1
            continue
        tiret = len(m.group(1))
        bloc = [l]
        j = i + 1
        while j < len(lignes):
            s = lignes[j]
            if s.strip() == "":
                bloc.append(s); j += 1; continue
            ind = indentation(s)
            if ind <= tiret:
                break
            if re.match(r"^[ \t]*-\s", s) and ind == tiret:
                break
            bloc.append(s); j += 1
        pas = extrait("\n".join(bloc))
        if pas:
            etapes.append(pas)
        i = max(j, i + 1)
    return etapes


def etape_smoke(texte):
    """Le script de l'etape smoke, lu par le lecteur maison, croise avec PyYAML s'il existe."""
    etapes = [e for e in decoupe_etapes(texte) if "smoke" in e["name"].lower()]
    if len(etapes) > 1:
        raise RuntimeError("deux etapes « smoke » dans le workflow : laquelle juger ? %s"
                           % [e["name"] for e in etapes])
    if not etapes:
        return None, None, ""
    pas, script = etapes[0], etapes[0]["run"]
    import textwrap as _tw
    try:
        import yaml  # optionnel : s'il est la, il contredit ou confirme le lecteur maison
    except ImportError:
        # le meme demariage est applique SANS PyYAML : sinon les controles
        # jugeraient un texte garde a 10 espaces de retrait selon que le module
        # est installe ou non, et `^set -x$` ne matcherait plus sur le runner.
        # Un capteur dont le verdict depend du paquetage du runner est un
        # capteur faux — c'est exactement la classe du rouge « PyYAML absent ».
        return etapes[0]["name"], pas, _tw.dedent(script).strip() + "\n"
    data = yaml.safe_load(texte)
    ref = None
    for nom, job in (data.get("jobs") or {}).items():
        for p in (job or {}).get("steps") or []:
            if "smoke" in str(p.get("name", "")).lower():
                ref = p
    if ref is None:
        raise RuntimeError("PyYAML ne voit aucune etape smoke alors que le lecteur maison en voit une")
    if (ref.get("run") or "").strip() != script.strip():
        # la comparaison se fit par LIGNES (et non sur les chaines brutes) : un
        # bloc YAML `run: |` est REDENTRE de 10 espaces dans le fichier, et le
        # premier comparatif rendait 5 962 o contre 4 952 o pour un texte ligne
        # a ligne IDENTIQUE — 106 lignes x 10 espaces de retrait commun. Le
        # retirer par textwrap.dedent laisse un lecteur qui dit la meme chose
        # que PyYAML sans le faire semblant.
        import textwrap
        brut = textwrap.dedent(script).strip()
        if brut != (ref.get("run") or "").strip():
            raise RuntimeError("les DEUX lecteurs ne rendent pas le meme script d'etape "
                               "(%d lignes vs %d) : le lecteur maison est en defaut"
                               % (len(brut.splitlines()), len((ref.get("run") or "").splitlines())))
        script = brut
    for cle in ("timeout-minutes",):
        if ref.get(cle) != pas.get(cle):
            raise RuntimeError("desaccord des lecteurs sur %s : %r vs %r"
                               % (cle, ref.get(cle), pas.get(cle)))
    return etapes[0]["name"], pas, script


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
    # le detail dit QUEL LECTEUR a rendu le chiffre : apres le rouge « PyYAML
    # absent » du 11/11, la porte doit pouvoir dire d'ou vient chaque fait.
    try:
        import yaml  # noqa: F401  (present => les deux lecteurs ont croise)
        lecteur = "PyYAML + lecteur maison croises"
    except ImportError:
        lecteur = "lecteur maison seul (PyYAML absent du runner)"
    ajouter("A l'etape a un timeout borne", isinstance(to, int) and 0 < to <= 20,
            "timeout-minutes=%s [%s]" % (to, lecteur))

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
        # SANS TERRAIN n'est pas un vert simple : la voie ne peut etre jouee ICI
        # que par le job linux du workflow (celui qui construit l'AppImage), et
        # c'est lui qui la rejoue a chaque publication — mesure du 11/11, run
        # 43109022436 : `SMOKE OK — AppImage : /api/settings 200, jeton conforme,
        # UI rendue`. Sur ce poste, sans installeur de la version courante, la
        # porte nomme l'absence et dit ou la voie est jouee, au lieu d'un PASS
        # qui laisserait croire qu'elle a lance quelque chose.
        print("  SANS TERRAIN aucun AppImage de la version %s dans release/ "
              "(construire `npm run build:linux` pour jouer cette voie ; elle est "
              "jouee a chaque publication par le job build-linux du workflow, "
              " preuve: l'etape « smoke AppImage » du run)" % version)
        return 2
    if not shutil.which("xvfb-run"):
        print("  SANS TERRAIN xvfb-run absent de ce poste (la voie est jouee par "
              "le job build-linux du workflow a chaque publication)")
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
        # La mutation est ecrite a l'INDENTATION EXACTE de l'etape (6 espaces
        # pour une cle d'etape, 8 pour son corps). Une mutation mal indentee
        # n'est pas une mutation : mesure du 11/11, `continue-on-error: true`
        # insere a 8 espaces etait un element de la LISTE `env:` — donc
        # l'etape ne le portait pas, le juge ne pouvait pas rougir, et la
        # morsure etait MORTE sans que rien ne le dise. C'est le defaut exact
        # que la morsure est la pour ecarter, et le controle ci-dessous ne
        # peut plus le manquer : il verifie d'abord que la mutation change le
        # PARCOURS DU LECTEUR, pas seulement les octets du fichier.
        # Le MOTIF DE LA MUTATION EST UN FAIT QUI SE VERIFIE, PAS UNE INTENTION.
        # Deux morts successives de cette morsure, mesurées du 11/11 :
        #   1. le motif `- name: smoke AppImage` etait TROUVE dans le texte du
        #      workflow, donc `replace` inserait la cle AU MILIEU du libellé de
        #      l'etape (`- name: smoke AppImage\n        continue-on-error: true
        #      (le serveur empaquete…)`) : l'etape ne portait pas la cle et le
        #      juge ne pouvait pas rougir ;
        #   2. le motif `- name:` sans l'indentation ne matchait rien du tout.
        # D'ou la double garde : le motif est ancre sur la LIGNE ENTIERE
        # (^…$ en multiline), et la mutation est refusee si le LECTEUR ne voit
        # pas la cle muter. Une mutation qui change les octets mais pas ce que
        # lit le juge n'est pas une morsure, c'est un commentaire de plus.
        ("A continue-on-error: true est tolere",
         lambda t: re.sub(r"(^      - name: smoke AppImage.*$)",
                          r"\1\n        continue-on-error: true", t, count=1, flags=re.M)),
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
        # LA MORSURE EST-ELLE VIVANTE AVANT MEME DE JUGER ? On ne se contente
        # pas de « le texte a change » : on exige que le LECTEUR voie la cle
        # muter (continue-on-error passe a True, timeout disparait, etc.). Une
        # mutation qui change les octets mais pas ce que lit le juge n'est pas
        # une morsure, c'est un commentaire de plus.
        if "continue-on-error" in label:
            # UN SEUL instrument rend le fait : c'est le LECTEUR MAISON qui est
            # juge (c'est lui qui tourne sur le runner sans PyYAML). Demander ce
            # fait a `etape_smoke`, qui croise avec PyYAML quand le module est
            # la, ferait depender la morsure du paquetage du poste : avec
            # PyYAML installe, le juge maison n'est plus exerce et la morsure
            # parait morte (mesure du 11/11). Le croisement PyYAML reste une
            # GARANTIE (elle rougit si les lecteurs divergent), pas la source.
            lu = [e for e in decoupe_etapes(texte) if "smoke" in e["name"].lower()]
            if not lu or lu[0].get("continue-on-error") is not True:
                decoratifs.append(label + " — la mutation n'atteint PAS le lecteur "
                                  "(continue-on-error lu par le lecteur maison = %r) : morsure morte"
                                  % (None if not lu else lu[0].get("continue-on-error")))
                continue
        if "set -x" in label and "set -x" in script.replace("# set -x", ""):
            decoratifs.append(label + " — la mutation n'a pas retire set -x du script lu")
            continue
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
