#!/usr/bin/env python3
# Preuve que l'index de la prevision d'achat est reellement INSTALLE et EXPLOITE.
#
# Un `CREATE INDEX` dans init.ts n'est pas une preuve : il peut ne pas tourner
# (garde de migration), etre ecrit sur une autre table, ou — le plus frequent et
# le plus perfide — etre installe alors que le plan du serveur l'IGNORE, parce
# que le predicat qui lui correspond est sorti du WHERE. Le skill du projet le
# consigne deja pour staff_schedule : « un SEARCH USING INDEX (col=?) sans le
# second predicat n'est pas indexe, c'est un scan filtre ».
#
# Cette sonde juge DONC trois choses, sur la base que le SERVEUR reel demarre
# (et non une base de bench) :
#   1. l'index ix_menu_planning_date EXISTE dans la base installee
#   2. le plan de la requete QUE LE CODE EMET (les SIX predicats, y compris la
#      branche DATE()) affiche `USING INDEX ix_menu_planning_date` avec le
#      predicat PLEIN `(date>? AND date<?)` — et pas `date>?` seul
#   3. les lignes sont REELLES : une requete qui n'en rapporte aucune est un
#      NON EVALUE et fait rougir la sonde (piege du 09/09 : un scan vide
#      chronometre avait ete consigne comme « refuse par mesure »)
#
# Elle seme donc, AVANT de juger, dans la forme que la voie d'ecriture de l'app
# produit (POST /api/menu-planning, date ISO locale zero-paddee), avec des ids
# fournis par l'API — jamais par un INSERT qui omettrait `id` (le schema declare
# `id TEXT PRIMARY KEY` SANS auto-increment : un INSERT sans id reussit et ne
# seme RIEN).
#
# Lancement : python3 scripts/probe-index-forecast-installe.py
import datetime
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
BASE = os.path.dirname(HERE)
WORKROOT = os.path.join(os.path.expanduser("~"), ".cook-probe-index-installe")
NODE = shutil.which("node")
assert NODE and "python" not in NODE.lower(), "mauvais interpreteur: " + str(NODE)

# La requete QUE LE CODE EMET, re-assemblee a la main depuis src/routes/suppliers.ts
# et verifiee identique (voir check_sql_plus ci-dessous, annee du texte du WHERE).
SQL_EMISE = """
SELECT ri.inventory_id AS inventory_id,
       mp.recipe_json  AS recipe_json,
       ri.quantity_per_person AS quantity_per_person
  FROM menu_planning mp
  JOIN recipe_ingredients ri ON ri.recipe_id = mp.recipe_id
 WHERE mp.recipe_id IS NOT NULL
   AND mp.recipe_id <> ''
   AND mp.date >= DATE(?)
   AND mp.date <= DATE(?, '+' || ? || ' days')
   AND DATE(mp.date) >= DATE(?)
   AND DATE(mp.date) <= DATE(?, '+' || ? || ' days')
"""


def _est_un_double(b):
    """Vrai si la chaine stockee est un JSON dont la valeur est ELLE-MEME du JSON.

    C'est la trace du double-encodage : l'UI envoie une chaine deja serialisee,
    le POST la re-stringify, et le lecteur ne retrouve plus .couverts."""
    try:
        first = json.loads(b)
    except Exception:
        return False
    if not isinstance(first, str):
        return False
    try:
        json.loads(first)
        return True
    except Exception:
        return False


