# Mesure ou part le temps de /api/dashboard/stats, en couche SQL PURE (hors HTTP),
# en rejouant la SEQUENCE EXACTE du routeur, ecritures du GET comprises.
#
# Pourquoi la couche SQL pure : le p95 HTTP de cette route a un bruit inter-bloc du
# meme ordre que l'effet cherche (consigne du skill, deja verifiee sur les index).
# Ici le bruit tombe a la resolution de l'horloge.
#
# Ce que le harnais compte et non suppose :
#   - le NOMBRE reel de declarations par tour : la boucle par membre est un N+1
#     (une declaration PAR membre actif), donc le compte depend du volume ;
#   - la part des DEUX ecritures (DELETE + INSERT OR IGNORE) portees par un GET ;
#   - le tout sur un volume de resto seme, compteurs relus en base.
#
# Chargement du harnais frere par exec dans un namespace isole (pas de
# importlib : la version importee des symboles est une source de faute v6).
import os
import sys
import time
import sqlite3
import statistics

REPO = os.path.expanduser("~/cookdrive-project")
HARNAIS = os.path.join(REPO, "scripts", "ab-indices.py")

# ⚠ Le harnais frere porte `sys.exit(main(sys.argv[1:]))` AU NIVEAU MODULE
# (derniere ligne) : un import tout court rejoue donc les 3 passages A/B d'index
# et sort du cadre de cette mesure. On retire cette ligne de la source AVANT de
# compiler, et on VERIFIE que les deux fonctions utiles sont bien arrivees --
# sinon on rougit au lieu de tourner sur un harnais ampute.
with open(HARNAIS, encoding="utf-8") as fh:
    SRC = fh.read()
GUARDE = "sys.exit(main("
if GUARDE in SRC:
    SRC = SRC[: SRC.rindex(GUARDE)]
ns = {"__name__": "ab_indices_probe", "__file__": HARNAIS, "__builtins__": __builtins__}
exec(compile(SRC, HARNAIS, "exec"), ns)
for _need in ("run_server", "seed"):
    if _need not in ns:
        raise sys.exit(f"harnais ampute: {_need} introuvable apres retrait de la garde")
run_server = ns["run_server"]
seed = ns["seed"]

DATA = os.path.expanduser("~/.cookdrive-probe-stats")
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "agent_culinaire.db")
for stale in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(stale):
        os.remove(stale)

print("### 1. schema par le serveur REEL, puis seed ###", flush=True)
child = run_server(DATA)
try:
    seed(DATA)
finally:
    child.terminate()
    try:
        child.wait(timeout=15)
    except Exception:
        child.kill()

con = sqlite3.connect(DB)
cur = con.cursor()
print("   compteurs en base :", flush=True)
for t in ("inventory", "staff", "staff_schedule", "alerts"):
    try:
        print(f"      {t:16s} = {cur.execute('select count(*) from ' + t).fetchone()[0]}", flush=True)
    except Exception as e:
        print(f"      {t:16s} = ERR {e}", flush=True)

# Le jour au sens du ROUTEUR (JS: 0=sunday), pas au sens de Python (0=monday).
DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
today = DAYS[(time.localtime().tm_wday + 1) % 7]
active = cur.execute("select id, hourly_rate from staff where active = 1").fetchall()
print(f"   membres actifs = {len(active)} | jour = {today}", flush=True)
if not active:
    print("   ABORT: aucun membre actif seme -> la boucle N+1 ne serait pas mesuree")
    raise sys.exit(2)
sched_rows = cur.execute(
    "select count(*) from staff_schedule where day = ?", (today,)).fetchone()[0]
print(f"   lignes staff_schedule pour {today} = {sched_rows}", flush=True)

WARM, N = 25, 400


def bench(label, sql, args=()):
    for _ in range(WARM):
        cur.execute(sql, args).fetchall()
    con.commit()
    s = []
    for _ in range(N):
        t0 = time.perf_counter()
        cur.execute(sql, args).fetchall()
        s.append((time.perf_counter() - t0) * 1000)
    con.commit()
    p50, p95 = statistics.median(s), sorted(s)[int(len(s) * 0.95)]
    print(f"   {label:52s} p50={p50:7.3f}ms  p95={p95:7.3f}ms", flush=True)
    return p50, p95


