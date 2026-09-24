# Preuve que les DEUX index de /api/dashboard/stats sont reellement installes,
# sur les DEUX etats qui comptent : base NEUVE (nouveau client) et base EXISTANTE
# (client deja installe, le cas ou une migration non idempotente casse).
#
# Ce qui est verifie et non suppose :
#   - les DEUX index APPAISSENT dans sqlite_master apres un demarrage sur base neuve ;
#   - ils REAPPARAISSENT apres qu'on les a supprimes a la main sur une base existante
#     (prouve l'idempotence reellement relancable, pas seulement le IF NOT EXISTS) ;
#   - le PLAN de CHAQUE BRANCHE de la requete de la route dit SEARCH ... USING INDEX
#     avec SES DEUX predicats, et non un `SEARCH (staff_id=?)` partial. Ce detail
#     est le coeur de cette sonde : un index partiel SE LIT « USING INDEX » et fait
#     passer un bras non indexe pour un bras indexes (l'artefact exact qui a rendu
#     le verdict du 09/09 faux -- il portait sur une seule colonne, ce qui laissait
#     l'autre a 527 fois le cout) ;
#   - le filre de la route rapporte des LIGNES: un plan sur un resultat vide ne
#     prouverait rien ;
#   - la route repond toujours un JSON exploitable (les index ne doivent rien casser).
import os
import subprocess
import sys
import json
import time
import sqlite3
import shutil
import urllib.request

REPO = os.path.expanduser("~/cookdrive-project")
os.chdir(REPO)
sys.path.insert(0, os.path.join(REPO, "scripts"))
import _sondes_serveur as ss
NODE = shutil.which("node")
assert NODE and "python" not in NODE.lower(), "mauvais interpreteur: " + str(NODE)

PORT = 4481
BASE = "http://127.0.0.1:" + str(PORT)
DATA = os.path.expanduser("~/.cookdrive-idx-proof")

# Les DEUX index et leurs DEUX branches. Un seul ne suffit pas: la requete est un
# UNION ALL, et une branche n'est rendue PLEINE que par l'index qui porte SES deux
# predicats (scripts/probe-index-reel.py : un index seul laisse l'autre branche a
# `SEARCH ... (staff_id=?)`, soit 527 fois le tour complet).
B1, B2 = "ix_staff_schedule_staff_date", "ix_staff_schedule_staff_day"
INDEXES = [B1, B2]
JOURS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
TODAY_ISO = time.strftime("%Y-%m-%d")
TODAY_NOM = JOURS[(time.localtime().tm_wday + 1) % 7]   # JS getDay(): 0 = dimanche


def boot():
    ss.bootstrap(PORT)
    ch = ss.Popen_sonde([NODE, "node_modules/.bin/tsx", "server.ts"],
                        env=dict(os.environ, PORT=str(PORT), USER_DATA_PATH=DATA),
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(200):
        try:
            with urllib.request.urlopen(BASE + "/health", timeout=2) as r:
                json.loads(r.read())
                return ch
        except Exception:
            time.sleep(0.4)
    ss.tuer_groupe(ch)
    raise SystemExit("serveur pas pret: la migration n'a pas tourne")


def halt(ch):
    ss.tuer_groupe(ch)


def db():
    return sqlite3.connect(os.path.join(DATA, "agent_culinaire.db"))


def index_rows():
    con = db()
    try:
        return [r[0] for r in con.execute(
            "select name from sqlite_master where type='index' and tbl_name='staff_schedule'")]
    finally:
        con.close()


# Les DEUX branches separement: juger le UNION ALL entier ne dit pas si CHACUNE
# est couvre. Chaque branche est testee avec SES deux predicats.
BRANCHES = {
    "branche 1 (chaude: date)": (
        "select start_time, end_time from staff_schedule where staff_id = ? and date = ?",
        ("stf-7", TODAY_ISO), B1, "(staff_id=? AND date=?)"),
    "branche 2 (heritee: day)": (
        "select start_time, end_time from staff_schedule "
        "where staff_id = ? and day = ? and (date is null or date = '')",
        ("stf-7", TODAY_NOM), B2, "(staff_id=? AND day=?)"),
}


def plan(sql, args):
    con = db()
    try:
        rows = con.execute("explain query plan " + sql, args).fetchall()
        return " | ".join(" ".join(str(c) for c in row) for row in rows)
    finally:
        con.close()


def seed():
    """Le seed porte les DEUX formes que l'app ecrit (jour ISO + heritee), avec
    ses COLONNES NOMMEES -- jamais positionnelles: la colonne `date` est AJOUTEE
    par ensureColumn, un INSERT sans noms y permute start_time et date sans
    jamais crierer (piege rencontre deux fois sur ce chantier)."""
    con = db()
    try:
        if con.execute("select count(*) from staff_schedule").fetchone()[0] >= 2000:
            return con
    except Exception:
        pass
    import datetime
    j0 = datetime.date(2020, 1, 1)
    rows = []
    for i in range(4000):
        iso = (j0 + datetime.timedelta(days=i % 700)).isoformat()
        rows.append((f"ix-{i}", f"stf-{i % 40}", iso, "06:00", "14:00", iso))
    for i in range(400):                      # la forme des vieilles installations
        rows.append((f"ixh-{i}", f"stf-{i % 40}", JOURS[i % 7], "06:00", "14:00", None))
    # ⚠ Les deux rangees DU JOUR pour le membre juge par `plan()`. Sans elles, le
    # plan d'une branche se lit sur un resultat VIDE: le plan est magnifique, le
    # SEARCH USING INDEX est la, et il ne prouverait RIEN (le garde « rapporte »
    # l'a fait rougir a la premiere execution de cette sonde alignee -- c'est lui
    # qui a mordu, pas la sonde qui avait raison a l'avance).
    rows.append(("ix-jour-1", "stf-7", TODAY_ISO, "06:00", "14:00", TODAY_ISO))
    rows.append(("ix-jour-2", "stf-7", TODAY_NOM, "15:00", "22:00", None))
    con.executemany("insert or ignore into staff_schedule "
                    "(id, staff_id, day, start_time, end_time, date) values (?,?,?,?,?,?)",
                    rows)
    con.commit()
    return con


ok = {}

print("### 1. base NEUVE : la migration doit creer les DEUX index ###", flush=True)
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)
halt(boot())
names = index_rows()
for idx in INDEXES:
    ok[f"apparition:{idx}"] = idx in names
    print(f"   {idx:32s} present sur base neuve : {ok[f'apparition:{idx}']}", flush=True)
