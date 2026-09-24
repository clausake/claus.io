# Sonde: le PUT /api/inventory/:id ecrit-il reellement yield_percent ?
# La sonde e2e a rendu 2400 (rendement 100) la ou 3000 etait attendu (rendement 80).
import json, os, shutil, signal, sqlite3, subprocess, sys, threading, time
import urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _sondes_serveur as ss

NODE = shutil.which("node")
assert NODE and "python" not in NODE.lower(), "mauvais interpreteur: " + str(NODE)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3996
DATA = os.path.join(BASE_DIR, "test", "tmp-probe-yield")
BASE = "http://127.0.0.1:%d" % PORT


def call(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


shutil.rmtree(DATA, ignore_errors=True)
ss.bootstrap(PORT)
os.makedirs(DATA, exist_ok=True)
tsxb = os.path.join(BASE_DIR, "node_modules", ".bin", "tsx")
log = open(os.path.join(DATA, "server.log"), "w")
proc = ss.Popen_sonde([NODE, tsxb, "server.ts"], cwd=BASE_DIR,
                      env=dict(os.environ, PORT=str(PORT), USER_DATA_PATH=DATA),
                      stdout=log, stderr=log)

deadline = time.time() + 30
while time.time() < deadline:
    try:
        if call("GET", "/api/settings")[0] == 200:
            break
    except Exception:
        time.sleep(0.4)
else:
    print("SERVEUR PAS PRET -- log:")
    log.flush()
    print(open(os.path.join(DATA, "server.log"), encoding="utf-8", errors="replace").read()[-2500:])
    ss.tuer_groupe(proc)
    log.close()
    sys.exit(2)

rc = 1
try:
    seed = {"id": "pv-1", "name": "Carotte Probe", "quantity": 10, "minStock": 5,
            "unit": "kg", "status": "ok", "category": "Legume",
            "unit_price": 1.5, "yield_percent": 100}
    print("POST create:", call("POST", "/api/inventory", seed)[0])
    st, rows = call("GET", "/api/inventory")
    before = [r for r in rows if r["id"] == "pv-1"][0]
    print("  lu apres POST   -> yield_percent =", before.get("yield_percent"))

    upd = dict(seed)
    upd["yield_percent"] = 80
    st, body = call("PUT", "/api/inventory/pv-1", upd)
    print("PUT yield=80:", st, body)
    st, rows = call("GET", "/api/inventory")
    after = [r for r in rows if r["id"] == "pv-1"][0]
    print("  lu apres PUT    -> yield_percent =", after.get("yield_percent"))

    con = sqlite3.connect(os.path.join(DATA, "agent_culinaire.db"))
    db_val = con.execute("SELECT yield_percent FROM inventory WHERE id='pv-1'").fetchone()
    print("  brut en base    -> yield_percent =", db_val[0] if db_val else None)
    con.close()

    # POST /api/inventory accepte-t-il un id fourni (le cas de la graine e2e) ?
    st2, b2 = call("POST", "/api/inventory", dict(seed, id="pv-2"))
    st3, rows3 = call("GET", "/api/inventory")
    ids = {r["id"] for r in rows3}
    print("POST avec id fourni ->", st2, "id rendu:", b2.get("id"), "| present en base:", b2.get("id") in ids)

    ok = after.get("yield_percent") == 80 and db_val and db_val[0] == 80
    print("\nVERDICT PUT yield_percent:", "OK" if ok else "FAIL (le PUT n'ecrit pas le rendement)")
    rc = 0 if ok else 1
finally:
    ss.tuer_groupe(proc)
    log.close()
    shutil.rmtree(DATA, ignore_errors=True)
sys.exit(rc)
