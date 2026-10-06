#!/usr/bin/env python3
# Preuve negative de la GARDE D'INSTANCE du spec de la chaine d'approvisionnement.
#
# Regle du projet : « un PASS qui ne peut pas devenir FAIL n'est pas une mesure »
# et « un garde qui ne mord pas est une decoration ». Cette sonde juge DONC le
# garde lui-même, dans ses DEUX directions :
#
#   A. Bras de controle  : le spec, sans intrus, doit etre VERT. Un controle rouge
#      rend l'experience nulle (les deux bras jugeraient du vide) -- c'est la
#      regle du bras de controle qui atteint le code mesure.
#   B. Garde armee        : une INSTANCE ETRANGERE tient le port que le spec croit
#     occupe. Le spec DOIT rougir et NOMMER « instance perimee ».
#   C. Garde desarmee     : la confrontation retiree (exactement l'etat historique
#      du fichier), le meme scenario passe VERT contre l'intrus. C'est le faux vert
#      qui a fait annoncer « la mutation M5 ne mord pas » (8/9) alors que M5 mord.
#
# Sans C, B ne prouve rien : un spec rouge pour n'importe quelle autre raison
# (serveur pas pret, port mort, seed vide) imite un garde qui mord. Ce qui
# discrimine, c'est le PAIRE B/C sur le MEME scenario.
#
# Lancement : python3 scripts/probe-instance-garde-mord.py
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
BASE = os.path.dirname(HERE)
SPEC_REL = os.path.join("test", "e2e", "purchasing-chain.spec.ts")
WORK = os.path.join(BASE, "test", "tmp-garde-mord")
ANCRAGE_PORT = "PORT = await portLibre();"
ANCRAGE_COMPAR = "if (vu !== INSTANCE_TOKEN) {"
JETON_GARDE = "instance perimee"


def lire(rel, racine=BASE):
    with open(os.path.join(racine, rel), encoding="utf-8") as f:
        return f.read()


def ecrire(rel, texte):
    p = os.path.join(WORK, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(texte)
    return p


def preparer_copie():
    """Copie isolee, a la forme prouvé du harnais de mutations (os.walk manuel)."""
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    keep = ("node_modules", "dist", "test-results", ".git", "test")
    for item in os.listdir(BASE):
        if item in set(keep):
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                               if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                # ⚠ dst et non WORK : WORK est la RACINE de la copie, dst le
                # miroir de l'arbre courant. Construit sous WORK, le repertoire
                # n'apparait jamais et le copy2 suivant meurt d'un ENOENT sur un
                # chemin parfaitement existant -- un faux diagnostic de l'arbre.
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith((".log", ".pyc")):
                        continue
                    if fn.startswith("__") and fn.endswith("__"):
                        continue
                    shutil.copy2(os.path.join(dirpath, fn),
                                 os.path.join(dst, rel, fn))
        else:
            shutil.copy2(src, dst)
    os.symlink(os.path.join(BASE, "node_modules"),
               os.path.join(WORK, "node_modules"))
    os.makedirs(os.path.join(WORK, "test", "e2e"), exist_ok=True)
    shutil.copy2(os.path.join(BASE, SPEC_REL), os.path.join(WORK, SPEC_REL))
    for other in os.listdir(os.path.join(WORK, "test", "e2e")):
        if other != os.path.basename(SPEC_REL):
            os.remove(os.path.join(WORK, "test", "e2e", other))


def port_libre():
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def sante(port, max_s=45.0):
    t0 = time.time()
    while time.time() - t0 < max_s:
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/api/settings" % port,
                                       timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.35)
    return False


def lancer_intrus(port, tag, env_surcroit=None):
    """UN SERVEUR HONNETE, lance par un AUTRE dossier, avec un AUTRE jeton.

    Il n'est pas « cassee » : c'est un serveur de l'etat du disque, parfaitement
    fonctionnel. C'est ce qui rend le faux vert dangereux -- il repond 200 a tout,
    il a meme ses propres donnees. Ce qu'il n'a PAS, c'est la source que le test
    croit juger.
    """
    tsx = os.path.join(BASE, "node_modules", ".bin", "tsx")
    data = os.path.join(WORK, "test", "tmp-intrus-" + tag)
    shutil.rmtree(data, ignore_errors=True)
    os.makedirs(data)
    env = dict(os.environ,
               PORT=str(port),
               USER_DATA_PATH=data,
               COOKDRIVE_INSTANCE_TOKEN="INTRUS-%d" % random.randrange(10 ** 9))
    # Le harnais du spec pose AUTH_OFF dans l'env de SON serveur ; un intrus qui
    # l'ignore jugerait le metier sous auth active -- defaut du harnais, pas de
    # la garde. L'intrus recoit donc le MEME contrat de harnais.
    if env_surcroit:
        env.update(env_surcroit)
    log = open(os.path.join(WORK, "intrus-%s.log" % tag), "w", encoding="utf-8")
    proc = subprocess.Popen([os.path.realpath(shutil.which("node") or "node"),
                             tsx, "server.ts"],
                            cwd=BASE, env=env, stdout=log, stderr=log)
    return proc, log


