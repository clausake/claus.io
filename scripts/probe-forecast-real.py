#!/usr/bin/env python3
# Sonde de la prevision d'achat sur la base REELLE du client.
#
# Pourquoi une sonde et non un test : un harnais qui seme lui-meme ses donnes
# peut semer une FORME que l'app n'ecrit jamais (c'est la faute du harnais d'index
# du 09/09 : `day` seme en noms de jour la ou l'app ecrit des dates ISO, et le
# verdict consigne etait moitie faux). Ici on ne seme RIEN : on copie la base du
# client et on compare la route a un ORACLE PYTHON ecrit a la main, sur les
# MEMMES lignes.
#
# Le defaut puni : `besoin_recettes` etait recopie a 0 pour CHAQUE ligne. La
# colonne « Besoin Recettes » du tableau Achats et la suggestion de commande
# (minStock - quantity + besoin_recettes) ne dependaient d'AUCUN plan de menu.
#
# Lancement : python3 scripts/probe-forecast-real.py [--db chemin]
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import datetime

HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
BASE = os.path.dirname(HERE)
CLIENT_DB = os.path.expanduser("~/promo_resto/udata/agent_culinaire.db")
TODAY = time.strftime("%Y-%m-%d")
HORIZON = 14
NODE = shutil.which("node")
assert NODE and "python" not in NODE.lower(), "mauvais interpreteur: " + str(NODE)

WORKROOT = os.path.join(os.path.expanduser("~"), ".cook-probe-forecast")


def backup(src, dst):
    # WAL ! un simple copy du seul .db rend une base VIDE (le .wal portait tout).
    a, b = sqlite3.connect(src), sqlite3.connect(dst)
    a.backup(b)
    a.close(); b.close()


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Server:
    def start(self, data_dir):
        self.port = free_port()
        log = open(os.path.join(data_dir, "server.log"), "w")
        self.log = log
        self.proc = subprocess.Popen(
            [NODE, os.path.join(BASE, "node_modules", ".bin", "tsx"), "server.ts"],
            cwd=BASE, stdout=log, stderr=log,
            env=dict(os.environ, PORT=str(self.port), USER_DATA_PATH=data_dir))
        deadline = time.time() + 35
        while time.time() < deadline:
            try:
                if self.call("GET", "/api/settings")[0] == 200:
                    return True
            except Exception:
                time.sleep(0.4)
        log.flush()
        print("SERVEUR PAS PRET:\n", open(os.path.join(data_dir, "server.log")).read()[-1800:])
        return False

    def call(self, method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path),
                                     data=body, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def stop(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
        self.log.close()


def covers_of(raw_json):
    """Les couverts d'une ligne de planning, en tolerent le double-encodage."""
    if not raw_json:
        return 1.0
    try:
        parsed = json.loads(raw_json)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        if not isinstance(parsed, dict):
            return 1.0
        v = parsed.get("couverts", parsed.get("covers", 1))
        v = float(v)
        return v if v > 0 else 1.0
    except Exception:
        return 1.0


def oracle_need(db_path, today, horizon):
    """Le calcul attendu, ecrit a la main et independant de la route."""
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT mp.recipe_id rid, mp.date d, mp.recipe_json rj,"
        " ri.inventory_id iid, ri.quantity_per_person qpp"
        " FROM menu_planning mp"
        " JOIN recipe_ingredients ri ON ri.recipe_id = mp.recipe_id"
        " WHERE mp.recipe_id IS NOT NULL AND mp.recipe_id <> ''").fetchall()
    d0 = datetime.datetime.strptime(today, "%Y-%m-%d").date()
    need, prises = {}, 0
    for r in rows:
        try:
            dd = datetime.datetime.strptime(r["d"][:10], "%Y-%m-%d").date()
        except Exception:
            continue
        if not (d0 <= dd <= d0 + datetime.timedelta(days=horizon)):
            continue
        prises += 1
        qpp = float(r["qpp"] or 0)
        if qpp <= 0:
            continue
        need[r["iid"]] = need.get(r["iid"], 0.0) + covers_of(r["rj"]) * qpp
    for iid in list(need):
        row = con.execute("SELECT yield_percent FROM inventory WHERE id = ?",
                          (iid,)).fetchone()
        y = 100.0
        if row and row[0] is not None:
            try:
                y = float(row[0])
            except Exception:
                y = 100.0
        if not (y > 0):
            y = 100.0
        need[iid] = round(need[iid] / (y / 100.0), 3)
    con.close()
    return need, prises


