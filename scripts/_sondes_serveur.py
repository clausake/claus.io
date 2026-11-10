#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assainissement des fils de sonde qui levent un serveur (Sprint 14.d).

Pourquoi ce module existe. Les sondes qui bootent `tsx server.ts` en fils
appelaient `child.kill()` ou `terminate()`: ces appels ne visent que le PID du
fils direct, et le `tsx` que ce fils a lui-meme engendre lui SURVIT en orphelin
accroche au port fige. C'est exactement ce qui s'est passe du 23 au 24/09:
quatre orphelins (456081 sur 3999, 2228278 sur 4321, 2226342 sur 4331,
2237431 sur 4351) ont tenu des ports pendant des dizaines d'heures et ont fait
rougir les portes voisines avec un message ("SERVEUR PAS PRET" / "INSTANCE
ETRANGERE") qui designait un serveur qui n'etait pas le leur -- un verdict FAUX,
pas un echec du produit.

La regle: le fils part dans SA PROPRE session (`start_new_session=True`) et on
le tue par GROUPE (`os.killpg`), SIGTERM puis SIGKILL. Un port fige tenu par
quelqu'un d'autre est REFUSE avant le boot (`port_libre`): juger un serveur
qu'on n'a pas leve n'est pas juger son serveur.

Consigne, pas dupliquee: la logique est ici, les sondes ne font que l'appeler.
"""
import os
import signal
import socket
import subprocess
import sys


def port_libre(port, hote="127.0.0.1"):
    """True si PERSONNE n'ecoute sur ce port. Un port fige occupe par un
    orphelin rend la sonde FAUSSEMENT rouge: on le refuse avant de booter."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(2)
        return s.connect_ex((hote, port)) != 0


def tuer_groupe(proc, delais=6):
    """SIGTERM puis SIGKILL sur le GROUPPE entier (le fils est chef de session).
    Ne remonter au `proc.kill()` seul: il ne tue pas le petit-fils `tsx`.

    Chantier 46 — sous WINDOWS, il n'y a pas de groupe de processus :
    `os.killpg` y echoue (le PID negatif n'y a pas de sens), et le serveur
    `tsx` (petit-fils) SURVIT, garde le port, et la sonde suivante rend un
    verdict FAUX (« SERVEUR PAS PRET »). On passe donc par `taskkill /T /F`,
    qui tue l'ARBORESCENCE entiere du PID qu'on a lance — et rien d'autre
    (le serveur installe sur le port 3000 n'est jamais touche).
    """
    if proc is None:
        return
    if sys.platform.startswith("win"):
        try:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=delais,
            )
        except (OSError, subprocess.SubprocessError):
            pass
        try:
            proc.wait(timeout=delais)
        except subprocess.TimeoutExpired:
            pass
        return
    for sig in ("SIGTERM", "SIGKILL"):
        try:
            os.killpg(proc.pid, getattr(signal, sig))
        except (ProcessLookupError, PermissionError, OSError):
            pass
        else:
            try:
                proc.wait(timeout=delais)
                return
            except subprocess.TimeoutExpired:
                continue
    try:
        proc.kill()
    except OSError:
        pass


def orphelins_sur(port):
    """Liste des PID qui tiennent ce port, pour que le message d'echec nomme
    le coupable au lieu de laisser l'agent chercher a l'aveugle."""
    try:
        out = subprocess.run(
            ["fuser", "-n", "tcp", str(port)],
            capture_output=True, text=True, timeout=10)
        return sorted({int(x) for x in out.stdout.split() if x.isdigit()})
    except Exception:
        return []


def bootstrap(port, argv0=None):
    """Le garde d'entree commun des sondes-a-serveur: refuse un port fige
    occupe (rc=5, le code de la famille PORT_OCCUPE des sondes deja corrigees)
    et rend le message avec le PID du tenant."""
    if port_libre(port):
        return
    print("PORT_OCCUPE=%d par %s -- un orphelin tient ce port: la sonde jugerait "
          "un serveur qui n'est pas le sien (piege consigne Sprint 14.d). "
          "Tuer ces PID puis relancer." % (port, orphelins_sur(port) or "inconnu"))
    sys.exit(5)


def Popen_sonde(cmd, **kw):
    """Popen avec le fils detache dans sa propre session: precondition du
    tuer_groupe. Tout les autres mots-cles passent tels quels."""
    kw.setdefault("start_new_session", True)
    return subprocess.Popen(cmd, **kw)