def rejouer_spec(env_surcroit=None):
    npx = shutil.which("npx")
    env = dict(os.environ)
    env.update(env_surcroit or {})
    p = subprocess.run([npx, "playwright", "test", SPEC_REL, "--reporter=line"],
                      cwd=WORK, capture_output=True, text=True, timeout=420,
                      env=env)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def tuer(proc):
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=20)
    except Exception:
        try:
            proc.kill()
            proc.wait(timeout=10)
        except Exception:
            pass


def installer_port_force():
    """Le spec doit ecouter LE PORT DE L'INTRUS, pas un port choisi par l'OS.

    C'est la reproduction fidele de la collision rencontree en lot : le port est
    demande a l'OS puis rendu, et quelqu'un d'autre le prend entre-temps. Ici le
    « quelqu'un d'autre » est installe exprès, donc la collision est deterministe.
    """
    src = lire(SPEC_REL, WORK)
    assert src.count(ANCRAGE_PORT) == 1, "ANCRAGE PORT absent/ambigu: %d" % src.count(ANCRAGE_PORT)
    ecrire(SPEC_REL, src.replace(
        ANCRAGE_PORT,
        "PORT = Number(process.env.COOKDRIVE_FORCE_PORT);"))


def desarmer_garde():
    src = lire(SPEC_REL, WORK)
    assert src.count(ANCRAGE_COMPAR) == 1, "ANCRAGE comparaison absent/ambigu"
    ecrire(SPEC_REL, src.replace(ANCRAGE_COMPAR, "if (false) {"))


def main():
    preparer_copie()
    verdicts = []
    intrus = None
    try:
        # --- A. bras de controle : le spec doit etre VERT sans intrus ---------
        rc_a, out_a = rejouer_spec()
        controle_vert = rc_a == 0
        verdicts.append(("A  bras de controle : le spec juge sans intrus est VERT",
                        controle_vert, "rc=%d" % rc_a))
        if not controle_vert:
            print(out_a[-3000:])
            print("CONTROL ROUGE : experience nulle, les deux bras jugeraient du vide.")
            return 2

        # --- B. garde armee : l'intrus tient le port -> le spec DOIT rougir ----
        port = port_libre()
        intrus, _ = lancer_intrus(port, "b", {"COOKDRIVE_AUTH_OFF": "1"})
        if not sante(port):
            verdicts.append(("B  garde armee : l'intrus repond sur le port", False,
                            "intrus pas pret: experience nulle"))
            return 2
        installer_port_force()
        rc_b, out_b = rejouer_spec({"COOKDRIVE_FORCE_PORT": str(port)})
        rougit = rc_b != 0
        nomme = JETON_GARDE in out_b
        verdicts.append(("B  garde armee : collision d'instance => ROUGE nomme",
                        rougit and nomme,
                        "rc=%d / motif « %s » %s" % (rc_b, JETON_GARDE,
                                                     "vu" if nomme else "ABSENT")))
        tuer(intrus)
        intrus = None

        # --- C. garde desarmee : le MEME scenario doit passer VERT ------------
        # C'est la direction qui discrimine B d'un simple « le setup est casse ».
        port2 = port_libre()
        intrus, _ = lancer_intrus(port2, "c", {"COOKDRIVE_AUTH_OFF": "1"})
        if not sante(port2):
            verdicts.append(("C  garde desarmee : l'intrus repond sur le port", False,
                            "intrus pas pret: experience nulle"))
            return 2
        desarmer_garde()
        rc_c, out_c = rejouer_spec({"COOKDRIVE_FORCE_PORT": str(port2)})
        faux_vert = rc_c == 0
        verdicts.append(("C  garde desarmee : le MEME scenario devient un faux VERT",
                        faux_vert,
                        "rc=%d (le spec a juge un serveur qu'il n'a pas installe)" % rc_c))
        tuer(intrus)
        intrus = None
    finally:
        tuer(intrus)
        shutil.rmtree(WORK, ignore_errors=True)

    print()
    print("=" * 78)
    print("PREUVE NEGATIVE - la garde d'instance du spec purchasing")
    print("=" * 78)
    rouge = 0
    for label, ok, detail in verdicts:
        print("  %s %-62s %s" % ("OK   " if ok else "ROUGE", label, detail))
        if not ok:
            rouge += 1
    print("-" * 78)
    print("  %d/%3d mordent" % (len(verdicts) - rouge, len(verdicts)))
    if rouge == 0:
        print("  => le garde juge quelque chose : la PAIRE B/C sur le même scenario")
        print("     est ce qui le distingue d'un simple setup casse.")
    return 1 if rouge else 0


sys.exit(main())