print("\n### 2. les declarations de LECTURE (une seule fois chacune) ###", flush=True)
R = {}
R["lowstock"] = bench("lowstock  SELECT inventory WHERE quantity<=minStock",
                      "SELECT id, name, quantity, minStock, unit FROM inventory "
                      "WHERE quantity <= minStock")
R["cost"] = bench("cost      SELECT SUM(quantity*unit_price) FROM inventory",
                  "SELECT SUM(quantity * unit_price) as total FROM inventory")
R["alerts_count"] = bench("alerts    SELECT COUNT(*) FROM alerts WHERE status=active",
                          'SELECT COUNT(*) as count FROM alerts WHERE status = "active"')
R["critical"] = bench("critical  SELECT COUNT(*) inventory WHERE status=critical",
                      'SELECT COUNT(*) as count FROM inventory WHERE status = "critical"')
R["staff"] = bench("staff     SELECT * FROM staff WHERE active = 1",
                   "SELECT * FROM staff WHERE active = 1")
R["schedule"] = bench(f"schedule  SELECT schedule WHERE staff_id AND day  (x{len(active)})",
                      "SELECT start_time, end_time FROM staff_schedule WHERE staff_id = ? AND day = ?",
                      (active[0][0], today))

print("\n### 3. les DEUX ECRITURES portees par un GET ###", flush=True)
low = [r[0] for r in cur.execute("select id from inventory where quantity <= minStock").fetchall()]
low_ids = ",".join("'stock_" + i + "'" for i in low) if low else "'none'"
D = bench("DELETE FROM alerts WHERE id LIKE stock_% AND NOT IN(...)",
          f"DELETE FROM alerts WHERE id LIKE 'stock_%' AND id NOT IN ({low_ids})")

INS = "INSERT OR IGNORE INTO alerts (id, type, message, severity, status) VALUES (?, ?, ?, ?, ?)"
for _ in range(WARM):
    cur.execute(INS, ("stock_probe", "stock", "m", "medium", "active"))
con.commit()
s = []
for _ in range(N):
    t0 = time.perf_counter()
    cur.execute(INS, ("stock_probe", "stock", "m", "medium", "active"))
    s.append((time.perf_counter() - t0) * 1000)
con.commit()
I = (statistics.median(s), sorted(s)[int(len(s) * 0.95)])
print(f"   {'INSERT OR IGNORE x1 (la route en emet un PAR item bas)':52s} p50={I[0]:7.3f}ms  p95={I[1]:7.3f}ms", flush=True)

print("\n### 4. DECOMPOSITION d'un tour de /api/dashboard/stats ###", flush=True)
m = len(active)
nb_low = max(len(low), 1)
reads_only = R["lowstock"][0] + R["cost"][0] + R["alerts_count"][0] + R["critical"][0] + R["staff"][0]
n_plus_1 = R["schedule"][0] * m
delete_cost = D[0]
insert_cost = I[0] * nb_low
writes = delete_cost + insert_cost
total = reads_only + n_plus_1 + writes
stmts = 5 + m + 1 + nb_low
print(f"   5 lectures distinctes                  : {reads_only:8.3f} ms")
print(f"   boucle N+1  ({m} membres x 1 declaration)  : {n_plus_1:8.3f} ms")
print(f"   1 DELETE des alerts                    : {delete_cost:8.3f} ms")
print(f"   {nb_low} INSERT OR IGNORE (1 par article bas) : {insert_cost:8.3f} ms")
print(f"   TOTAL SQL estime pour UN tour          : {total:8.3f} ms   ({stmts} declarations)")
if total > 0:
    print(f"   part des ecritures du GET              : {writes * 100 / total:5.1f} %")
    print(f"   part de la boucle N+1                  : {n_plus_1 * 100 / total:5.1f} %")
con.close()
