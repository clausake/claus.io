#!/usr/bin/env python3
# Decision d'index pour la NOUVELLE requete de la prevision d'achat.
#
# Regle du projet (PHASES.md) : une decision d'index ne se prend ni sur un p95
# HTTP ni sur une intuition. Elle se prend dans la couche SQL PURE, sur des
# donnes dans la FORME QUE L'ECRITURE DE L'APP PRODUIT, et le plan doit afficher
# le predicat PLEIN. Un verdict rendu sur 0 ligne n'est pas un refus : c'est un
# NON EVALUE (c'est ainsi que le consensus du 09/09 etait moitie faux).
#
# La question precisee ici. La requete de computeRecipeNeed filtre :
#     DATE(mp.date) >= DATE(?) AND DATE(mp.date) <= DATE(?, '+N days')
# Or DATE(col) est une FONCTION appliquee a la colonne : le predicat est NON
# SARGABLE, donc un index sur menu_planning(date) ne peut pas etre exploite.
# Mesurer sert a trancher entre :
#   (a) rester en DATE() sans index   (b) installer l'index quand meme
#   (c) recrire en comparaison texte-a-texte (ISO zero-padde, donc indexable)
#
# La forme semee est celle de la VOIE D'ECRITURE de l'app : POST
# /api/menu-planning stocke `date` tel que la vue Menu le produit
# (toISOString().split("T")[0], donc AAAA-MM-JJ zero-padde). Semer une autre
# forme jugerait une requete que personne n'emete.
#
# Le volume est un volume de service (dix-huit mois de couverts), pas une base
# de demarrage a sept lignes : un p95 mesure sur une base vide n'a pas de sens.
#
# Lancement : python3 scripts/probe-index-forecast.py
import datetime
import os
import shutil
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
BASE = os.path.dirname(HERE)
WORKROOT = os.path.join(os.path.expanduser("~"), ".cook-probe-index-forecast")
N_DAYS = 520            # ~17 mois de services
N_PLATS_JOUR = 2
N_ING = 4
N_RECETTES = 40
N_ITEMS = 60
SEUIL_GAIN = 15.0       # % sous lequel un index reste une dette d'ecriture
REPETITIONS = 160

SQL_INSTALLEE = """
SELECT ri.inventory_id AS inventory_id,
       mp.recipe_json  AS recipe_json,
       ri.quantity_per_person AS quantity_per_person
  FROM menu_planning mp
  JOIN recipe_ingredients ri ON ri.recipe_id = mp.recipe_id
 WHERE mp.recipe_id IS NOT NULL
   AND mp.recipe_id <> ''
   AND DATE(mp.date) >= DATE(?)
   AND DATE(mp.date) <= DATE(?, '+' || ? || ' days')
"""

# variante SARGABLE : comparaison texte-a-texte sur l'ISO zero-padde, indexable
SQL_SARGABLE = """
SELECT ri.inventory_id AS inventory_id,
       mp.recipe_json  AS recipe_json,
       ri.quantity_per_person AS quantity_per_person
  FROM menu_planning mp
  JOIN recipe_ingredients ri ON ri.recipe_id = mp.recipe_id
 WHERE mp.recipe_id IS NOT NULL
   AND mp.recipe_id <> ''
   AND mp.date >= ?
   AND mp.date <= ?
"""


def rows_of(con, sql, params=None):
    return list(con.execute(sql, params or []))


def iso_day(d):
    return "%04d-%02d-%02d" % (d.year, d.month, d.day)