print(f"   (index trouves: {names})", flush=True)

print("\n### 2. remplissage, puis PLAN de CHAQUE branche de la requete ###", flush=True)
con = seed()
total = con.execute("select count(*) from staff_schedule").fetchone()[0]
con.close()
print(f"   lignes en table = {total}", flush=True)
for label, (sql, args, idx, plein) in BRANCHES.items():
    con = db()
    n_hit = len(con.execute(sql, args).fetchall())
    con.close()
    p = plan(sql, args)
    rapporte = n_hit > 0
    utilise = idx in p
    plein_ok = plein in p            # le second predicat est reellement dans le plan
    ok[f"{label}:rapporte"] = rapporte
    ok[f"{label}:plan-plein"] = bool(plein_ok)
    print(f"   {label}")
    print(f"      lignes rapportees = {n_hit}  [{'ok' if rapporte else 'VEINE'}]")
    print(f"      SEARCH via {idx} avec {plein} : {'OUI' if plein_ok else 'NON'}")
    print(f"      plan = {p[:150]}")
    if not rapporte:
        print("      ⚠ un plan sur un resultat vide ne prouverait rien")

print("\n### 3. base EXISTANTE : les index doivent REAPPARAITRE apres suppression ###",
      flush=True)
con = db()
for idx in INDEXES:
    con.execute(f"drop index if exists {idx}")
con.commit()
supprimes = all(idx not in index_rows() for idx in INDEXES)
con.close()
print(f"   supprimes a la main : {supprimes}")
halt(boot())
for idx in INDEXES:
    ok[f"reapparition:{idx}"] = idx in index_rows()
    print(f"   REAPPARITION {idx:32s}: {ok[f'reapparition:{idx}']}", flush=True)
ok["suppression_constatee"] = bool(supprimes)

print("\n### 4. la route repond toujours (les index ne doivent rien casser) ###", flush=True)
ch = boot()
try:
    with urllib.request.urlopen(BASE + "/api/dashboard/stats", timeout=10) as r:
        body = json.loads(r.read())
    print(f"   HTTP {r.status}, clefs = {sorted(body.keys())}")
    ok["route"] = bool(r.status == 200 and all(k in body for k in
                        ("totalStockValue", "activeAlerts", "criticalItems", "dailyLaborCost")))
    print(f"   contrat de reponse respecté : {ok['route']}", flush=True)
    print(f"   (le KPI de la branche heritee doit rester un nombre: "
          f"dailyLaborCost={body.get('dailyLaborCost')!r})")
finally:
    halt(ch)

shutil.rmtree(DATA, ignore_errors=True)
tous = all(ok.values())
print("\n" + "=" * 66)
for k, v in ok.items():
    if not v:
        print(f"   ECHEC : {k}")
print("  RESULTAT : " + ("LES DEUX INDEX POSÉS, CHAQUE BRANCHE PLEINE, ROUTE VERTE"
                        if tous else "PREUVE INCOMPLETE"))
print("=" * 66)
sys.exit(0 if tous else 1)