def name_of(db_path, iid):
    con = sqlite3.connect(db_path)
    r = con.execute("SELECT name, unit, quantity, minStock FROM inventory WHERE id = ?",
                    (iid,)).fetchone()
    con.close()
    if not r:
        return iid + " (inconnu)"
    return "%s [%s] stock=%s min=%s" % (r[0], r[1], r[2], r[3])


def main():
    db_src = CLIENT_DB
    if "--db" in sys.argv:
        db_src = sys.argv[sys.argv.index("--db") + 1]
    if not os.path.exists(db_src):
        print("BASE CLIENT ABSENT:", db_src)
        return 2

    shutil.rmtree(WORKROOT, ignore_errors=True)
    os.makedirs(os.path.join(WORKROOT, "udata"), exist_ok=True)
    data_dir = os.path.join(WORKROOT, "udata")
    db_copy = os.path.join(data_dir, "agent_culinaire.db")
    backup(db_src, db_copy)

    print("=" * 78)
    print("SONDE PREVISION D'ACHAT — base reelle du client (aucune graine)")
    print("=" * 78)
    print("  source        :", db_src)
    con = sqlite3.connect(db_copy)
    n_plats = con.execute("SELECT COUNT(*) FROM menu_planning").fetchone()[0]
    n_liees = con.execute("SELECT COUNT(*) FROM menu_planning"
                          " WHERE recipe_id IS NOT NULL AND recipe_id <> ''").fetchone()[0]
    n_ri = con.execute("SELECT COUNT(*) FROM recipe_ingredients").fetchone()[0]
    n_inv = con.execute("SELECT COUNT(*) FROM inventory").fetchone()[0]
    con.close()
    print("  menu_planning : %d lignes (%d liees a une recette)" % (n_plats, n_liees))
    print("  ingredients   : %d lignes de recette_ingredients, %d articles d'inventaire"
          % (n_ri, n_inv))

    if n_liees == 0:
        print("\nARRET : aucun plat de planifie n'est lie a une recette.")
        print("La base du client ne permet pas de juger la chaine — ne PAS conclure")
        print("qu'un besoin a 0 est une mesure : ce serait un scan vide chronometre.")
        shutil.rmtree(WORKROOT, ignore_errors=True)
        return 2

    need, prises = oracle_need(db_copy, TODAY, HORIZON)
    attendus = {k: v for k, v in need.items() if v > 0}
    print("  oracle        : %d lignes de plan dans [%s, +%d j], %d articles avec besoin"
          % (prises, TODAY, HORIZON, len(attendus)))
    if prises == 0:
        print("\nARRET : les %d plats planifies sont tous hors de la fenetre (dates" % n_liees)
        print("passees ou future au-dela de %d jours). Juger la prevision ici" % HORIZON)
        print("reviendrait a mesurer un scan vide. Relancez avec une base alimentee.")
        shutil.rmtree(WORKROOT, ignore_errors=True)
        return 2
    if not attendus:
        print("\nARRET : l'oracle ne rend AUCUN besoin non nul (gramatures a vide ?).")
        shutil.rmtree(WORKROOT, ignore_errors=True)
        return 2

    srv = Server()
    rc = 1
    checks = []
    try:
        if not srv.start(data_dir):
            return 2
        st, payload = srv.call("GET", "/api/purchasing/forecast")
        checks.append(("GET /forecast sort en 200", st == 200, "status=%s" % st))
        if st != 200:
            print(json.dumps(payload, ensure_ascii=False)[:700])
        items = (payload or {}).get("items")
        win = (payload or {}).get("window") or {}
        checks.append(("la reponse porte { items, window }",
                       isinstance(items, list) and bool(win.get("from")), str(payload)[:120]))
        checks.append(("la fenetre annonce le jour + l'horizon reels",
                       win.get("from") == TODAY and win.get("horizon") == HORIZON, str(win)))

        rendus = {}
        for it in (items or []):
            rendus[it.get("inventory_id")] = it.get("besoin_recettes")

        non_nuls = [k for k, v in rendus.items()
                    if isinstance(v, (int, float)) and v > 0]
        checks.append(("AU MOINS UN besoin non nul (le defaut d'origine: 0 partout)",
                       len(non_nuls) > 0, "non-nuls=%s" % len(non_nuls)))

        ecarts = []
        for iid, want in sorted(attendus.items(), key=lambda kv: -kv[1]):
            got = rendus.get(iid)
            if got is None:
                ecarts.append("%s absent du tableau" % iid)
            elif abs(got - want) > 0.011:
                ecarts.append("%s rendu=%s attendu=%s" % (iid, got, want))
        checks.append(("chaque besoin = l'oracle (couverts x gramature / rendement)",
                       not ecarts, " | ".join(ecarts[:4])))

        fuites = [k for k, v in rendus.items()
                  if isinstance(v, (int, float)) and v > 0 and k not in attendus]
        checks.append(("rien d'autre n'affiche un besoin (pas de fuite)",
                       not fuites, str(fuites[:3])))

        st0, p0 = srv.call("GET", "/api/purchasing/forecast?horizon=0")
        ok0 = st0 == 200 and all(isinstance(i.get("besoin_recettes"), (int, float))
                               for i in (p0 or {}).get("items", []))
        checks.append(("horizon=0 repond sans erreur ni NaN", ok0, "status=%s" % st0))

        un = sorted(attendus, key=lambda k: -attendus[k])[0]
        st1, p1 = srv.call("GET", "/api/purchasing/forecast?ids=" + un)
        got1 = (p1 or {}).get("items") or []
        ok1 = (st1 == 200 and len(got1) == 1 and got1[0].get("manual") is True
               and got1[0].get("inventory_id") == un)
        checks.append(("?ids= (ajout manuel) est honore par le serveur", ok1,
                       "status=%s n=%s" % (st1, len(got1))))

        st2, p2 = srv.call("GET", "/api/purchasing/forecast?ids=" +
                          urllib.parse.quote("1 OR 1=1"))
        ok2 = st2 == 200 and len((p2 or {}).get("items") or []) == len(items or [])
        checks.append(("un ?ids= malformate ignore le filtre (et ne vide pas)",
                       ok2, "status=%s n=%s" % (st2, len((p2 or {}).get("items") or []))))

        print()
        echoues = 0
        for label, ok, detail in checks:
            print("  %s %-58s %s" % ("OK  " if ok else "FAUX", label,
                                     "" if ok else "<- " + detail))
            if not ok:
                echoues += 1

        print("-" * 78)
        print("  TOP des besoins calcules (ce que le tableau Achats doit afficher):")
        for iid, v in sorted(attendus.items(), key=lambda kv: -kv[1])[:6]:
            print("    %9s  %s" % (round(v, 1), name_of(db_copy, iid)))
        print()
        if echoues == 0:
            print("VERDICT : la commande s'appuie desormais sur les COUVERTS PLANIFIES.")
            print("        %d articles avec un besoin non nul, %d lignes de plan jugees," % (len(non_nuls), prises))
            print("        confrontees a un oracle independant (aucune donne semelee).")
            rc = 0
        else:
            print("VERDICT : ECHEC — %d check(s) en defaut" % echoues)
            rc = 1
    finally:
        try:
            srv.stop()
        except Exception:
            pass
        shutil.rmtree(WORKROOT, ignore_errors=True)
    return rc


sys.exit(main())