def build_db(path):
    if os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    for ddl in (
        "CREATE TABLE menu_planning (id TEXT PRIMARY KEY, date TEXT NOT NULL,"
        " meal_type TEXT NOT NULL, recipe_id TEXT, title TEXT, recipe_json TEXT,"
        " language TEXT DEFAULT 'fr')",
        "CREATE TABLE recipe_ingredients (id TEXT PRIMARY KEY, recipe_id TEXT,"
        " inventory_id TEXT, quantity_per_person REAL)",
        "CREATE TABLE inventory (id TEXT PRIMARY KEY, name TEXT, unit TEXT,"
        " quantity REAL, minStock REAL, yield_percent REAL)",
    ):
        con.execute(ddl)

    for i in range(N_ITEMS):
        con.execute(
            "INSERT INTO inventory (id, name, unit, quantity, minStock, yield_percent)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            ("inv-%03d" % i, "Article %03d" % i, "kg", 20.0, 8.0,
             100.0 if i % 5 else 80.0))

    k = 0
    for r in range(N_RECETTES):
        for j in range(N_ING):
            con.execute(
                "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person)"
                " VALUES (?, ?, ?, ?)",
                ("ri-%05d" % k, "rec-%03d" % r, "inv-%03d" % ((r * 7 + j * 3) % N_ITEMS),
                 float(30 + (j * 17) % 220)))
            k += 1

    start = datetime.date.today()
    i = 0
    for off in range(N_DAYS):
        day = iso_day(start + datetime.timedelta(days=off))
        for p in range(N_PLATS_JOUR):
            cov = 20 + (i % 40)
            con.execute(
                "INSERT INTO menu_planning (id, date, meal_type, recipe_id, title,"
                " recipe_json, language) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("mp-%06d" % i, day, "LUNCH" if p == 0 else "DINNER",
                 "rec-%03d" % (i % N_RECETTES), "Plat %d" % i,
                 '{"couverts":%d,"cout_matiere":3.4}' % cov, "fr"))
            i += 1

    # ⚠ Sans ce commit, la sonde est UN PASS CREUX parfait : la connexion qui a
    # insere voit ses 1040 rangees (les compteurs annoncés sont donc VERTS), mais
    # elles ne sont jamais ecrites — toute requete ulterieure, sur une connexion
    # rouverte comme la suite de bench, ne voit QUE ZERO ligne et le bench rend
    # des millisecondes sur un scan vide. Le garde d'arret l'a pris en faute, mais
    # le piege est subtil : les compteurs de la graine mentent en meme temps.
    con.commit()
    counts = [rows_of(con, "SELECT COUNT(*) FROM " + t)[0][0]
              for t in ("menu_planning", "recipe_ingredients", "inventory")]
    con.close()
    # contre-controle : une SECONDE connexion doit voir les memes volumes
    verification = sqlite3.connect(path)
    revues = [rows_of(verification, "SELECT COUNT(*) FROM " + t)[0][0]
              for t in ("menu_planning", "recipe_ingredients", "inventory")]
    verification.close()
    assert revues == counts, (
        "graine non persistee: compte a la construction %s, re-vus %s"
        % (counts, revues))
    return counts


