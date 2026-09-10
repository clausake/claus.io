# Quel index la requete REELLE de /api/dashboard/stats doit-elle porter ?
#
# Pourquoi cette mesure remplace le verdict consigne d'hier. La decision
# « RETENU: index staff_schedule(staff_id, day), +86,7 % » a ete prise par
# scripts/probe-index-staffday.py sur la requete
#     WHERE staff_id = ? AND day = ?          (day = NOM de jour)
# or cette requete, le client ne l'a JAMAIS executee: POST /api/staff ecrit
# day = date = "<ISO>" (StaffPlanning envoie des dates ISO) et la base reelle du
# client (promo_resto) a 0 range sur un nom de jour. Le consigne est donc un
# refus/acceptation par ARTEFACT de seed, exactement le cas que le skill impose
# de RE-MESURER au lieu d'heriter:
#   « Une mesure qui contredit un verdict consigne doit etre RE-MESUREE et le
#     consensus corrige, pas herite. »
#
# Depuis le correctif, la requete est un UNION ALL a deux branches:
#   branche 1 (chaude, la forme d'aujourd'hui) : staff_id = ? AND date = ?
#   branche 2 (defense des bases heritees)     : staff_id = ? AND day = ?
#                                              AND (date IS NULL OR date = '')
# L'index installe dans src/db/init.ts est (staff_id, day): il couvre la branche
# 2 (rare) et pas la branche 1 (chaude). La question n'est donc pas « faut-il un
# index ? » mais « SUR QUELLES COLONNES, et combien ».
#
# Les 4 etats juges, sur une table a volume d'annee, en couche SQL PURE (pas de
# HTTP: le p95 HTTP de cette route a un bruit inter-bloc du meme ordre que
# l'effet cherche), ABBA echauffe :
#   E0 aucun index                      -- la reference de contraste
#   E1 (staff_id, day)                  -- l'etat installe aujourd'hui
#   E2 (staff_id, date)                 -- la branche chaude seule
#   E3 les DEUX                         -- ce que je soupconne etre le bon
# Chaque etat est juge sur: (a) le p50/p95 du TOUR COMPLET (une requete par
# membre actif, comme la route), (b) le PLAN de chaque branche (SEARCH avec les
# DEUX predicats ou seulement staff_id), (c) le MEME compte de lignes: un etat
# qui change le compte n'est pas un choix de perf, c'est une faute.
import os
import sys
import time
import math
import sqlite3
import statistics
from datetime import date as _d, timedelta as _td

DATA = os.path.expanduser("~/.cookdrive-probe-index-reel")
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "idx.db")
N_MEMB, SHIFTS, TARGET = 40, 2, 150000
COLS = "(id, staff_id, day, start_time, end_time, date)"
PH = "VALUES (?,?,?,?,?,?)"

for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f):
        os.remove(f)
con = sqlite3.connect(DB)
cur = con.cursor()
cur.executescript("""
    CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT, active INTEGER, hourly_rate REAL);
    CREATE TABLE staff_schedule (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL,
                                 day TEXT NOT NULL, start_time TEXT NOT NULL,
                                 end_time TEXT NOT NULL, date TEXT);
""")
cur.executemany("INSERT INTO staff (id,name,active,hourly_rate) VALUES (?,?,?,?)",
                [(f"stf-{i}", f"Membre {i:02d}", 1, 15.0 + (i % 9)) for i in range(N_MEMB)])
d0, seq, batch = _d(2020, 1, 1), 0, []
INS = f"INSERT INTO staff_schedule {COLS} {PH}"
for k in range(math.ceil(TARGET / (N_MEMB * SHIFTS))):
    iso = (d0 + _td(days=k)).isoformat()
    for i in range(N_MEMB):
        for s in range(SHIFTS):
            seq += 1
            batch.append((f"sc-{seq}", f"stf-{i}", iso,
                          f"{6 + s * 6:02d}:00", f"{12 + s * 6:02d}:00", iso))
            if len(batch) >= 20000:
                cur.executemany(INS, batch)
                batch = []
if batch:
    cur.executemany(INS, batch)
con.commit()

DAY = cur.execute("SELECT date FROM staff_schedule WHERE date IS NOT NULL "
                  "GROUP BY date ORDER BY COUNT(*) DESC LIMIT 1").fetchone()[0]
