# ⚠⚠ NE PAS SE FIER AU VERDICT DE CE FICHIER -- consrvé comme preuve, pas comme
# reference. Il juge `WHERE staff_id = ? AND day = ?` avec day = NOM DE JOUR, la
# ou l'app ecrit `day = date = "<ISO>"` (POST /api/staff; verifie dans la base
# reelle du client: 0 rangee sur un nom de jour). Il a donc installe un index sur
# la colonne de la branche RARE en laissant la branche CHAUDE sans index, et son
# « A2 RETENU +86,7 % » n'est pas la requete que le produit emet.
# La mesure qui fait foi est scripts/probe-index-reel.py (requete du UNION ALL,
# les DEUX index, p50 0,159 ms/tour). Voir PHASES.md 4.11.
#
# A/B de l'index manquant de /api/dashboard/stats, sur un volume QUI RESSEMBLE
# a ce que l'APP ecrit (et non a ce que le harnais d'index seme).
#
# Decouverte qui rend les mesures precedentes inutilisables :
#   - le schema declare staff_schedule(staff_id, day, start_time, end_time) PUIS,
#     par ensureColumn, une colonne 'date' AJOUTEE par le code applicatif.
#   - la route /api/dashboard/stats filtre  WHERE staff_id = ? AND day = ?
#     avec 'day' = NOM DE JOUR ("thursday"), tandis que le seed du harnais
#     d'index ne remplit que 'date' (dates ISO). Les passes precedentes
#     tournaient donc sur ZERO ligne correspondante : le cout mesure etait un
#     scan de table vide, ni plus ni moins representative.
#   - AUCUN index n'existe sur staff_schedule (verifie dans src/db/init.ts).
#     La requete de la route fait donc 40 SCANS complets de 4 000 lignes par tour.
#
# Bras mesures, echauffes, en ABBA (l'ordre ne doit pas decider du verdict) :
#   A0 sans index | A1 index (staff_id) seul | A2 index (staff_id, day).
import os
import sys
import time
import sqlite3
import statistics

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.expanduser("~/.cookdrive-probe-idx")
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "probe.db")
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f):
        os.remove(f)

con = sqlite3.connect(DB)
cur = con.cursor()
cur.executescript("""
    CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT, active INTEGER, hourly_rate REAL);
    CREATE TABLE staff_schedule (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, day TEXT NOT NULL,
                                 start_time TEXT NOT NULL, end_time TEXT NOT NULL, date TEXT);
""")

# Volume de resto reel : 40 membres actifs, 7 jours, 2 vacations chacun.
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
cur.executemany("insert into staff values (?,?,?,?)",
                [(f"stf-{i}", f"Membre {i:02d}", 1, 15.0 + (i % 9)) for i in range(40)])
rows = []
k = 0
for i in range(40):
    for d in DAYS:
        for shift in range(2):
            k += 1
            start = "0%d:00" % (6 + shift * 6)
            end = "%d:00" % (12 + shift * 6)
            rows.append((f"sc-{k}", f"stf-{i}", d, start, end, f"2026-12-{(k % 28) + 1:02d}"))
cur.executemany("insert into staff_schedule values (?,?,?,?,?,?)", rows)
con.commit()

# Volume de la TABLE: c'est lui qui decide si un scan est couteux, donc si un
# index peut changer quelque chose. 40 membres x 7 jours x 2 vacations ne font
# que 560 lignes: un scan de 560 lignes ne se distingue pas d'un index, et un A/B
# sur un tel volume est un test de puissance de l'horloge et non du traitement
# (consigne du skill: un bench sur un volume trop petit produit un verdict
# parfaitement faux et parfaitement lisible). On porte donc la table a un volume
# de planning d'annee pour une brigade, EN GARDANT la forme de la route: 2
# vacations par membre et par jour, pour que le filtre (staff_id, day) reste
# representatif.
N_MEMB = cur.execute("select count(*) from staff where active=1").fetchone()[0]
TARGET = 150000
have = cur.execute("select count(*) from staff_schedule").fetchone()[0]
if have < TARGET:
    batch = []
    seq = have
    while cur.execute("select count(*) from staff_schedule").fetchone()[0] < TARGET:
        batch = []
        for _chunk in range(1000):
            for i in range(N_MEMB):
                seq += 1
                d = DAYS[seq % 7]
                batch.append((f"sx-{seq}", f"stf-{i}", d, "06:00", "14:00", "2026-12-01"))
                if len(batch) >= 5000:
                    break
            if len(batch) >= 5000:
                break
        cur.executemany("insert into staff_schedule values (?,?,?,?,?,?)", batch)
        con.commit()
N_ROWS = cur.execute("select count(*) from staff_schedule").fetchone()[0]
PER = cur.execute("select count(*) from staff_schedule where staff_id='stf-7' and day='thursday'").fetchone()[0]
print(f"volume de la TABLE : {N_ROWS} lignes de planning | {N_MEMB} membres actifs | "
      f"{PER} lignes pour (stf-7, thursday)")
