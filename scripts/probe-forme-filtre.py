# A/B des TROIS formes du filtre de /api/dashboard/stats, a volume de planning
# d'annee, en couche SQL PURE (le skill l'impose: le p95 HTTP de cette route a
# un bruit inter-bloc du meme ordre que l'effet cherche).
#
# Pourquoi cette mesure existe. Le correctif du 10/09 (dailyLaborCost fige a 0)
# filtrait la vacation du jour. Sa premiere version utilisait un OR:
#   WHERE staff_id = ? AND (date = ? OR (day = ? AND (date IS NULL OR date = '')))
# et le plan releve montre que l'OR EMPECHE SQLite d'exploiter la seconde
# colonne de l'index composite:
#   SEARCH ... USING INDEX ix_ss_staff_date (staff_id=?)              <- OR
#   SEARCH ... USING INDEX ix_ss_staff_date (staff_id=? AND date=?)   <- sans OR
# soit le cas « index sur une seule colonne » mesure +54,8 % dans la sonde
# soeur, contre +86,7 % pour le composite plein. La question n'est donc pas
# « l'index aide-t-il ? » (il aide) mais « quelle FORMULE de filtre garde
# l'index plein sans perdre la defense des bases heritees ? ».
#
# Les candidats, MEME table, MEME jour peuple, MEME index composite, ABBA
# echauffe (l'ordre ne doit pas decider du verdict) :
#   W1 OR          -> defend les bases heritees, mais l'OR casse l'index
#   W2 UNION ALL   -> meme defense, chaque branche garde son predicat complet,
#                     donc l'index reste exploitable PLEINEMENT des deux cotes
#   W3 date seule  -> index plein, AUCUNE defense heritee (regresse de cas)
#   W0 aucun filtre du jour -> garde-fou: doit etre le plus lent ET le plus faux
#
# ⚠ REGLE DE FACTURE de ce harnais (apprendre a la premiere execution, qui a
#   produit un plan sur 'date' = '18:00'): la table reelle porte
#   (id, staff_id, day, start_time, end_time, date) -- `date` est une colonne
#   AJOUTEE par ensureColumn, donc pas a la fin de ce que l'on croit. Un INSERT
#   POSITIONNEL y permute silencieusement start_time et date, et le harnais
#   mesure alors un scan de donnes impossibles sans jamais crier. Des lors:
#   TOUT insert de sonde nomme SES COLONNES, et la somme de controle est calculee
#   en Python sur les rangees BRUTES (oracle independant des 4 candidats SQL).
import os
import sys
import time
import math
import sqlite3
import statistics
from datetime import date as _d, timedelta as _td

