#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonde du REDISPOST: POST /api/inventory avec `unit:""` et avec `unit` ABSENT.

Juger par commande EXECUTEE (AGENTS.md S1) sur un serveur reel isole:
- spawn tsx server.ts avec PORT fige et COOKDRIVE_INSTANCE_TOKEN,
- confronte l'en-tete X-Cookdrive-Instance (identite de l'instance),
- poste le payload EXACT que la sonde npm envoie, rejoue le GET de relecture,
- tranche le verdict par OCTETS du corps.

Le render mute les identifiants sur ce poste (piege consigne): les chiffres
sont calcules DANS le kernel, jamais cites a l'oeil.
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
# le fichier est NE dans scripts/ (commit 933bd78): sa racine est le PARENT de
# son dossier. Avec PROJ = BASE, le spawn cherchait scripts/server.ts et node
# mourait en ERR_MODULE_NOT_FOUND — et comme stderr partait dans DEVNULL, la
# sonde rendait SERVEUR_ABSENT=1 sans jamais dire pourquoi. Le sillage
# (serveur.err.log) a rendu le mot visible.
PROJ = os.path.dirname(BASE)

PORT = 3999
TOKEN = "juge-unite-vide-" + str(os.getpid())
OUT_DIR = os.path.join(os.path.expanduser("~"), "cookdrive-juge-unite-vide")


def req(method, path, corps=None):
    """POST/GET par http.request BRUT (pas fetch undici: il decompress seul)."""
    url = "http://127.0.0.1:%d%s" % (PORT, path)
    data = None
    headers = {"X-Cookdrive-Instance": TOKEN}
    if corps is not None:
        data = json.dumps(corps).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as rep:
            body = rep.read()
            return rep.status, body
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, body


