# Decision de la forme de /api/dashboard/stats : boucle N+1 vs UNE jointure, et
# l'index que la jointure exige -- juge par MESURE, avec la COLONNE QUE L'APP
# REMPLIT REELLEMENT.
#
# Decouverte qui rend la sonde probe-nplus1.py INUTILISABLE pour la decision :
#   - elle semait via le harnais d'index, qui remplit day=DATE ISO et laisse
#     'date' NULL (66/66 lignes de la base CLIENT (promo_resto) ont day=ISO ET
#     date=ISO, jamais de nom de jour) ;
#   - la route, elle, filtre WHERE day = NOM_DE_JOUR ("thursday") : 0 ligne
#     rapportee dans le seed du harnais COMME dans la base client. Le "N+1"
#     chronometre par probe-nplus1 etait donc 40 scans au RESULTAT VIDE sur une
#     table de 4 000 lignes, et la jointure, elle, filtrait date BETWEEN sur
#     4 000 lignes POPULEES. Les deux bras ne mesuraient pas la meme requete :
#     le gain -12,3 % consigne est un artefact de seed, pas un resultat.
#   - ici les QUATRE bras portent le MEME predicat (date = <jour ISO peuple>),
#     le volume est un parametre (sensibilité), et l'ordre est ABBA echauffe.
#
# Bras (meme table, meme jour peuple) :
#   B  N+1      : 40 requetes "where staff_id=? and date=?"   (la forme actuelle, corrigee)
#   C  jointure : UNE seule requete staff LEFT JOIN staff_schedule sur date
#   D  jointure + index staff_schedule(staff_id, date)        <- ce que D doit battre C
#
# Regles de decision (consignees dans le skill) : un bras n'est RETENU que s'il
# descend le p50 d'au moins 15 % au-dessus du bruit ; l'equivalence du RESULTAT
# (total des heures) est verifiee, sinon la mesure est vaine.
import os
import sys
import time
import math
import sqlite3
import statistics

DATA = os.path.expanduser("~/.cookdrive-probe-join")
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "join.db")

N_MEMB = 40
SHIFTS = 2


def build(target):
    """Reconstruit la base au volume demande, dans LA FORME QUE L'APP ecrit
    (staff.ts POST /api/staff : day = date = 'YYYY-MM-DD')."""
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f):
            os.remove(f)
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.executescript("""
        CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT, active INTEGER, hourly_rate REAL);
        CREATE TABLE staff_schedule (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, day TEXT,
                                     start_time TEXT, end_time TEXT, date TEXT);
    """)
    cur.executemany("insert into staff values (?,?,?,?)",
                    [(f"stf-{i}", f"Membre {i:02d}", 1, 15.0 + (i % 9)) for i in range(N_MEMB)])
    days_needed = math.ceil(target / (N_MEMB * SHIFTS))
    seq = 0
    from datetime import date, timedelta
    d0 = date(2020, 1, 1)
    batch = []
    for k in range(days_needed):
        iso = (d0 + timedelta(days=k)).isoformat()
        for i in range(N_MEMB):
            for s in range(SHIFTS):
                seq += 1
                batch.append((f"sc-{seq}", f"stf-{i}", iso,
                              f"{6 + s * 6:02d}:00", f"{12 + s * 6:02d}:00", iso))
                if len(batch) >= 20000:
                    cur.executemany("insert into staff_schedule values (?,?,?,?,?,?)", batch)
                    batch = []
    if batch:
        cur.executemany("insert into staff_schedule values (?,?,?,?,?,?)", batch)
    con.commit()
    cur.execute("ANALYZE")
    con.commit()
    return con


def day_peuple(cur):
    """Le jour le plus peuple REELLEMENT present (jamais un jour invente : une
    mesure sur 0 ligne rapportee est un scan vide, pas un bench)."""
    row = cur.execute("select date, count(*) from staff_schedule group by date "
                      "order by 2 desc limit 1").fetchone()
    return row[0], row[1]


NPLUS1 = "SELECT start_time, end_time FROM staff_schedule WHERE staff_id = ? AND date = ?"
JOIN = ("SELECT sc.start_time, sc.end_time, s.hourly_rate "
        "FROM staff s LEFT JOIN staff_schedule sc ON sc.staff_id = s.id AND sc.date = ? "
        "WHERE s.active = 1")


