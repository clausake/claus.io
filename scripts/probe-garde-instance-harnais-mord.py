#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve que la CONFRONTATION D'INSTANCE des quatre harnais a ports figes MORD.

Pourquoi ce fichier existe. Les porte verify:sse, verify:perf, verify:http et
verify:ratelimit tiennent chacune un PORT FIGE (4126-4129) et, jusqu'ici,
jugeoient leur attente sur `r.ok` seul. Un `server.ts` orphelin (un fils qu'un
harnais a laisse vivre, ou un serveur d'un AUTRE projet du meme poste) repond
alors sur le port: le harnais juge QUI REPOND au lieu de l'instance qu'il a
lui-même lancée. C'est mot pour mot la classe de faute que
scripts/probe-instance-guard.mjs a ete ecrit pour chasser chez les SPECS
e2e — mais les quatre porte de perf/SSE/cache n'avoient pas ce garde, et
`verify:all` les comte comme vertes.

Ce harnais ne se contente donc pas d'affirmer le correctif: il le juge par la
SEULE voie qui prouve quelque chose, l'injection de la faute.

  1. CONTROL  : aucun imposteur sur le port -> la porte doit rendre VERT.
                (sans cette branche, un harnais casse rend « la mutation mord »
                 alors que rien n'a ete juge.)
  2. FAUTE    : un faux serveur occupe le port avec UN AUTRE jeton
                d'instance -> la porte doit rendre rc != 0 ET nommer la cause
                (« instance PERIMEE » + le port), au lieu de juger l'imposteur.
  3. RESTAURE : imposteur retire -> la porte doit rendre VERT (le filet de la
                branche 2 n'a pas casse le harnais).

Le token est exige: `instance PERIMEE` (le mot que la route du garde rend),
parce qu'un echec d'infrastructure rougit ausi et ne prouve rien du garde.

Lancement: python3 scripts/probe-garde-instance-harnais-mord.py
Le code de sortie EST le verdict: 0 = le garde mord.
"""
import os
import re
import socket
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPOSTOR = os.path.join(BASE, "test", "tmp-impostor-garde", "impostor.mjs")
PORTS = {"verify:sse": 4127, "verify:perf": 4128, "verify:http": 4129,
         "verify:ratelimit": 4126}

SOURCE_IMPOSTOR = """// Faux serveur: repond sur un port de harnais avec UN AUTRE jeton d'instance
// que celui que le harnais attend (le comportement d'un server.ts orphelin).
import { createServer } from "node:http";
const PORT = Number(process.argv[2]);
const TOKEN = process.argv[3];
const srv = createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "X-Cookdrive-Instance": TOKEN,
  });
  res.end('{"status":"ok","imposteur":true}');
});
srv.listen(PORT, "127.0.0.1", () => console.log("IMPOSTEUR_ECOUTE=" + PORT));
// ⚠ Sans ce gestionnaire, un EADDRINUSE laisse le process VIVANT sans qu'il
//    serve rien: le harnais croisait l'imposteur installe alors qu'il n'avait
//    jamais pu binder (le port etait tenu par un fils residue du runprecedent).
srv.on("error", (e) => {
  console.log("IMPOSTEUR_ERR=" + (e && e.code ? e.code : e));
  process.exit(9);
});
"""


def jeton_sert(port):
    """Le jeton que le DETENTEUR du port repond, ou None si personne n'y est.

    ⚠ Le predicat precedent etait « le port est occupe ». Il etait SATISFAIT
    PAR N'IMPORTE QUEL detenteur, y compris le fils du runprecedant que
    child.kill(SIGTERM) n'avoit pas encore tué: l'imposteur ne pouvot pas
    binder, et la porte jugeait le fils rémanant — qui porte, lui, le BON
    jeton. Verdict: « la mutation ne mord pas », pour une faute d'harnais.
    Ce qui prouve l'imposteur n'est pas l'occupation du port, c'est
    L'IDENTITE de ce qui y répond (la même regle que le contrat
    X-Cookdrive-Instance partout ailleurs dans ce dépôt).
    """
    try:
        import urllib.request as _rq
        with _rq.urlopen("http://127.0.0.1:%d/api/settings" % port, timeout=2) as r:
            return r.headers.get("x-cookdrive-instance")
    except Exception:
        return None


def attends_port_libre(port, budget=40):
    for _ in range(budget):
        if jeton_sert(port) is None:
            return True
        time.sleep(0.25)
    return False


def port_pris(port):
    """Vrai si QUELQU'UN tient le port. La semence du nom (liberer) rendait la
    logique LISIBLE A L'ENVERS: 'not port_pris()' devienant 'pris' etant vrai
    quand la connexion REUSSIT, l'attente d'imposteur pouvoit se satisfaire
    d'un port LIBRE. Un predicat a nommure inverse est un bug qui ne rougit
    pas: il ne se voit que quand le test qu'il garde passe sans rien juger."""
    with socket.socket() as s:
        s.settimeout(1.0)
        try:
            return s.connect_ex(("127.0.0.1", port)) == 0
        except OSError:
            return False