def attendre_serveur():
    """Le port du POST doit dire QUI REPOND, sinon le harnais juge le voisin."""
    # Le demarrage froid dure ~60 s sur cette machine (chargement EpicureModel
    # + 15 migrations [SCHEMA]) — mesure du 24/09: COOKDRIVE_READY rendu 61 s
    # apres le spawn. Le veilleur de 60 x 0.5 s = 30 s mourait AVANT le pret et
    # rendait SERVEUR_ABSENT=1 sans dire pourquoi: l'attente doit couvrir le
    # temps de chargement reel, pas une moitie.
    for _ in range(240):
        try:
            code, corps = req("GET", "/api/settings")
            if code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def main():
    rc = 0
    faits = []
    if os.path.isdir(OUT_DIR):
        import shutil
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)
    env = dict(os.environ)
    env["PORT"] = str(PORT)
    env["COOKDRIVE_INSTANCE_TOKEN"] = TOKEN
    env["USER_DATA_PATH"] = OUT_DIR
    # NODE_ENV=production: sans lui, server.ts monte le middleware Vite du dev
    # (piege consigne), dont le websocket HMR veut 24678 — pris par le dev de
    # Stefan depuis le 19/09. Le serveur mourait a l'ecran et la sonde rendait
    # SERVEUR_ABSENT=1 sans jamais prononcer le mot « vite » ni « HMR ».
    env["NODE_ENV"] = "production"
    # Le fillet du conducteur: stdout/stderr dans des FICHIERS de OUT_DIR, pas
    # DEVNULL. Mesure du 24/09: avec DEVNULL le serveur ne lie JAMAIS le port
    # (sonde ss: 0 pendant 140 s), avec des fichiers il est pret et la sonde
    # rend IDENTITE_OK=1 + les deux semences. Le sillage sert aussi au diagnostic
    # d'un SERVEUR_ABSENT (il etait muet jusqu'ici).
    log_out = open(os.path.join(OUT_DIR, "serveur.out.log"), "wb")
    log_err = open(os.path.join(OUT_DIR, "serveur.err.log"), "wb")
    child = subprocess.Popen(
        ["node", "--import", "tsx", "server.ts"],
        cwd=PROJ, env=env,
        stdout=log_out, stderr=log_err,
        # le fils part dans SA PROPRE session : le fillet du conducteur tue le
        # groupe entier au timeout ou au finally (un child.kill() ne vise que
        # son pid, et le `tsx` qu'il a lui-même engendre lui survit — c'est
        # precisement le fils remanant 456081 qui a tenu 3999 depuis le 23/09
        # 08:09 et fait rougir la spec routes).
        start_new_session=True,
    )
    try:
        pret = attendre_serveur()
        if not pret:
            print("SERVEUR_ABSENT=1")
            rc = 2
            return rc
        # identite: l'en-tete dit qui sert, avant de juger quoi que ce soit
        code, corps = req("GET", "/api/settings")
        r = urllib.request.urlopen(urllib.request.Request(
            "http://127.0.0.1:%d/api/settings" % PORT, headers={"X-Cookdrive-Instance": TOKEN}), timeout=10)
        jeton = r.headers.get("X-Cookdrive-Instance")
        if jeton != TOKEN:
            print("IDENTITE_DIVERGE=1 jeton=%s attend=%s" % (jeton, TOKEN))
            rc = 3
            return rc
        faits.append("IDENTITE_OK=1")

        # --- SEMENCE A: unit="" (la voie que la sonde npm envoie) ------------
        code, corps = req("POST", "/api/inventory", {
            "name": "Sonde Sel Sans Unite", "quantity": 10, "minStock": 1,
            "unit": "", "status": "ok", "category": "Epicerie",
            "unit_price": 1000,
        })
        a = json.loads(corps.decode("utf-8")) if corps else {}
        faits.append("SEM_A_CODE=%d" % code)
        faits.append("SEM_A_ID=%s" % (a.get("id") or "ABSENT"))
        iid_a = a.get("id") if isinstance(a.get("id"), str) else None
        if iid_a:
            code, corps = req("GET", "/api/inventory")
            liste = json.loads(corps.decode("utf-8")) if corps else []
            ligne = next((x for x in liste if x.get("id") == iid_a), None)
            faits.append("SEM_A_UNIT_EN_BASE=%s" % json.dumps(ligne.get("unit") if ligne else "ABSENT"))
            faits.append("SEM_A_EXISTE=%d" % (1 if ligne else 0))
        else:
            faits.append("SEM_A_UNIT_EN_BASE=ABSENT")

        # --- SEMENCE B: champ ABSENT ---------------------------------------
        code, corps = req("POST", "/api/inventory", {
            "name": "Sonde Sel Sans Champ", "quantity": 10, "minStock": 1,
            "status": "ok", "category": "Epicerie", "unit_price": 1000,
        })
        b = json.loads(corps.decode("utf-8")) if corps else {}
        faits.append("SEM_B_CODE=%d" % code)
        iid_b = b.get("id") if isinstance(b.get("id"), str) else None
        if iid_b:
            code, corps = req("GET", "/api/inventory")
            liste = json.loads(corps.decode("utf-8")) if corps else []
            ligne = next((x for x in liste if x.get("id") == iid_b), None)
            faits.append("SEM_B_UNIT_EN_BASE=%s" % json.dumps(ligne.get("unit") if ligne else "ABSENT"))
            faits.append("SEM_B_EXISTE=%d" % (1 if ligne else 0))
        else:
            faits.append("SEM_B_UNIT_EN_BASE=ABSENT")
        print(" ".join(faits))
    finally:
        # Le fils est DETACHE : il est chef de son propre groupe. `child.kill()`
        # ne vise que son pid, et le `tsx` qu'il a lui-même engendre lui survit
        # (c'est precisement le fils remanant 456081 qui a tenu 3999 pendant
        # vingt heures et fait rougir la spec routes). `os.killpg` SIGKILL tout
        # le groupe.
        for sig in ("SIGTERM", "SIGKILL"):
            try:
                os.killpg(child.pid, getattr(signal, sig))
            except (ProcessLookupError, PermissionError, OSError):
                pass
            else:
                try:
                    child.wait(timeout=5)
                    break
                except subprocess.TimeoutExpired:
                    continue
        for f in (log_out, log_err):
            try:
                f.close()
            except OSError:
                pass
    return rc


if __name__ == "__main__":
    sys.exit(main())