DATA = os.path.expanduser("~/.cookdrive-probe-orform")
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "or.db")
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
cur.executemany("INSERT INTO staff (id, name, active, hourly_rate) VALUES (?,?,?,?)",
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

# Une rangee HERITEE, dans le seul format que l'app n'ecrit plus mais que des
# bases installees avant l'arrivee de la colonne `date` contiennent encore:
# day = NOM de jour, date NULL. Les candidats doivent la compter; celui qui ne
# la compte pas a gagne en vitesse et perdu un cas reel de la clientele.
DAY = cur.execute("SELECT date FROM staff_schedule WHERE date IS NOT NULL "
                  "GROUP BY date ORDER BY COUNT(*) DESC LIMIT 1").fetchone()[0]
NOM = ["sunday", "monday", "tuesday", "wednesday", "thursday",
       "friday", "saturday"][_d.fromisoformat(DAY).weekday() + 1 if
                             _d.fromisoformat(DAY).weekday() != 6 else 0]
HER_STAFF = "stf-3"
cur.execute(f"INSERT INTO staff_schedule {COLS} {PH}",
            ("her-1", HER_STAFF, NOM, "09:00", "17:00", None))
con.commit()
cur.execute("ANALYZE")
con.commit()

membres = [r[0] for r in cur.execute(
    "SELECT id FROM staff WHERE active = 1 ORDER BY id").fetchall()]
NROWS = cur.execute("SELECT COUNT(*) FROM staff_schedule").fetchone()[0]
print(f"volume table = {NROWS} rangees | jour mesure = {DAY} ({NOM}) | "
      f"membres = {len(membres)}", flush=True)

# --- oracle de reference: calcul PYTHON sur les rangees brutes --------------
# Independant des 4 candidats SQL. C'est LUI qui dit qui a juste, pas eux.
def _heures(st, en):
    if not st or not en:
        return 0.0
    h1, m1 = (int(x) for x in st.split(":")[:2])
    h2, m2 = (int(x) for x in en.split(":")[:2])
    d = h2 * 60 + m2 - (h1 * 60 + m1)
    if d < 0:
        d += 1440
    return d / 60


TAUX = {r[0]: (r[1] or 15) for r in
        cur.execute("SELECT id, hourly_rate FROM staff WHERE active = 1").fetchall()}
ATTENDU = 0.0
for staff_id, st, en, dt, dy in cur.execute(
        "SELECT staff_id, start_time, end_time, date, day FROM staff_schedule"):
    if staff_id not in TAUX:
        continue
    compte = (dt == DAY) or (dy == NOM and (dt is None or dt == ""))
    if compte:
        ATTENDU += _heures(st, en) * TAUX[staff_id]
LIGNES_ATTENDUES = sum(
    1 for _, dt, dy in cur.execute("SELECT staff_id, date, day FROM staff_schedule")
    if (dt == DAY) or (dy == NOM and (dt is None or dt == "")))
print(f"oracle python: {LIGNES_ATTENDUES} rangees comptees pour {ATTENDU:.2f} €",
      flush=True)
assert LIGNES_ATTENDUES > 1, ("une seule rangee comptee: le filtre ne discrimine "
                             "rien, le classement des formes n'aurait pas de sens")

BASE = "SELECT start_time, end_time FROM staff_schedule WHERE staff_id = ?"
FORMES = {
    "W1 OR (defense complete)": (
        BASE + " AND (date = ? OR (day = ? AND (date IS NULL OR date = '')))",
        lambda m: (m, DAY, NOM)),
    "W2 UNION ALL (defense+index)": (
        BASE + " AND date = ? UNION ALL " +
        "SELECT start_time, end_time FROM staff_schedule "
        "WHERE staff_id = ? AND day = ? AND (date IS NULL OR date = '')",
        lambda m: (m, DAY, m, NOM)),
    "W3 date seule (index plein)": (
        BASE + " AND date = ?", lambda m: (m, DAY)),
    "W0 aucun filtre du jour": (BASE, lambda m: (m,)),
}


def tour(sql, argsf):
    t0 = time.perf_counter()
    n = 0
    for m in membres:
        n += len(cur.execute(sql, argsf(m)).fetchall())
    return (time.perf_counter() - t0) * 1000, n


def somme(sql, argsf):
    tot = 0.0
    for m in membres:
        for st, en in cur.execute(sql, argsf(m)).fetchall():
            tot += _heures(st, en) * TAUX.get(m, 15)
    return tot


def plan(sql, argsf):
    rows = cur.execute("EXPLAIN QUERY PLAN " + sql, argsf(membres[0])).fetchall()
    return " | ".join(" ".join(str(x) for x in r) for r in rows)


def drop():
    cur.execute("DROP INDEX IF EXISTS ix_ss_staff_date")
    con.commit()


def put():
    cur.execute("CREATE INDEX IF NOT EXISTS ix_ss_staff_date "
                "ON staff_schedule(staff_id, date)")
    con.commit()


WARM, N = 25, 150
res = {}
for etat, setup in (("SANS index", drop), ("AVEC index", put)):
    ordre = list(FORMES) if etat == "SANS index" else list(reversed(FORMES))
    for label in ordre:                      # ABBA: l'ordre ne decide pas du verdict
        setup()
        sql, argsf = FORMES[label]
        for _ in range(WARM):
            tour(sql, argsf)
        s = [tour(sql, argsf)[0] for _ in range(N)]
        res[(etat, label)] = (statistics.median(s),
                              sorted(s)[int(len(s) * 0.95)])
        print(f"   [{etat:11s}] {label:30s} p50={res[(etat,label)][0]:8.3f}ms "
              f"p95={res[(etat,label)][1]:8.3f}ms", flush=True)

print("\n=== CLASSEMENT (justesse d'abord, vitesse ensuite) ===")
faute = []
put()
for label, (sql, argsf) in FORMES.items():
    nl = tour(sql, argsf)[1]
    sm = somme(sql, argsf)
    pl = plan(sql, argsf)
    plein = "(staff_id=? AND date=?)" in pl
    juste = abs(sm - ATTENDU) < 1e-6 or label.startswith("W0")
    lignes_ok = nl == LIGNES_ATTENDUES or label.startswith("W0")
    herite = label.startswith(("W1", "W2"))
    verdict = "JUSTE" if (juste and lignes_ok) else "FAUX"
    if not (juste and lignes_ok) and not label.startswith("W0"):
        faute.append(f"{label}: somme={sm:.2f} (attendu {ATTENDU:.2f}), "
                     f"lignes={nl} (attendu {LIGNES_ATTENDUES})")
    sans = res[("SANS index", label)][0]
    avec = res[("AVEC index", label)][0]
    gain = (sans - avec) * 100 / sans if sans else 0.0
    print(f"\n{label}")
    print(f"   validite : {verdict}  (somme={sm:9.2f} vs oracle {ATTENDU:.2f}; "
          f"{nl} lignes vs {LIGNES_ATTENDUES})")
    print(f"   index    : {'PLEIN' if plein else 'partiel (staff_id seul)':6s}"
          f"   gain de l'index sur cette forme = {gain:+6.1f} %")
    print(f"   p50      : {avec:8.3f} ms   (sans index {sans:8.3f} ms)")
    print(f"   defense heritee (day = nom, date NULL) : {'OUI' if herite else 'NON'}")
    print(f"   plan     : {pl[:150]}")

print("\n" + "=" * 78)
if faute:
    print("DES FORMES SONT FAUSSES (la vitesse n'y changerait rien):")
    for f in faute:
        print("   - " + f)
con.close()
print("\nMemo: une forme plus rapide qui ne compte pas la meme chose n'est pas")
print("une optimisation, c'est une faute. Le classement ne vaut que parmi les")
print("formes JUSTES.")
sys.exit(0)