assert N_ROWS >= TARGET, "le volume de table n'atteint pas le seuil de mesure"
assert PER >= 1, "le filtre de la route ne ramene rien: la mesure serait vaine"
# le filtre de la route doit porter sur quelque chose: sans quoi le bras serait vaine
hit = cur.execute("select count(*) from staff_schedule where staff_id=? and day=?",
                  ("stf-7", "thursday")).fetchone()[0]
print(f"controle du filtre de la route : {hit} ligne(s) pour (stf-7, thursday)")
if hit == 0:
    raise sys.exit("le seed ne correspond pas au filtre de la route -> mesure vaine")

IDX = {
    "A0 sans index": [],
    "A1 (staff_id) seul": ["CREATE INDEX ix_ss_staff ON staff_schedule(staff_id)"],
    "A2 (staff_id, day)": ["CREATE INDEX ix_ss_staff_day ON staff_schedule(staff_id, day)"],
}


def drop_all():
    for n in ("ix_ss_staff", "ix_ss_staff_day"):
        cur.execute(f"drop index if exists {n}")
    con.commit()


def plan_of():
    # "explain query plan" rend des LIGNES de colonnes (addr, opcode, p1..p5,
    # commentaire). fetchone()[0] est donc un ENTIER (l'addr) et non le texte du
    # plan: s'en servir pour decider du SCAN/SEARCH produirait un faux verdict.
    # On reassembles TOUTES les colonnes en texte et on ne decide que sur ce texte.
    rows = cur.execute("explain query plan select start_time, end_time from staff_schedule "
                       "where staff_id=? and day=?", ("stf-7", "thursday")).fetchall()
    return " | ".join(" ".join(str(c) for c in row) for row in rows)


def one_tour():
    """Un tour de la route : une requete PAR membre actif (le N+1 actuel)."""
    t0 = time.perf_counter()
    for i in range(N_MEMB):
        cur.execute("select start_time, end_time from staff_schedule "
                     "where staff_id = ? and day = ?", (f"stf-{i}", "thursday")).fetchall()
    return (time.perf_counter() - t0) * 1000


WARM, N = 40, 400
res = {}
orders = [("A0 sans index", "A1 (staff_id) seul", "A2 (staff_id, day)"),
          ("A2 (staff_id, day)", "A1 (staff_id) seul", "A0 sans index")]
for o, order in enumerate(orders, 1):
    print(f"\npassage {o}  ordre: {' > '.join(order)}")
    for label in order:
        drop_all()
        for ddl in IDX[label]:
            cur.execute(ddl)
        con.commit()
        plan = plan_of()
        for _ in range(WARM):
            one_tour()
        samples = [one_tour() for _ in range(N)]
        p50, p95 = statistics.median(samples), sorted(samples)[int(len(samples) * 0.95)]
        res.setdefault(label, []).append((p50, p95, plan))
        uses_index = "USING INDEX" in plan or "USING COVERING INDEX" in plan
        scan = "SCAN sans index" if ("SCAN" in plan and not uses_index) else "SEARCH via index"
        print(f"  {label:22s} p50={p50:6.3f}ms  p95={p95:6.3f}ms  [{scan}]  {plan[:74]}")

print("\n=== VERDICT (moyenne des deux passages, ABBA) ===")
base = statistics.mean(p50 for p50, _, _ in res["A0 sans index"])
for label in ("A1 (staff_id) seul", "A2 (staff_id, day)"):
    p50 = statistics.mean(p50 for p50, _, _ in res[label])
    gain = (base - p50) * 100 / base if base else 0.0
    seuil = "RETENU (>=15%)" if gain >= 15 else "REFUSE (sous le seuil)"
    print(f"  {label:22s} {p50:6.3f}ms vs {base:6.3f}ms  gain={gain:+6.1f}%  -> {seuil}")
plans = {label: {p for _, _, p in res[label]} for label in res}
print("\n  plans observes:")
for label in res:
    for p in plans[label]:
        print(f"    {label:22s} {p[:96]}")

# cout a l'ecriture : un index se paye a chaque ecriture (webhook HACCP, releves)
def write_cost():
    t0 = time.perf_counter()
    for i in range(2000):
        cur.execute("insert into staff_schedule values (?,?,?,?,?,?)",
                    (f"w-{time.time_ns()}-{i}", "stf-1", "thursday", "09:00", "17:00", "2026-12-01"))
    con.rollback()
    return (time.perf_counter() - t0) * 1000 / 2000


drop_all()
w0 = statistics.median([write_cost() for _ in range(3)])
for ddl in IDX["A2 (staff_id, day)"]:
    cur.execute(ddl)
con.commit()
w2 = statistics.median([write_cost() for _ in range(3)])
sur = (w2 - w0) * 100 / w0 if w0 else 0.0
print(f"\ncout a l'ecriture (ms/insertion) : sans={w0:.4f}  avec (staff_id,day)={w2:.4f}  "
      f"surcout={sur:+.1f}%")
con.close()