def arm_nplus1(cur, membres, day):
    t0 = time.perf_counter()
    tot = 0
    for mid in membres:
        tot += len(cur.execute(NPLUS1, (mid, day)).fetchall())
    return (time.perf_counter() - t0) * 1000, tot


def arm_join(cur, day):
    t0 = time.perf_counter()
    rows = cur.execute(JOIN, (day,)).fetchall()
    return (time.perf_counter() - t0) * 1000, len(rows)


def total_heures_nplus1(cur, membres, day):
    tot = 0.0
    for mid in membres:
        rate = cur.execute("select hourly_rate from staff where id = ?", (mid,)).fetchone()[0]
        for st, en in cur.execute(NPLUS1, (mid, day)).fetchall():
            if not st or not en:
                continue
            h1, m1 = (int(x) for x in st.split(":")[:2])
            h2, m2 = (int(x) for x in en.split(":")[:2])
            d = h2 * 60 + m2 - (h1 * 60 + m1)
            if d < 0:
                d += 1440
            tot += d / 60 * (rate or 15)
    return tot


def total_heures_join(cur, day):
    tot = 0.0
    for st, en, rate in cur.execute(JOIN, (day,)).fetchall():
        if not st or not en:
            continue
        h1, m1 = (int(x) for x in st.split(":")[:2])
        h2, m2 = (int(x) for x in en.split(":")[:2])
        d = h2 * 60 + m2 - (h1 * 60 + m1)
        if d < 0:
            d += 1440
        tot += d / 60 * (rate or 15)
    return tot


def plan_de(cur, sql, args):
    rows = cur.execute("EXPLAIN QUERY PLAN " + sql, args).fetchall()
    return " | ".join(" ".join(str(c) for c in r) for r in rows)


def p(s):
    return statistics.median(s), sorted(s)[int(len(s) * 0.95)]


WARM, N = 30, 300
TARGETS = [int(x) for x in (sys.argv[1:] or ["150000", "20000", "500"])]

