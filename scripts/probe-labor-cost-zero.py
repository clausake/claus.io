# Test de REGRESSION du cout journalier de main d'oeuvre du tableau de bord.
#
# Le bug (trouve en lisant le code, puis CONFIRME par execution sur la base
# reelle du client, port 4173, le 2026-09-10) :
#   - src/routes/staff.ts, POST /api/staff, ecrit `day = dayOrDate` ET
#     `date = dayOrDate` avec LA MEME valeur, or l'appelant (StaffPlanning.tsx,
#     UI_TO_EXACT_DATE) lui passe des DATES ISO ("2026-09-10") ;
#   - src/routes/dashboard.ts filtrait `WHERE staff_id = ? AND day = ?` avec un
#     NOM DE JOUR ("thursday") tire de daysOfWeek[new Date().getDay()].
#   => le filtre ne rapportait JAMAIS rien : dailyLaborCost restait bloque a 0,
#   alors que la base du client contenait 6 vacations pour ce jour (attendu 911).
#
# Ce script ne juge pas le code, il juge le COMPORTEMENT : il demarre le serveur
# REEL (tsx server.ts) sur une COPIE de la base du client, poste une vacation par
# LA MEME route que l'UI, puis interroge le tableau de bord.
#   ROUGE (rc=1) : la vacation du jour n'est pas compte.  VERT (rc=0) : sinon.
#
# Les garde-fous qui empechent un PASS creux (chacun est justifie par une faute
# que la demarche a reellement rattrapee ici) :
#   - la vacation doit etre LISIBLE en base, sinon un 0 ne prouverait rien ;
#   - la ligne de base se lit AVANT toute injection : lue apres, elle inclurait
#     la vacation de la sonde et le delta attendu serait 0 (defaut de la v1) ;
#   - CONTRE-CONTROLE negatif (retirer la vacation rend la ligne de base) : sans
#     lui la route pourrait empiler un montant invente -- elle rend deja un
#     'monthlyTrend' codé "+5.2%" en dur, la preuve qu'un chiffre du corps de
#     reponse peut etre une fiction ;
#   - CONTRE-CONTROLE du JOUR VOISIN : une vacation du lenmain ne doit RIEN
#     ajouter. Sans lui, un filtre du jour debranche reste vert : c'est la
#     mutation F4 de scripts/mutation-test-labor.py, la plus mechante ;
#   - CONTRE-CONTROLE de la BRANCHE HERITEE (day = nom de jour, date NULL) : la
#     branche que le UNION ALL defend ; la retirer doit rougir (mutation F2) ;
#   - le montant est juge par DELTA calcule ici (8h x 30 = 240), jamais par
#     "non nul" : un montant faux mais positif rougit quand meme.
#
# Aucune ecriture sur la base du client : on travaille sur une copie.
#
# Mutation : COOKDRIVE_PROBE_REPO=<copie> fait demarrer le serveur sur un arbre
# isole ; COOKDRIVE_PROBE_PORT change le port pour que deux sondes coexistent.
import os
import sys
import json
import time
import shutil
import sqlite3
import threading
import urllib.request
import urllib.error
from datetime import date as _d, timedelta as _td

REPO = os.environ.get("COOKDRIVE_PROBE_REPO") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
sys.path.insert(0, os.path.join(REPO, "scripts"))
import _sondes_serveur as ss
NODE = shutil.which("node")
assert NODE and "python" not in NODE.lower(), "mauvais interpreteur: " + str(NODE)

REAL_DB = os.environ.get("COOKDRIVE_CLIENT_DB", os.path.join(REPO, "var", "agent_culinaire.db"))
DATA = os.path.expanduser("~/.cookdrive-labor-proof")
PORT = os.environ.get("COOKDRIVE_PROBE_PORT", "4487")
BASE_URL = "http://127.0.0.1:" + str(PORT)

DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
TODAY = _d.today()
TODAY_ISO = TODAY.isoformat()
TOMORROW_ISO = (TODAY + _td(days=1)).isoformat()
TODAY_NAME = DAYS[(TODAY.weekday() + 1) % 7]      # JS getDay(): 0 = dimanche

TARIF, DEBUT, FIN = 30, "09:00", "17:00"
HEURES_ATTENDUES = 8                                # 09:00 -> 17:00
COUT_ATTENDU = TARIF * HEURES_ATTENDUES             # 240.0

fails = []


def check(label, cond, detail=""):
    print(f"   {'PASS' if cond else 'FAIL'}  {label}" + (f"   [{detail}]" if detail else ""),
          flush=True)
    if not cond:
        fails.append(label)


def http(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE_URL + path, data=data, method=method,
                                  headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]
    except Exception as e:
        return -1, f"{type(e).__name__}: {e}"