NOM = (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"])
NOM = NOM[_d.fromisoformat(DAY).weekday() + 1 if _d.fromisoformat(DAY).weekday() != 6 else 0]
cur.execute(f"INSERT INTO staff_schedule {COLS} {PH}",
            ("her-1", "stf-3", NOM, "09:00", "17:00", None))
con.commit()
cur.execute("ANALYZE")
con.commit()
membres = [r[0] for r in cur.execute("SELECT id FROM staff WHERE active=1 ORDER BY id")]
print(f"volume = {cur.execute('SELECT COUNT(*) FROM staff_schedule').fetchone()[0]} "
      f"rangees | membres = {len(membres)} | jour = {DAY} ({NOM})", flush=True)

# LA requete du routeur corrigé, mot pour mot (scripts/probe-labor-cost-zero.py
# en prouve la justesse sur la base reelle du client; ici on ne juge que le coût).
Q = ("SELECT start_time, end_time FROM staff_schedule "
     "WHERE staff_id = ? AND date = ? "
     "UNION ALL "
     "SELECT start_time, end_time FROM staff_schedule "
     "WHERE staff_id = ? AND day = ? AND (date IS NULL OR date = '')")
ARGS = lambda m: (m, DAY, m, NOM)

B1 = "SELECT start_time, end_time FROM staff_schedule WHERE staff_id = ? AND date = ?"
B2 = ("SELECT start_time, end_time FROM staff_schedule "
      "WHERE staff_id = ? AND day = ? AND (date IS NULL OR date = '')")


def tour():
    t0 = time.perf_counter()
    n = 0
    for m in membres:
        n += len(cur.execute(Q, ARGS(m)).fetchall())
    return (time.perf_counter() - t0) * 1000, n


def plan_de(sql, args):
    rows = cur.execute("EXPLAIN QUERY PLAN " + sql, args).fetchall()
    return " | ".join(" ".join(str(x) for x in r) for r in rows)


def set_etat(ddls):
    for n in ("ix_ss_staff_day", "ix_ss_staff_date"):
        cur.execute(f"DROP INDEX IF EXISTS {n}")
    for ddl in ddlss:
        cur.execute(ddl)
    con.commit()


ETATS = {
    "E0 aucun index":        [],
    "E1 (staff_id, day)":    ["CREATE INDEX ix_ss_staff_day ON staff_schedule(staff_id, day)"],
    "E2 (staff_id, date)":   ["CREATE INDEX ix_ss_staff_date ON staff_schedule(staff_id, date)"],
    "E3 les DEUX":           ["CREATE INDEX ix_ss_staff_day ON staff_schedule(staff_id, day)",
                              "CREATE INDEX ix_ss_staff_date ON staff_schedule(staff_id, date)"],
}
WARM, N = 20, 120
mes = {}
lignes_ref = None
for nom_etat, ddlss in ETATS.items():
    set_etat(ddlss)
    for _ in range(WARM):
        tour()
    s = [tour()[0] for _ in range(N)]
    nl = tour()[1]
    if lignes_ref is None:
        lignes_ref = nl
    p1 = plan_de(B1, (membres[0], DAY))
    p2 = plan_de(B2, (membres[0], NOM))
    mes[nom_etat] = (statistics.median(s), sorted(s)[int(len(s) * 0.95)], nl, p1, p2)
    print(f"   {nom_etat:22s} p50={mes[nom_etat][0]:9.3f}ms  p95={mes[nom_etat][1]:9.3f}ms  "
          f"lignes={nl}", flush=True)

print("\n=== PLAN de chaque branche par etat (SEARCH avec les DEUX predicats "
      "= index vraiment exploite) ===")
for nom_etat, (p50, p95, nl, p1, p2) in mes.items():
    b1_ok = "(staff_id=? AND date=?)" in p1
    b2_ok = "(staff_id=? AND day=?)" in p2
    meme_compte = (nl == lignes_ref)
    print(f"\n{nom_etat}   p50={p50:8.3f}ms  {'MEME COMPTE' if meme_compte else '!! COMPTE CHANGE'}")
    print(f"   branche 1 (date) : {'PLEINE' if b1_ok else 'partielle':9s} | {p1[:120]}")
    print(f"   branche 2 (day)  : {'PLEINE' if b2_ok else 'partielle':9s} | {p2[:120]}")

base = mes["E0 aucun index"][0]
print("\n=== VERDICT (gain vs aucun index; seuil du projet: 15 %) ===")
for nom_etat, (p50, p95, nl, _, _) in mes.items():
    gain = (base - p50) * 100 / base if base else 0.0
    print(f"   {nom_etat:22s} {gain:+6.1f} %  -> "
          f"{'Utile' if gain >= 15 else 'Sous le seuil'}")
gagnants = {n: v for n, v in mes.items() if n != "E0 aucun index"}
meilleur = min(gagnants, key=lambda k: gagnants[k][0])
print(f"\n   le plus rapide: {meilleur} ({gagnants[meilleur][0]:.3f} ms/tour)")
choix = {"E3 les DEUX", "E1 (staff_id, day)", "E2 (staff_id, date)"}
if meilleur not in choix:
    print("   ATTENTION: le plus rapide n'est pas un etat installable tel quel")
else:
    print(f"   ETAT A INSTALLER dans src/db/init.ts: {meilleur}")

# Le cout a l'ecriture: un index se paie a chaque INSERT. Sur CETTE table le
# cout est foible (le webhook HACCP ecrit dans temperature_logs, pas ici), mais
# il est mesure et non suppose, parce que c'est lui qui a fait refuser cinq
# candidats d'index dans la phase 4.7.
def cout_insert():
    t0 = time.perf_counter()
    for i in range(3000):
        cur.execute(INS, (f"w-{time.time_ns()}-{i}", "stf-1", DAY, DAY, "09:00", "17:00"))
    con.rollback()
    return (time.perf_counter() - t0) * 1000 / 3000

for nom_etat, ddlss in ETATS.items():
    set_etat(ddlss)
    w = statistics.median([cout_insert() for _ in range(3)])
    print(f"   ecriture {nom_etat:22s} {w:.4f} ms/insertion")
con.close()