def bench(con, sql, params, n=REPETITIONS):
    # Echauffement : statements prepares + cache de pages froids. Sans lui le
    # premier bras paye la froidure et le verdict depend de l'ordre et non du
    # traitement (piege consigne pour les A/B multi-processus).
    for _ in range(8):
        rows_of(con, sql, params)
    times = []
    lignes = 0
    for _ in range(n):
        t0 = time.time()
        lignes = len(rows_of(con, sql, params))
        times.append((time.time() - t0) * 1000.0)
    times.sort()
    return times[len(times) // 2], times[int(len(times) * 0.95)], lignes


def plan_of(con, sql, params):
    return " / ".join(str(r[3]) for r in rows_of(con, "EXPLAIN QUERY PLAN " + sql, params))


def main():
    shutil.rmtree(WORKROOT, ignore_errors=True)
    os.makedirs(WORKROOT, exist_ok=True)
    db = os.path.join(WORKROOT, "bench.db")
    counts = build_db(db)

    print("=" * 78)
    print("DECISION D'INDEX - requete de la prevision d'achat (couche SQL pure)")
    print("=" * 78)
    print("  menu_planning=%d  recipe_ingredients=%d  inventory=%d"
          % (counts[0], counts[1], counts[2]))
    today = time.strftime("%Y-%m-%d")
    end = iso_day(datetime.date.today() + datetime.timedelta(days=14))
    print("  fenetre jugee : [%s .. %s] (14 jours)" % (today, end))

    con = sqlite3.connect(db)
    try:
        con.execute("DROP INDEX IF EXISTS idx_mp_date")
    except Exception:
        pass
    a = bench(con, SQL_INSTALLEE, [today, today, 14])
    pa = plan_of(con, SQL_INSTALLEE, [today, today, 14])

    con.execute("CREATE INDEX IF NOT EXISTS idx_mp_date ON menu_planning(date)")
    b = bench(con, SQL_INSTALLEE, [today, today, 14])
    pb = plan_of(con, SQL_INSTALLEE, [today, today, 14])

    c = bench(con, SQL_SARGABLE, [today, end])
    pc = plan_of(con, SQL_SARGABLE, [today, end])
    con.close()

    # Le garde du harnais d'index : une forme qui ne rapporte AUCUNE ligne est un
    # scan vide chronometré. Ce n'est pas un refus, c'est un NON EVALUE.
    if a[2] == 0 or b[2] == 0 or c[2] == 0:
        print("\nARRET : une des formes ne rapporte AUCUNE ligne (%d/%d/%d)."
              % (a[2], b[2], c[2]))
        print("Un chiffre sur un scan vide ne doit pas etre lu comme un verdict.")
        print("Ne rien conclure, et ne rien installer.")
        shutil.rmtree(WORKROOT, ignore_errors=True)
        return 2

    print("\n  %-40s %12s %12s %8s" % ("etat", "p50 ms", "p95 ms", "lignes"))
    for label, r in (("A  DATE() sans index (l'etat installe)", a),
                     ("B  DATE() avec idx_mp_date", b),
                     ("C  texte-a-texte avec idx (sargable)", c)):
        print("  %-40s %12.3f %12.3f %8d" % (label, r[0], r[1], r[2]))

    print("\n  PLANS - le predicat doit etre PLEIN, sinon l'index ne sert a rien :")
    for tag, pl in (("A", pa), ("B", pb), ("C", pc)):
        print("    %s  %s" % (tag, pl[:170]))

    gain_b = (a[1] - b[1]) / a[1] * 100.0
    gain_c = (a[1] - c[1]) / a[1] * 100.0
    print("\n  gain p95 - B (index sur la forme DATE())   : %+.1f %%" % gain_b)
    print("  gain p95 - C (forme sargable + index)      : %+.1f %%" % gain_c)

    print("\n  DECISIONS :")
    if gain_b >= SEUIL_GAIN:
        print("    1. INSTALLER idx_mp_date : gain prouvé sur la forme installee.")
    else:
        print("    1. NE PAS installer idx_mp_date tel quel. DATE(col) est une fonction")
        print("       appliquee a la colonne : NON SARGABLE, SQLite ne peut pas exploiter")
        print("       l'index (gain mesure %+.1f %%, sous le seuil de %.0f %%). Un index" % (gain_b, SEUIL_GAIN))
        print("       non prouvé est une dette a l'ecriture, pas une optimisation.")
    if gain_c >= SEUIL_GAIN and gain_c > gain_b:
        print("    2. REECRIRE le filtre en comparaison texte-a-texte (ISO zero-padde)")
        print("       puis installer l'index : gain %+.1f %%." % gain_c)
        print("       Licite UNIQUEMENT parce que la voie d'ecriture de l'app produit de")
        print("       l'ISO zero-padde (MenuAnalysis: toISOString().split('T')[0]).")
    else:
        print("    2. GARDER la forme DATE() sans index. A %d lignes de plan, le scan" % a[2])
        print("       coute %s ms (p50) : sous tout seuil decisionnel. La robustesse du" % ("%.3f" % a[0]))
        print("       parse de date (survit a un '2026-9-5' herite d'une vieille saisie")
        print("       qu'un texte-a-texte lirait comme une autre date) est moins chere")
        print("       qu'un index non prouvé.")
    print("\n  ⚠ Ce verdict ne vaut que pour CE volume (%d lignes) et CETTE forme de" % a[2])
    print("    date. Un changement de l'une des deux invalide la decision : relancer.")
    shutil.rmtree(WORKROOT, ignore_errors=True)
    return 0


sys.exit(main())