for TARGET in TARGETS:
    print(f"\n############  VOLUME DE TABLE = {TARGET}  ############", flush=True)
    con = build(TARGET)
    cur = con.cursor()
    DAY, ROWS_DAY = day_peuple(cur)
    membres = [r[0] for r in cur.execute("select id from staff where active = 1").fetchall()]
    hits = sum(len(cur.execute(NPLUS1, (m, DAY)).fetchall()) for m in membres)
    print(f"   membres={len(membres)}  jour peuple={DAY}  lignes/ce jour={ROWS_DAY}  "
          f"lignes rapportees par la boucle={hits}", flush=True)
    if hits == 0:
        raise SystemExit("le filtre ne ramene rien: la mesure serait vaine")

    # ECHAUFFEMENT des trois bras (le skill l'exige : sinon le verdict depend de
    # l'ordre et on l'a revu: A2=47.7ms en tete de passage, 37.2ms en second).
    def drop():
        cur.execute("DROP INDEX IF EXISTS ix_ss_staff_date")
        con.commit()

    def set_idx():
        cur.execute("CREATE INDEX IF NOT EXISTS ix_ss_staff_date ON staff_schedule(staff_id, date)")
        con.commit()

    # Quatre bras, pas trois. Juger la jointure SANS index contre le N+1 SANS
    # index laisse dans l'ombre la forme la plus probable a retenir: garder le
    # N+1 et simply poser l'index. Sans le bras E, on remplacerait du code pour
    # un gain que le seul index deja rattrape (et un changement de code, lui, se
    # paie en risque de faute, pas en millisecondes).
    NEEDS_IDX = {"D jointure+index", "E N+1+index"}
    arms = {
        "B N+1 sans index":    lambda: arm_nplus1(cur, membres, DAY)[0],
        "C jointure sans idx": lambda: arm_join(cur, DAY)[0],
        "D jointure+index":    lambda: arm_join(cur, DAY)[0],
        "E N+1+index":         lambda: arm_nplus1(cur, membres, DAY)[0],
    }
    plans = {}
    samples = {k: [] for k in arms}
    # ABBA sur les 4 bras, deux passages en ordre inverse : l'ordre ne doit pas
    # decider du verdict (l'artefact vu dans probe-index-staffday: A2=47,7 ms en
    # tete de passage contre 37,2 ms en second, soit 28 % de derive d'ordre).
    ordre1 = list(arms)
    ordre2 = list(reversed(ordre1))
    # A grand volume, un tour sans index vaut des centaines de ms: on borne N
    # pour rester dans un temps de mesure utile sans sacrifier la mediane.
    n = 300 if TARGET <= 20000 else 120
    for tour, ordre in enumerate((ordre1, ordre2), 1):
        for label in ordre:
            if label in NEEDS_IDX:
                set_idx()
            else:
                drop()
            for _ in range(WARM):
                arms[label]()
            for _ in range(n):
                samples[label].append(arms[label]())
        print(f"   passage {tour} termine ({n} echantillons/bras)", flush=True)
    # Les plans sont releves SEPARERMENT, chaque bras avec SON etat d'index:
    # un plan lu alors qu'un autre index reste en place se lit "SEARCH USING
    # INDEX" et fait passer un bras sans index pour un bras indexes.
    one = "SELECT start_time, end_time FROM staff_schedule WHERE staff_id = ? AND date = ?"
    drop()
    plans["B N+1 sans index"] = plan_de(cur, one, (membres[0], DAY))
    plans["C jointure sans idx"] = plan_de(cur, JOIN, (DAY,))
    set_idx()
    plans["D jointure+index"] = plan_de(cur, JOIN, (DAY,))
    plans["E N+1+index"] = plan_de(cur, one, (membres[0], DAY))
    con.close()

    res = {k: p(v) for k, v in samples.items()}
    print(f"\n   {'bras':22s} {'p50':>9s} {'p95':>9s}", flush=True)
    for k in arms:
        print(f"   {k:22s} {res[k][0]:8.3f}ms {res[k][1]:8.3f}ms", flush=True)
    b = res["B N+1 sans index"][0]
    c = res["C jointure sans idx"][0]
    d = res["D jointure+index"][0]
    e = res["E N+1+index"][0]
    # Une forme ne vaut que si elle bat le MEILLEUR des bras sans index, pas un
    # bras arbitraire: sinon on se felicite d'un gain contre le pire candidat.
    meilleur_sans = min(b, c)
    gains = {
        "D jointure+index  vs meilleur sans index": (meilleur_sans - d) * 100 / meilleur_sans,
        "E N+1+index       vs meilleur sans index": (meilleur_sans - e) * 100 / meilleur_sans,
        "E N+1+index       vs D jointure+index":    (d - e) * 100 / d if d else 0.0,
    }
    print(f"\n   meilleur bras sans index = {'B N+1' if b <= c else 'C jointure'} ({meilleur_sans:.3f} ms)", flush=True)
    for k, g in gains.items():
        print(f"   {k}: {g:+6.1f} %  -> {'RETENU' if g >= 15 else 'REFUSE'}", flush=True)
    for k, v in plans.items():
        print(f"   plan[{k}] {str(v)[:150]}", flush=True)

    # EQUIVALENCE: les deux formes doivent calculer la MEME somme d'heures, avec
    # un membre SANS vacation ce jour-la (le LEFT JOIN emet une ligne NULL que
    # la boucle, elle, n'emet pas: c'est la que les deux formes peuvent diverger).
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("delete from staff_schedule where staff_id = ?", (membres[0],))
    con.commit()
    set_idx()
    restants = [m for m in membres
                if cur.execute("select count(*) from staff_schedule where staff_id=? and date=?",
                               (m, DAY)).fetchone()[0] > 0]
    v1 = total_heures_nplus1(cur, membres, DAY)
    v2 = total_heures_join(cur, DAY)
    attendu = total_heures_nplus1(cur, restants, DAY)
    ok = abs(v1 - attendu) < 1e-9 and abs(v2 - attendu) < 1e-9
    print(f"   membres sans vacation ce jour: {len(membres) - len(restants)}", flush=True)
    print(f"   EQUIVALENCE heures: N+1={v1:.4f}  jointure={v2:.4f}  attendu={attendu:.4f}  "
          f"identique={ok}", flush=True)
    if not ok:
        raise SystemExit("les deux formes ne calculent pas la meme somme: verdict invalide")
    con.close()

print("\nMEMO: le verdict ne porte QUE sur le volume mesure. Un gain qui depend")
print("du volume doit etre juge au volume du CLIENT, pas au volume du harness.")
