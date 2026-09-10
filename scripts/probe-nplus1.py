# ⚠⚠ NE PAS SE FIER AU VERDICT DE CE FICHIER -- consrvé comme preuve, pas comme
# reference. Les DEUX bras ne mesuraient pas la meme chose : le N+1 filtrait
# `day = <nom de jour>` (0 ligne dans le seed du harnais, donc 40 scans VIDES)
# pendant que la jointure filtrait `date BETWEEN` sur 4 000 rangees POPULEES.
# D'ou le « gain -12,3 % » rendu, qui est un artefact de seed et non un resultat.
# La decision qui fait foi est dans scripts/probe-join-stats.py (4 bras, meme
# predicat des deux cotes, index pose): la jointure ne gagne que 0,11 ms/tour une
# fois l'index en place -> la forme N+1 est GARDEE. Voir PHASES.md 4.11.
#
# Contre-mesure du N+1 de /api/dashboard/stats, avec le jour REELLEMENT seme.
#
# La premiere passe mesurait 0 lignes staff_schedule pour le jour du jour: le
# cout par declaration etait donc un scan VIDE (sous-estime, ou mal represente).
# Ici on releve les jours reellement presents, on mesure sur un jour PEUPLE, et
# on compare les DEUX bras (N+1 actuel vs une seule jointure) en ABBA echauffe,
# conformement a la consigne du skill.
import os
import sys
import time
import sqlite3
import statistics

REPO = os.path.expanduser("~/cookdrive-project")
HARNAIS = os.path.join(REPO, "scripts", "ab-indices.py")

with open(HARNAIS, encoding="utf-8") as fh:
    SRC = fh.read()
GUARDE = "sys.exit(main("
if GUARDE in SRC:
    SRC = SRC[: SRC.rindex(GUARDE)]
ns = {"__name__": "ab_h", "__file__": HARNAIS, "__builtins__": __builtins__}
exec(compile(SRC, HARNAIS, "exec"), ns)

DATA = os.path.expanduser("~/.cookdrive-probe-stats")
DB = os.path.join(DATA, "agent_culinaire.db")
if not os.path.exists(DB):
    os.makedirs(DATA, exist_ok=True)
    ch = ns["run_server"](DATA)
    try:
        ns["seed"](DATA)
    finally:
        ch.terminate()
        try:
            ch.wait(timeout=15)
        except Exception:
            ch.kill()

con = sqlite3.connect(DB)
cur = con.cursor()

days = [r[0] for r in cur.execute(
    "select day, count(*) from staff_schedule group by day order by 2 desc").fetchall()]
print("jours semés:", days[:9])
by_day = cur.execute(
    "select day, count(*) from staff_schedule group by day order by 2 desc limit 1").fetchone()
print("jour le plus peuple:", by_day)
DAY = by_day[0] if by_day else "thursday"
active = [r[0] for r in cur.execute("select id from staff where active = 1").fetchall()]
N_MEMB = len(active)
rows_day = cur.execute("select count(*) from staff_schedule where day = ?", (DAY,)).fetchone()[0]
print(f"jour mesure = {DAY} | lignes ce jour = {rows_day} | membres actifs = {N_MEMB}")

WARM, N = 30, 400

# --- le bras ACTUEL: la boucle N+1, une declaration PAR membre --------------
def arm_nplus1():
    tot = 0.0
    for mid in active:
        t0 = time.perf_counter()
        cur.execute("SELECT start_time, end_time FROM staff_schedule "
                    "WHERE staff_id = ? AND day = ?", (mid, DAY)).fetchall()
        tot += time.perf_counter() - t0
    return tot * 1000

# --- le bras PROPOSE: UNE seule declaration pour tout le tour --------------
JOIN_SQL = ("SELECT s.id, s.hourly_rate, sc.start_time, sc.end_time "
            "FROM staff s LEFT JOIN staff_schedule sc "
            "  ON sc.staff_id = s.id AND sc.day = ? "
            "WHERE s.active = 1")

def arm_join():
    t0 = time.perf_counter()
    rows = cur.execute(JOIN_SQL, (DAY,)).fetchall()
    return (time.perf_counter() - t0) * 1000, len(rows)

# echauffement des DEUX bras (cache de pages + statements prepares froids)
for _ in range(WARM):
    arm_nplus1()
    arm_join()
con.commit()

# --- ABBA: l'ordre ne doit pas decider du verdict -------------------------
a, b = [], []
order = [("A", arm_nplus1), ("B", arm_join), ("A", arm_nplus1), ("B", arm_join)]
for passage in range(400):
    for tag, fn in order:
        v = fn()
        v = v[0] if isinstance(v, tuple) else v
        (a if tag == "A" else b).append(v)

def stat(s):
    return statistics.median(s), sorted(s)[int(len(s) * 0.95)]

a50, a95 = stat(a)
b50, b95 = stat(b)
gain = (a50 - b50) * 100 / a50 if a50 else 0.0
print(f"\nN+1 actuel   (1 declaration x {N_MEMB} membres)  p50={a50:7.3f}ms  p95={a95:7.3f}ms")
print(f"UNE jointure (1 seule declaration)             p50={b50:7.3f}ms  p95={b95:7.3f}ms")
print(f"gain                                         {gain:6.1f} %")

# identique: la jointure doit reproduire le meme total d'heures que la boucle
def total_heures(n_mode):
    tot = 0.0
    if n_mode == "n":
        for mid in active:
            rate = cur.execute("select hourly_rate from staff where id = ?", (mid,)).fetchone()[0]
            for st, en in cur.execute("select start_time, end_time from staff_schedule "
                                      "where staff_id = ? and day = ?", (mid, DAY)).fetchall():
                if not st or not en:
                    continue
                h1, m1 = (int(x) for x in st.split(":")[:2])
                h2, m2 = (int(x) for x in en.split(":")[:2])
                d = h2 * 60 + m2 - (h1 * 60 + m1)
                if d < 0:
                    d += 1440
                tot += d / 60 * (rate or 15)
    else:
        for r in cur.execute(JOIN_SQL, (DAY,)).fetchall():
            st, en = r[2], r[3]
            if not st or not en:
                continue
            h1, m1 = (int(x) for x in st.split(":")[:2])
            h2, m2 = (int(x) for x in en.split(":")[:2])
            d = h2 * 60 + m2 - (h1 * 60 + m1)
            if d < 0:
                d += 1440
            tot += d / 60 * (r[1] or 15)
    return tot

n_v, j_v = total_heures("n"), total_heures("j")
print(f"\nEQUIVALENCE: boucle={n_v:.4f}  jointure={j_v:.4f}  identique={abs(n_v - j_v) < 1e-9}")
print(f"declarations: {1 + N_MEMB} -> 1")
con.close()