def lancer_porte(porte):
    p = subprocess.run(["npm", "run", porte, "--silent"], cwd=BASE,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, ((p.stdout or "") + (p.stderr or ""))


def lancer_imposteur(port):
    os.makedirs(os.path.dirname(IMPOSTOR), exist_ok=True)
    with open(IMPOSTOR, "w", encoding="utf-8") as f:
        f.write(SOURCE_IMPOSTOR)
    proc = subprocess.Popen([shutil_which("node"), IMPOSTOR, str(port),
                             JETON_IMPOSTEUR],
                            cwd=BASE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    # la precondition est verifiee, pas supposee: sans imposteur reellement a
    # l'ecoute, la branche FAUTE jugerait un vide et se declarerait mordante.
    deadline = time.time() + 20
    while time.time() < deadline and jeton_sert(port) != JETON_IMPOSTEUR:
        time.sleep(0.25)
    sert = jeton_sert(port)
    assert proc.poll() is None, ("imposteur MEURT sur %d (EADDRINUSE probable: un "
                                 "fils du runprecedant tient encore le port)" % port)
    assert sert == JETON_IMPOSTEUR, (
        "ce n'est PAS l'imposteur qui detient le port %d: l'en-tete repond %r, "
        "on attendait %r. Sans cette confrontation, la branche FAUTE jugerait un "
        "etranger (ou un fils residue au BON jeton) et se declarerait mordante."
        % (port, sert, JETON_IMPOSTEUR))
    return proc


def shutil_which(nom):
    from shutil import which
    return which(nom) or nom


JETON_IMPOSTEUR = "imposteur-d-un-autre-projet"


def juge(porte, port, resultats):
    # 1) CONTROL
    rc, out = lancer_porte(porte)
    resultats.append(("%s control (attendu VERT)" % porte, rc, rc == 0, out))

    # 2) FAUTE
    assert attends_port_libre(port), (
        "port %d encore tenu AVANT d'installer l'imposteur: child.kill(SIGTERM) "
        "ne suffit pas a tuer le fils de la porte (le wrapper tsx laisse un "
        "petit-fils). Sans cette attente, l'imposteur ne binder pas." % port)
    proc = None
    try:
        proc = lancer_imposteur(port)
        rc2, out2 = lancer_porte(porte)
        rougit = rc2 != 0
        # le token est verife par OCTETS sur ce que le garde IMPRIME (piege
        # consigne: le rendu de ce poste altere les identifiants, donc on
        # confronte la chaine cherchee a celle que le code du garde ecrit,
        # verifee plus haut par relecture du console.log)
        nomme = "instance PERIMEE" in out2
        resultats.append(("%s faute imposteur (attendu ROUGE + cause nommee)" % porte,
                          rc2, rougit and nomme, out2))
    finally:
        if proc is not None:
            proc.kill()
            try:
                proc.wait(timeout=15)
            except Exception:
                pass
        for _ in range(40):
            if not port_pris(port):
                break
            time.sleep(0.25)

    # 3) RESTAURE (au partir d'un port REELLEMENT libre, sinon cette branche
    #    jugerait le fils de la branche 2 au lieu du son propre serveur)
    assert attends_port_libre(port), "port %d tenu au moment du RESTAURE" % port
    rc3, out3 = lancer_porte(porte)
    resultats.append(("%s restaure (attendu VERT)" % porte, rc3, rc3 == 0, out3))


def main():
    # le lot ne doit pas tourner en meme temps: les ports seroient contandus
    # et le verdict ne prouverait plus le garde.
    for porte, port in PORTS.items():
        assert not port_pris(port), ("port %d deja occupe: ne rien lancer en parallèle "
                               "de ce harnais (attendre la fin du lot)" % port)

    resultats = []
    for porte, port in PORTS.items():
        try:
            juge(porte, port, resultats)
        except AssertionError as e:
            resultats.append(("%s precondition" % porte, -1, False, str(e)))

    print()
    print("=" * 78)
    print("PREUVE DE MORSURE - garde d'instance des quatre harnais a ports figes")
    print("=" * 78)
    failed = 0
    for label, rc, ok, out in resultats:
        print("  %s  %-70s rc=%s" % ("OK   " if ok else "ROUGE", label[:70], rc))
        if not ok:
            failed += 1
            for line in (out or "").splitlines():
                if re.search(r"(ECHEC|PASS|FAIL|instance|EADDRINUSE|Error)", line):
                    print("        |", line.strip()[:170])
    total = len(resultats)
    print("-" * 78)
    print("  %d/%d branches correctes" % (total - failed, total))
    print("  (control VERT / faute ROUGE+nommee / restaure VERT, par porte)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