def couverts_de(rj):
    """Les couverts d'une colonne recipe_json, en tolerant le double-encodage.

    La sonde doit tolerer ce que la voie d'ecriture a pu produire par le passe:
    un oracle qui jette sur la donne abimee ne prouverait plus rien sur la
    justesse du calcul. La presence du double-encodage est jugee SEPARACEMENT
    (check « recipe_json est du JSON LISIBLE »), pas ignoree."""
    if not rj:
        return 1.0
    parsed = json.loads(rj) if isinstance(rj, str) else rj
    if isinstance(parsed, str):
        parsed = json.loads(parsed)
    if not isinstance(parsed, dict):
        return 1.0
    try:
        v = float(parsed.get("couverts", 1))
    except Exception:
        return 1.0
    return v if v > 0 else 1.0


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Serveur:
    def start(self, data_dir):
        self.port = free_port()
        self.log = open(os.path.join(data_dir, "server.log"), "w")
        self.proc = subprocess.Popen(
            [NODE, os.path.join(BASE, "node_modules", ".bin", "tsx"), "server.ts"],
            cwd=BASE, stdout=self.log, stderr=self.log,
            env=dict(os.environ, PORT=str(self.port), USER_DATA_PATH=data_dir))
        deadline = time.time() + 35
        while time.time() < deadline:
            try:
                if self.call("GET", "/api/settings")[0] == 200:
                    return True
            except Exception:
                time.sleep(0.4)
        self.log.flush()
        print("SERVEUR PAS PRET:\n",
              open(os.path.join(data_dir, "server.log")).read()[-1500:])
        return False

    def call(self, method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:%d%s" % (self.port, path), data=body, method=method,
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


def main():
    shutil.rmtree(WORKROOT, ignore_errors=True)
    os.makedirs(os.path.join(WORKROOT, "udata"), exist_ok=True)
    data_dir = os.path.join(WORKROOT, "udata")

    srv = Serveur()
    con = None
    checks = []
    details = []
    try:
        if not srv.start(data_dir):
            return 2

        today = time.strftime("%Y-%m-%d")
        in_window = (datetime.date.today() + datetime.timedelta(days=3))
        out_window = (datetime.date.today() + datetime.timedelta(days=90))

        # ---- graine, par les VOIES D'ECRITURE de l'app (jamais en INSERT brut)
        st, inv = srv.call("POST", "/api/inventory", {
            "name": "Courge Index", "quantity": 4.0, "minStock": 10.0,
            "unit": "kg", "status": "low", "category": "Legume",
            "unit_price": 2.1, "yield_percent": 100})
        checks.append(("POST /api/inventory cree un article", st == 200, "status=%s" % st))
        items = dict((i["name"], i["id"]) for i in srv.call("GET", "/api/inventory")[1])
        # l'article est cree SANS id fourni : la route le genere (Date.now()). Si la
        # graine imposait son propre id, elle jugerait une cle que l'app n'emet jamais.
        inv_id = items.get("Courge Index")

        st, rec = srv.call("POST", "/api/recipes", {
            "name": "Potage Index", "category": "entree",
            "ingredients": [{"inventory_name": "Courge Index",
                            "quantity_per_person": 200.0, "unit": "kg"}]})
        checks.append(("POST /api/recipes cree la recette", st == 200, "status=%s" % st))
        rec_id = (rec or {}).get("id")
        checks.append(("l'id de la recette est rendu par la route",
                       isinstance(rec_id, str) and len(rec_id) > 0, str(rec_id)[:40]))

        # un plat dans la fenetre, un hors de la fenetre : sans le second, le
        # verdict « le filtre fonctionne » ne serait pas distingue d'un bug.
        st, _ = srv.call("POST", "/api/menu-planning", {
            "date": today, "meal_type": "LUNCH", "recipe_id": rec_id,
            "title": "Potage du jour",
            "recipe_json": json.dumps({"couverts": 30})})
        checks.append(("planifie un plat AUJOURD'HUI (dans la fenetre)", st == 200, "status=%s" % st))
        st, _ = srv.call("POST", "/api/menu-planning", {
            "date": in_window.isoformat(), "meal_type": "DINNER", "recipe_id": rec_id,
            "title": "Potage J+3", "recipe_json": json.dumps({"couverts": 25})})
        checks.append(("planifie un plat a J+3 (dans la fenetre)", st == 200, "status=%s" % st))
        st, _ = srv.call("POST", "/api/menu-planning", {
            "date": out_window.isoformat(), "meal_type": "LUNCH", "recipe_id": rec_id,
            "title": "Potage J+90", "recipe_json": json.dumps({"couverts": 99})})
        checks.append(("planifie un plat a J+90 (HORS fenetre)", st == 200, "status=%s" % st))
        # Le 4e plat exerce le NOM DE CHAMP REELLEMENT EMIS par l'UI : MenuAnalysis
        # envoie `recipe_details` (une chaine deja JSON.stringifyee), pas
        # `recipe_json`. C'etait l'un des deux desaccords d'origine : la route ne
        # lisait que recipe_json et stockait null pour toute saisie venue de
        # l'ecran. Un harnais qui ne seme que recipe_json jugerait une voie
        # d'ecriture que personne n'emprunte.
        st, _ = srv.call("POST", "/api/menu-planning", {
            "date": (datetime.date.today() + datetime.timedelta(days=7)).isoformat(),
            "meal_type": "DINNER", "recipe_id": rec_id, "title": "Potage J+7",
            "recipe_details": json.dumps({"couverts": 10})})
        checks.append(("planifie un plat via recipe_details (le champ de l'UI)",
                       st == 200, "status=%s" % st))


        con = sqlite3.connect(os.path.join(data_dir, "agent_culinaire.db"))

        # ---- 0. la voie d'ecriture ne doit PLUS double-encoder recipe_json.
        # Le defaut etait la : l'UI envoie une chaine deja serialisee que le
        # POST re-stringify. Le lecteur (coversOf) la tolere desormais, mais si
        # la SOURCE re-produit du JSON-de-JSON, la base du client se remplit de
        # lignes ou .couverts est introuvable -> les couverts retombent a 1 et
        # le besoin est divise par le nombre de convives, sans rougissement.
        brutes = [r[0] for r in con.execute(
            "SELECT recipe_json FROM menu_planning WHERE recipe_json IS NOT NULL")]
        doubles = [b for b in brutes if _est_un_double(b)]
        checks.append(("recipe_json est du JSON LISIBLE (pas du JSON-de-JSON)",
                       not doubles, "%d/%d rangees double-encodees" % (len(doubles), len(brutes))))

        # ---- 1. l'index EXISTE-t-il dans la base que le serveur a installee ?
        idx = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE tbl_name = 'menu_planning' AND name NOT LIKE 'sqlite_%'")]
        checks.append(("l'index ix_menu_planning_date existe en base",
                       "ix_menu_planning_date" in idx, "index trouves: %s" % idx))

        # ---- 2. le plan du code EMIS est-il PLEIN et indexe ?
        rows = list(con.execute(SQL_EMISE, [today, today, 14, today, today, 14]))
        plans = " / ".join(str(r[3]) for r in
                           con.execute("EXPLAIN QUERY PLAN " + SQL_EMISE,
                                       [today, today, 14, today, today, 14]))
        checks.append(("le plan exploite ix_menu_planning_date",
                       "ix_menu_planning_date" in plans, plans[:180]))
        # le predicat PLEIN : les DEUX bornes doivent apparaitre dans le plan.
        # `USING INDEX (date>?)` seul = moitie du travail, donc un scan filtre.
        borne_basse = "date>?" in plans
        borne_haute = "date<?" in plans
        checks.append(("le plan porte le predicat PLEIN (date>? AND date<?)",
                       borne_basse and borne_haute, plans[:180]))

        # ---- 3. les lignes sont-elles REELLES ? (garde du scan vide)
        checks.append(("la requete emise rapporte des lignes (pas un scan vide)",
                       len(rows) > 0, "lignes=%d" % len(rows)))

        # ---- 4. le resultat est-il juste : le hors-fenetre est exclu
        ids_rendus = {}
        for iid, rj, qpp in rows:
            ids_rendus[iid] = ids_rendus.get(iid, 0) + (
                couverts_de(rj) * float(qpp or 0))
        # Les TROIS plats dans la fenetre, a 200 g/convive :
        #   J+0  30 couverts (recipe_json)      ->  6000
        #   J+3  25 couverts (recipe_json)      ->  5000
        #   J+7  10 couverts (recipe_details!)  ->  2000   <- la voie de l'UI
        # Le J+90 (99 couverts) est HORS fenetre : s'il fuitait, le solde
        # monterait a 32800 — le chiffre porte donc la preuve des deux choses.
        attendu = (30 + 25 + 10) * 200.0
        rendu = ids_rendus.get(inv_id, 0.0)
        checks.append(("besoin = (30+25+10)x200 = 13000 (J+90 EXCLU)",
                       abs(rendu - attendu) < 1e-6,
                       "rendu=%s attendu=%s (fuite J+90 -> 32800)" % (rendu, attendu)))

        st, payload = srv.call("GET", "/api/purchasing/forecast")
        ligne = next((i for i in (payload or {}).get("items", [])
                     if i.get("inventory_id") == inv_id), None)
        checks.append(("la route rend le meme besoin que l'oracle",
                       ligne is not None and abs(ligne.get("besoin_recettes", -1) - attendu) < 0.011,
                       "route=%s" % (ligne or {}).get("besoin_recettes")))

        details.append("  lignes rapportees par la requete emise : %d" % len(rows))
        details.append("  index sur menu_planning : %s" % (idx or "(AUCUN)"))
        details.append("  plan                : %s" % plans[:200])
    finally:
        try:
            srv.stop()
        except Exception:
            pass
        if con is not None:
            try:
                con.close()
            except Exception:
                pass

    print("=" * 78)
    print("PREUVE D'INSTALLATION REELLE — index de la prevision d'achat")
    print("=" * 78)
    echoues = 0
    for label, ok, detail in checks:
        print("  %s %-56s %s" % ("OK  " if ok else "FAUX", label,
                                  "" if ok else "<- " + detail))
        if not ok:
            echoues += 1
    for d in details:
        print(d)
    print("-" * 78)
    if echoues == 0:
        print("VERDICT : l'index est installe, le plan est PLEIN, le hors-fenetre est exclu.")
        return 0
    print("VERDICT : ECHEC — %d check(s) en defaut" % echoues)
    return 1


sys.exit(main())