def boot():
    import subprocess
    ss.bootstrap(int(PORT))
    ch = ss.Popen_sonde([NODE, "node_modules/.bin/tsx", "server.ts"],
                        env=dict(os.environ, COOKDRIVE_AUTH_OFF="1", PORT=str(PORT), USER_DATA_PATH=DATA),
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    stop = threading.Event()

    def hold():
        while not stop.is_set():
            time.sleep(0.5)
    threading.Thread(target=hold, daemon=True).start()
    for _ in range(200):
        try:
            with urllib.request.urlopen(BASE_URL + "/health", timeout=2) as r:
                json.loads(r.read())
                return ch, stop
        except Exception:
            time.sleep(0.4)
    ss.tuer_groupe(ch)
    raise SystemExit("serveur pas pret: /health ne repond pas")


def halt(ch, stop):
    stop.set()
    ss.tuer_groupe(ch)


def con():
    return sqlite3.connect(os.path.join(DATA, "agent_culinaire.db"))


def as_number(v):
    """Nombre VRAI, sinon None. Un bool n'est pas un nombre et NaN ne vaut pas:
    c'est exactement le symptome du bug des heures vides (''.split(':') -> NaN),
    que JSON serialise en null sans que le serveur ne bronche."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if v == v else None


def cout_du_jour():
    st, body = http("GET", "/api/dashboard/stats")
    if st != 200 or not isinstance(body, dict):
        raise SystemExit(f"/api/dashboard/stats n'a pas repondu 200 ({st} {body!r})")
    return st, as_number(body.get("dailyLaborCost")), body


print("### 0. copie de la base du CLIENT (WAL absorbe) ###", flush=True)
if not os.path.exists(REAL_DB):
    print("   ABSENT: pas de base client sur cette machine -> sonde sans terrain")
    sys.exit(3)
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)
# ⚠ Copier le seul .db est un PIEGE: la base du client tourne en WAL, son fichier
# principal ne pesait que 4 Ko (3 Mo dans l'-wal). Un shutil.copy du .db donne
# une base VIDE de tout ce qui n'est pas checkpointe -- exactement le « no such
# table: staff » rencontre a la premiere execution de cette sonde. sqlite3.backup
# absorbe le WAL dans un fichier unique et coherant.
_src = sqlite3.connect(REAL_DB)
_dst = sqlite3.connect(os.path.join(DATA, "agent_culinaire.db"))
_src.backup(_dst)
_src.close()
_dst.close()
c = con()
tot = c.execute("SELECT COUNT(*) FROM staff_schedule").fetchone()[0]
noms = c.execute("SELECT COUNT(*) FROM staff_schedule WHERE day IN "
                 "('monday','tuesday','wednesday','thursday','friday','saturday','sunday')"
                 ).fetchone()[0]
ex = c.execute("SELECT day, date FROM staff_schedule LIMIT 1").fetchone()
c.close()
print(f"   lignes={tot} | day=NOM_DE_JOUR={noms} | exemple (day,date)={ex}", flush=True)

ch, stop = boot()
try:
    st, member = http("POST", "/api/staff", {"name": "Probe Ouvrier", "role": "Chef",
                                              "hourlyRate": TARIF})
    ok_post = st == 200 and isinstance(member, dict) and member.get("id")
    check("POST /api/staff cree le membre", bool(ok_post), f"HTTP {st} {member!r}"[:110])
    if not ok_post:
        raise SystemExit("impossible de creer un membre: la sonde n'a plus de terrain")
    sid = member["id"]

    print("\n### 1. ligne de BASE, lue avant toute injection ###", flush=True)
    st, COUT_BASE, base_body = cout_du_jour()
    print(f"   reponse = {base_body}", flush=True)
    check("la ligne de base est un nombre fini", COUT_BASE is not None,
          f"obtenu={base_body.get('dailyLaborCost')!r}")
    if COUT_BASE is None:
        raise SystemExit("ligne de base inexploitable: la sonde n'a plus de reference")

    print(f"\n### 2. poste une vacation du {TODAY_ISO} via POST /api/staff ###", flush=True)
    st, _ = http("POST", "/api/staff", {"id": sid, "name": "Probe Ouvrier",
                                         "role": "Chef", "hourlyRate": TARIF,
                                         "schedule": {TODAY_ISO: [{"start": DEBUT,
                                                                   "end": FIN}]},
                                         "datesObj": {"k": TODAY_ISO}})
    check("le POST de planning (payload de l'UI) est accepte", st == 200, f"HTTP {st}")
    c = con()
    rows = c.execute("SELECT day, date, start_time, end_time FROM staff_schedule "
                     "WHERE staff_id = ?", (sid,)).fetchall()
    c.close()
    print(f"   en base pour ce membre: {rows}", flush=True)
    check("la vacation EST en base (sinon le 0 ne prouverait rien)", len(rows) == 1,
          f"{len(rows)} ligne(s)")

    st, panel = http("GET", f"/api/staff?start={TODAY_ISO}&end={TODAY_ISO}")
    mine = [s for s in panel if s.get("id") == sid] if isinstance(panel, list) else []
    seen = bool(mine and mine[0].get("schedule") and
                any(v for v in mine[0]["schedule"].values()))
    check("le panneau Planning (GET /api/staff) voit la vacation", seen,
          json.dumps(mine[0].get("schedule") if mine else None)[:120])

    print("\n### 3. /api/dashboard/stats doit avoir gagne la vacation du jour ###",
          flush=True)
    st, got, body = cout_du_jour()
    print(f"   reponse = {body}", flush=True)
    check(f"la vacation du jour est comptee: +{COUT_ATTENDU:.2f} "
          f"({TARIF}/h x {HEURES_ATTENDUES}h)",
          got is not None and abs(got - (COUT_BASE + COUT_ATTENDU)) < 1e-6,
          f"base={COUT_BASE!r} attendu={COUT_BASE + COUT_ATTENDU!r} obtenu={got!r}")
    if got is None:
        raise SystemExit("dailyLaborCost n'est pas un nombre: le calcul est casse")

    print("\n### 4. contre-controle negatif: retiree, retour a la ligne de base ###",
          flush=True)
    c = con()
    deleted = c.execute("DELETE FROM staff_schedule WHERE staff_id = ?", (sid,)).rowcount
    c.commit()
    c.close()
    check("les rangees de la sonde sont retirees de la copie", deleted >= 1,
          f"{deleted} range(s)")
    st, back, _ = cout_du_jour()
    check("sans la vacation du jour, le cout revient exactement a la ligne de base",
          back is not None and abs(back - COUT_BASE) < 1e-6,
          f"base={COUT_BASE!r} obtenu={back!r}")

    print("\n### 5. branche heritee: rangee day = nom de jour, date NULL ###", flush=True)
    c = con()
    c.execute("INSERT INTO staff_schedule (id, staff_id, day, date, start_time, end_time) "
              "VALUES ('probe-heritee', ?, ?, NULL, ?, ?)",
              (sid, TODAY_NAME, DEBUT, FIN))
    c.commit()
    c.close()
    st, her, _ = cout_du_jour()
    check("les bases heritees (day = nom de jour, date NULL) sont comptees",
          her is not None and abs(her - (COUT_BASE + COUT_ATTENDU)) < 1e-6,
          f"attendu={COUT_BASE + COUT_ATTENDU!r} obtenu={her!r}")
    if her is None:
        raise SystemExit("dailyLaborCost casse sur une rangee heritee")
    REF_HER = her

    print("\n### 6. une vacation du LENDEMAIN ne doit rien ajouter ###", flush=True)
    c = con()
    c.execute("INSERT INTO staff_schedule (id, staff_id, day, date, start_time, end_time) "
              "VALUES ('probe-demain', ?, ?, ?, ?, ?)",
              (sid, TOMORROW_ISO, TOMORROW_ISO, DEBUT, FIN))
    c.commit()
    c.close()
    st, voisin, _ = cout_du_jour()
    check("le jour voisin (lenmain) est EXCLU du cout du jour",
          voisin is not None and abs(voisin - REF_HER) < 1e-6,
          f"attendu={REF_HER!r} obtenu={voisin!r} (+240 = filtre du jour qui ne mord pas)")

    print("\n### 7. robustesse: un creneau a heures vides ('') ne doit pas donner NaN ###",
          flush=True)
    c = con()
    c.execute("INSERT INTO staff_schedule (id, staff_id, day, date, start_time, end_time) "
              "VALUES ('probe-vide', ?, ?, ?, '', '')", (sid, "x", TODAY_ISO))
    c.commit()
    c.close()
    st, vide, body_v = cout_du_jour()
    check("le serveur repond 200 avec un creneau vide", st == 200, f"HTTP {st}")
    check("le creneau vide est ignore: dailyLaborCost reste un nombre (pas null/NaN)",
          vide is not None, f"obtenu={body_v.get('dailyLaborCost')!r}")
    check("le creneau vide n'ajoute RIEN au cout",
          vide is not None and abs(vide - REF_HER) < 1e-6,
          f"attendu={REF_HER!r} obtenu={vide!r}")
finally:
    halt(ch, stop)
    shutil.rmtree(DATA, ignore_errors=True)

print("\n" + "=" * 74)
if fails:
    print(f"RESULTAT : ROUGE -- {len(fails)} check(s) en echec")
    for f in fails:
        print("   - " + f)
    sys.exit(1)
print("RESULTAT : VERT -- la vacation du jour est comptee, le jour voisin exclu,")
print("           les bases heritees comptees, et un creneau vide ne casse plus le")
print("           montant (ni ne fait tomber la route en 500).")
sys.exit(0)
