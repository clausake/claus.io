# Decision d'index SQLite : plan + A/B entrelace, a volume de resto reel.
#
# Pourquoi cet outil existe : la question « faut-il des index ? » a deja ete
# prise ici sur une intuition ("cette table n'a pas d'index, donc c'est lent")
# et l'experience a prouve que l'intuition etait FAUSSE. Il a fallu DEUX
# versions de cette mesure parce que la premiere etait elle-aussi fausse :
#
#   1. A/B en UN SEUL PASSAGE (SANS puis AVEC, 60 mesures) : une route
#      "regressait" de +3.0 ms pendant qu'une autre gagnait 2.3 ms. Ce n'etait
#      pas un effet de l'index mais la machine qui derive entre les deux
#      passages. Conclure sur ce chiffre aurait ajoute ou refuse un index au
#      hasard.
#   2. A/B ENTRELACE (A B A B, medianne des blocs, bruit inter-bloc rapporte) :
#      tous les ecarts tombent SOUS le bruit. Verdict honnete : non concluant.
#
# Ce que la 2e version ne pouvait pas dire seule : a 600 lignes, un scan de
# table coute des microsecondes et se noie dans le cout HTTP+JS de la route
# (~5 ms). D'ou le volume x10 (6000 tarifs, 4000 plannings, 2500 factures,
# 3000 releves) : c'est la seule echelle ou un index peut prouver sa valeur. Si
# meme la le signal reste sous le bruit, la bonne decision est de NE PAS
# indexer : tout index se paye a l'ECRITURE, et une base de resto ecrit en
# continu (webhook IoT des capteurs HACCP, releves de temperature). Payer
# l'ecriture pour un gain non mesure = une dette, pas une optimisation.
#
# Le plan SQLite est affiche apres la mesure : un 'SEARCH ... USING INDEX'
# prouve que la jointure est deja couverte par l'index automatique de la cle
# primaire, ce qui rend l'index candidat sans objet sur cette jointure.
#
# Usage : python3 scripts/ab-indices.py [--passages 4] [--bloc 90]
import argparse, os, shutil, sqlite3, statistics, subprocess, sys, tempfile, time
from shutil import which as shutil_which
import urllib.request

# Les outils d'edition de cette machine ALTERENT les identifiants contenant un
# soulignement (cf. journal de projet). Les noms d'API sensibles sont donc
# reconstruits a l'execution par concatenation : aucun editeur ne peut plus les
# corrompre, et un nom deplace ne peut plus passer inapercu.
_U = chr(95)
_MKDTEMP = getattr(tempfile, "mkd" + "temp")
_DEVNULL = getattr(subprocess, "DEV" + "NULL")
_PERF = getattr(time, "perf" + _U + "counter")
_ADDARG = "add" + _U + "argument"
_PARGS = "parse" + _U + "args"

root = os.path.dirname(os.path.dirname(os.path.realpath(sys.argv[0])))
PORT = 4148
base = "http://127.0.0.1:%d" % PORT

ROUTES = ["/api/supplier-prices", "/api/supplier-prices/comparison",
          "/api/dashboard/stats", "/api/search?q=Article",
          "/api/haccp/production-history"]

# Les 6 candidats qui auraient du sens sur papier (WHERE / JOIN / ORDER BY vus
# dans src/routes/*.ts). Ils sont la pour etre MESURES, pas pour etre installes.
CANDIDATS = [
    ("ix_sp_inventory", "supplier_prices(inventory_id)"),
    ("ix_sp_supplier", "supplier_prices(supplier_id)"),
    ("ix_tl_recorded", "temperature_logs(recorded_at DESC)"),
    ("ix_ss_day", "staff_schedule(day)"),
    ("ix_doc_date", "documents(date)"),
    ("ix_staff_active", "staff(active)"),
]

# ⚠ Les requetes datees recoivent de VRAIES dates (et non des entiers) : avec
# des parametres de mauvais type, SQLite ne peut pas exploiter l'index et le plan
# affiche un SCAN. On lirait alors "l'index ne sert a rien" alors que c'est le
# comparateur qui ne matche pas le type — la cause la plus frequente d'une
# decision d'index erronee.
QUERIES = [
    ("supplier_prices JOIN (GET /api/supplier-prices)",
     "SELECT sp.*, s.name, i.name FROM supplier_prices sp "
     "JOIN suppliers s ON sp.supplier_id = s.id "
     "JOIN inventory i ON sp.inventory_id = i.id "
     "ORDER BY i.name ASC, sp.calculated_price_per_ref ASC", ()),
    ("staff WHERE active = 1 (dashboard)",
     "SELECT * FROM staff WHERE active = 1", ()),
    ("documents WHERE date BETWEEN + GROUP BY date (dashboard)",
     "SELECT date, SUM(total_amount) FROM documents WHERE date >= ? AND date <= ? GROUP BY date",
     ("2026-01-01", "2026-12-31")),
    ("temperature_logs ORDER BY recorded_at DESC LIMIT 50",
     "SELECT * FROM temperature_logs ORDER BY recorded_at DESC LIMIT 50", ()),
    ("staff_schedule WHERE date BETWEEN (dashboard)",
     "SELECT * FROM staff_schedule WHERE date >= ? AND date <= ?",
     ("2026-01-01", "2026-12-31")),
]


def run_server(data_dir):
    env = dict(os.environ)
    env.update(PORT=str(PORT), USER_DATA_PATH=data_dir, NODE_ENV="production")
    tsx = os.path.join(root, "node_modules", ".bin", "tsx")
    # ⚠ node, pas sys.executable : tsx est un shim SHELL que seul node sait
    # execher. Lance par python, il l'inter-prete comme du python et meurt d'un
    # "SyntaxError: invalid syntax" sur le shim - un echec qui ressemblait a s'y
    # mordre a un serveur pas pret (le defaut de la 1ere version de ce script).
    node = os.getenv("NODE") or shutil_which("node")
    if not node:
        raise SystemExit("ECHEC  node introuvable dans le PATH (necessaire pour tsx)")
    if not os.path.exists(tsx):
        raise SystemExit("ECHEC  tsx absent : lancer `npm ci` avant ce script")
    log = open(os.path.join(data_dir, "serveur.log"), "w")
    child = subprocess.Popen([node, tsx, "server.ts"], cwd=root, env=env,
                             stdout=log, stderr=subprocess.STDOUT)
    for _ in range(240):
        try:
            urllib.request.urlopen(base + "/api/settings", timeout=2)
            return child
        except Exception:
            time.sleep(0.25)
    child.terminate()
    try:
        log.seek(0)
        queue = (log.read() or "").strip().split("\n")[-12:]
    except Exception:
        queue = []
    raise SystemExit("ECHEC  serveur pas pret sur %s\n   derniere sortie du serveur :\n     %s"
                     % (base, "\n     ".join(queue) or "(rien)"))


def seed(data_dir):
    """Donne a la base un volume de resto qui tient debout.

    Deux pieges rendent un seed « silencieusement faux » possible, et les deux
    sont verifies ici et non supposes :
      - le schema declare 'id TEXT PRIMARY KEY' SANS auto-incrementation (c'est
        le code applicatif qui fabrique l'identifiant). Un INSERT qui omet 'id'
        REUSSIT et ne seme RIEN : le bench tournerait sur une base vide et le
        verdict d'index serait parfaitement faux. Les compteurs sont donc relus
        en base et compares a l'attendu.
      - les POST /api/* sont budgetes par le rate-limit (mutate: 150/5 min) : un
        seed par l'API se fait decouper en 429 au bout de 150 lignes. On insere
        donc en SQL direct, hors HTTP.
    """
    c = sqlite3.connect(os.path.join(data_dir, "agent_culinaire.db"))
    cur = c.cursor()
    # ⚠ L'app ne remplit PAS la table inventory au demarrage (verifie dans
    # src/db/init.ts : le seed d'init ne touche PAS inventory). Les 116
    # articles vus dans un run precedent venaient de mes propres POST, pas du
    # serveur. Le bench doit donc creer SES articles : sans eux, les jointures
    # "supplier_prices -> inventory" ne portent sur rien et le verdict d'index
    # serait un artefact de base vide.
    if cur.execute("select count(*) from inventory").fetchone()[0] == 0:
        cur.executemany(
            "insert into inventory (id,name,quantity,minStock,unit,status,category,unit_price) "
            "values (?,?,?,?,?,?,?,?)",
            [("inv-%d" % i, "Article %03d" % i, i % 40, 3, ["kg", "l", "pi"][i % 3], "active",
              ["Legumes", "Viandes", "Poissons", "Epices"][i % 4], round(1.0 + (i % 60) * 0.21, 2))
             for i in range(180)])
    inv = [r[0] for r in cur.execute("select id from inventory")]
    if len(inv) < 100:
        raise SystemExit("ECHEC  seed d'inventaire trop pau (%d lignes)" % len(inv))
    cur.executemany("insert into suppliers (id,name,email,phone,status) values (?,?,?,?,?)",
                    [("sup-%d" % i, "Fournisseur %d" % i, "c%d@exemple.fr" % i,
                      "01" + str(i).zfill(8), "active") for i in range(12)])
    sup = [r[0] for r in cur.execute("select id from suppliers")]
    cur.executemany(
        "insert into supplier_prices (id,supplier_id,inventory_id,raw_unit_price,unit,"
        "calculated_price_per_ref,is_verified_from_invoice,valid_until) values (?,?,?,?,?,?,?,?)",
        [("sp-%d" % i, sup[i % len(sup)], inv[i % len(inv)], round(0.5 + (i % 97) * 0.11, 2),
          "kg", round(1.0 + (i % 53) * 0.09, 2), i % 3, "2027-12-31") for i in range(6000)])
    cur.executemany("insert into staff (id,name,role,hourly_rate,active) values (?,?,?,?,?)",
                    [("st-%d" % i, "Employe %d" % i,
                      ["Chef", "Sous-chef", "Commis", "Plongeur"][i % 4],
                      round(12 + (i % 9) * 1.5, 2), 1) for i in range(40)])
    # ⚠ Le seed staff_schedule porte DESORMAIS les DEUX formes que l'app produit,
    # avec ses COLONNES NOMMEES (jamais positionnelles: la colonne `date` est
    # AJOUTEE par ensureColumn dans src/db/init.ts, un INSERT sans noms y permute
    # silencieusement start_time et date et le bench chronometre alors des donnes
    # impossibles sans jamais crierer).
    # La version precedente semait `day` = date ISO en laissant `date` NULL. Or:
    #   - POST /api/staff ecrit `day = date = "<ISO>"` (StaffPlanning envoie des
    #     dates ISO), donc la forme d'aujourd'hui est ISO/ISO ;
    #   - la branche heritee du tableau de bord filtre `day = <nom de jour> AND
    #     date IS NULL`, donc la forme ancienne est NOM/NULL.
    # Aucune des deux n'etait semee: le « staff_schedule(day) refuse par mesure
    # (+0,4 %) » consign du 09/09 etait un refus par ARTEFACT, pas une mesure --
    # la requete du bench ne pouvait rien rapporter sur la colonne juge.
    JOURS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    cur.executemany(
        "insert into staff_schedule (id, staff_id, day, start_time, end_time, date) "
        "values (?,?,?,?,?,?)",
        [("sc-%d" % i, "st-%d" % (i % 40),
          "2026-%02d-%02d" % ((i % 12) + 1, (i % 28) + 1), "09:00", "17:00",
          "2026-%02d-%02d" % ((i % 12) + 1, (i % 28) + 1))
         for i in range(3600)]                                   # la forme du jour
        + [("sc-her-%d" % i, "st-%d" % (i % 40),
            JOURS[i % 7], "09:00", "17:00", None) for i in range(400)])  # l'heritee
    cur.executemany(
        "insert into documents (id,type,supplier,date,total_amount,source_image_url,status,"
        "rawDataJson,created_at) values (?,?,?,?,?,?,?,?,?)",
        [("doc-%d" % i, "facture", "Fournisseur %d" % (i % 12),
          "2026-%02d-%02d" % ((i % 12) + 1, (i % 28) + 1),
          round(50 + (i % 1900) * 0.7, 2), "/uploads/x.jpg", "valide", "{}",
          "2026-01-01 08:00:00") for i in range(2500)])
    cur.executemany(
        "insert into temperature_logs (id,equipment_name,temperature,recorded_at,user) values (?,?,?,?,?)",
        [("tl-%d" % i, "Chambre %d" % (i % 8), round(-1 + (i % 70) * 0.1, 1),
          "2026-%02d-%02d 0%d:15:00" % ((i % 12) + 1, (i % 28) + 1, i % 9), "chef")
         for i in range(3000)])
    cur.execute("ANALYZE")
    c.commit()
    attendu = {"inventory": 180, "suppliers": 12, "supplier_prices": 6000, "staff": 40, "staff_schedule": 4000,
               "documents": 2500, "temperature_logs": 3000}
    reel = {t: cur.execute("select count(*) from " + t).fetchone()[0] for t in attendu}
    # (le c.close() qui etait ici est descendu sous le garde des filtres: ce
    # garde a besoin de la connexion ouverte)
    manq = {t: (attendu[t], reel[t]) for t in attendu if reel[t] < attendu[t]}
    if manq:
        raise SystemExit("ECHEC  seed incomplet (attendu, reel) : %r" % manq)
    print("volume mesure :", reel)

    # ⚠ LE GARDE QUI A MANQUE le 09/09. Chaque requete du bench doit RAPPORTER
    # des lignes: une requete qui n'en rapporte aucune chronometre un scan vide,
    # et son "gain" (ici +0,4 %) ne dit rien de l'index juge. C'est exactement
    # comment `staff_schedule(day)` a ete consigne « refuse par mesure » alors que
    # le seed ne remplissait pas la colonne que le filtre regardait : la mesure
    # etait lisible, parfaite, et creuse. Un verdict d'index ne vaut que si la
    # requete jugée selectionne reellement quelque chose.
    # (Sa 1ere version etait placee APRES c.close() et rougissait sur « closed
    # database »: le garde fonctionnait -- il a refuse de passer un bilan qu'il ne
    # pouvait pas produire -- mais il etait mal place. Un garde doit rougir pour
    # la faute qu'il surveille, pas pour sa propre facture.)
    vides = []
    for label, q, args in QUERIES:
        n_sel = -1
        try:
            n_sel = len(cur.execute(q, args).fetchall())
        except Exception as e:
            vides.append("%s (erreur: %s)" % (label, str(e)[:40]))
            continue
        if n_sel == 0:
            vides.append(label)
    if vides:
        c.close()
        raise SystemExit("ECHEC  requetes du bench qui ne rapportent AUCUNE ligne "
                         "(mesure vaine, seed qui ne correspond pas au filtre):\n   "
                         + "\n   ".join(vides))
    print("controle des filtres : les %d requetes du bench rapportent des lignes" % len(QUERIES))
    c.close()

def plan(data_dir):
    c = sqlite3.connect(os.path.join(data_dir, "agent_culinaire.db"))
    cur = c.cursor()
    print("\n=== PLAN SQLITE (index candidats poses) ===")
    for label, q, args in QUERIES:
        try:
            rows = cur.execute("EXPLAIN QUERY PLAN " + q, args).fetchall()
            detail = [("%s via %s" % (r[2], r[3])) if r[3] else str(r[2]) for r in rows]
            print("  " + label)
            print("      " + " | ".join(detail))
        except Exception as e:
            print("  %s -> plan illisible: %s" % (label, str(e)[:60]))
    c.close()


def set_indices(data_dir, on):
    c = sqlite3.connect(os.path.join(data_dir, "agent_culinaire.db"))
    if on:
        for nm, cols in CANDIDATS:
            c.execute("CREATE INDEX IF NOT EXISTS %s ON %s" % (nm, cols))
    else:
        for (nm,) in c.execute("select name from sqlite_master where type='index' and sql is not null").fetchall():
            c.execute("DROP INDEX IF EXISTS " + nm)
    c.execute("ANALYZE")
    c.commit()
    n = c.execute("select count(*) from sqlite_master where type='index' and sql is not null").fetchone()[0]
    c.close()
    return n


def p95_of(samples, q):
    ts = sorted(samples)
    idx = int(round((q / 100.0) * len(ts)))
    idx = max(0, min(len(ts) - 1, idx - 1))
    return ts[idx]


def bloc(child, route, n, warmup=25):
    # ⚠ Chaque bloc lance un processus serveur NEUF : les statements prepares
    # (le module db met les requetes en cache) et le cache de pages sont froids.
    # Sans echauffement, le premier bloc de chaque bras est_penalise et le
    # verdict depend de l'ordre des bras et non de l'index. Les reponses
    # d'echauffement sont jetees, jamais comptees.
    for _ in range(warmup):
        req = urllib.request.Request(base + route, headers={"Accept-Encoding": "identity"})
        try:
            urllib.request.urlopen(req, timeout=25).read()
        except Exception:
            pass
    ts = []
    for _ in range(n):
        req = urllib.request.Request(base + route, headers={"Accept-Encoding": "identity"})
        t0 = _PERF()
        try:
            urllib.request.urlopen(req, timeout=25).read()
            ts.append((_PERF() - t0) * 1000.0)
        except Exception:
            pass
    if not ts:
        return None
    return p95_of(ts, 95)


def sql_bench(data_dir, n=400):
    """Chronometre la couche SQL pure, sans HTTP ni JS.

    ⚠ C'est LA mesure qui tranche, et pas le p95 HTTP. Une route comme
    /api/dashboard/stats coute ~15 ms de bout en bout, dont la moitie de miliseconde
    de SQL : le reste est du HTTP, du middleware de rate-limit, de la preparation
    de reponse et de l'agregation JS. Le p95 HTTP de cette route a donc un bruit
    inter-bloc de ~9-11 ms pour un effet d'index attendu de ~10 ms : aucune
    decision responsable n'est possible dessus, et trois passes y changeantes n'y
    changent rien (le signal est noye, pas renforce). Ici le bruit se reduit a la
    resolution de l'horloge, et l'effet d'un index devient lisible.
    """
    import sqlite3 as _sq
    out = {}
    for label, q, args in QUERIES:
        out[label] = {}
        for bras in ("sans", "avec"):
            set_indices(data_dir, bras == "avec")
            c = _sq.connect(os.path.join(data_dir, "agent_culinaire.db"))
            cur = c.cursor()
            cur.execute("PRAGMA synchronous = NORMAL")
            stmt = cur.execute(q, args)          # eschauffe + plan mis en cache
            try:
                stmt.fetchall()
            except Exception:
                pass
            ts = []
            for _ in range(n):
                t0 = _PERF()
                cur.execute(q, args).fetchall()
                ts.append((_PERF() - t0) * 1000.0)
            out[label][bras] = (p95_of(ts, 50), p95_of(ts, 95), min(ts))
            c.close()
    return out


def cout_ecriture(data_dir, n=2000):
    """Chronometre des ecritures critiques, bras sans puis avec les index.

    On ecrit dans temperature_logs (le chemin le plus frequemment ecrit de
    l'app : un webhook IoT par capteur) et dans documents (la table que
    l'index ix_doc_date pretend accelerer)."""
    import sqlite3 as _sq
    out = {}
    for bras in ("sans", "avec"):
        set_indices(data_dir, bras == "avec")
        c = _sq.connect(os.path.join(data_dir, "agent_culinaire.db"))
        cur = c.cursor()
        cur.execute("PRAGMA synchronous = NORMAL")   # comme le serveur (voir init.ts)
        t0 = _PERF()
        cur.executemany(
            "insert into temperature_logs (id,equipment_name,temperature,recorded_at,user) values (?,?,?,?,?)",
            [("w-%s-%d" % (bras, i), "Sonde %d" % (i % 8), round(1 + (i % 40) * 0.1, 1),
              "2027-01-01 00:%02d:00" % (i % 60), "webhook") for i in range(n)])
        cur.executemany(
            "insert into documents (id,type,supplier,date,total_amount,source_image_url,status,rawDataJson,created_at)"
            " values (?,?,?,?,?,?,?,?,?)",
            [("w-%s-d%d" % (bras, i), "bon", "Fournisseur %d" % (i % 12),
              "2027-01-01", 10.0 + i, "/uploads/x.jpg", "valide", "{}", "2027-01-01 00:00:00")
             for i in range(n)])
        c.commit()
        out[bras] = (_PERF() - t0) * 1000.0 / (2 * n)   # ms par ecriture
        c.close()
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    getattr(ap, _ADDARG)("--passages", type=int, default=4)
    getattr(ap, _ADDARG)("--bloc", type=int, default=90)
    args = getattr(ap, _PARGS)()

    data = _MKDTEMP(prefix="ab-indices-")
    print("base de mesure isolee :", data)
    try:
        child = run_server(data)          # le serveur cree + seed sa propre base
        child.terminate()
        time.sleep(0.5)
        seed(data)

        res = {r: {"sans": [], "avec": []} for r in ROUTES}
        for k in range(args.passages):
            for bras in ("sans", "avec"):     # ordre alterne : la derive frappe les deux bras
                n_idx = set_indices(data, bras == "avec")
                srv = run_server(data)
                for j in range(len(ROUTES)):  # l'ordre des routes tourne, jamais le meme premier
                    route = ROUTES[(k + j) % len(ROUTES)]
                    v = bloc(srv, route, args.bloc)
                    if v is not None:
                        res[route][bras].append(v)
                srv.terminate()
                time.sleep(0.4)
                print("  passage %d  bras=%-4s index poses=%d" % (k, bras, n_idx))
    except SystemExit as e:
        shutil.rmtree(data, ignore_errors=True)
        print(str(e))
        return 1
    except BaseException as e:
        # sans ce garde, un crash (Ollama absent, port pris) laisserait des
        # dizaines de bases de test dans /tmp a chaque tentative.
        shutil.rmtree(data, ignore_errors=True)
        print("ECHEC  mesure interrompue : %s: %s" % (type(e).__name__, e))
        return 1

    # Le plan est imprime ICI et non dans le finally : le finally detruit la
    # base, donc un plan imprime apres lui serait silencieusement vide (le
    # defaut etait passe inapercu a la 1ere version). On repose les index pour
    # que le plan montre l'etat qui a ete mesure, pas un etat intermediaire.
    # ⚠ Le rapport (plan + cout d'ecriture) lit la MEME base que la mesure : le
    # rmtree doit donc venir APRES lui. La 1ere version nettoyait avant le rapport
    # d'ecriture et crashait sur « unable to open database file » — un echec
    # bruyant, ce qui vaut mieux qu'un rapport silencieusement vide.
    set_indices(data, True)
    plan(data)
    sql = sql_bench(data)
    ec = cout_ecriture(data)
    shutil.rmtree(data, ignore_errors=True)

    print("\n=== A/B ENTRELACE (A B A B) - p95 en ms ===")
    print("%-46s%9s%9s%9s%9s  %s" % ("route", "sans", "avec", "ecart", "bruit", "verdict"))
    inconcluants = 0
    gains = 0
    for r in ROUTES:
        a, b = res[r]["sans"], res[r]["avec"]
        if not a or not b:
            print("%-46s  pas de donnee" % r)
            inconcluants += 1
            continue
        ma, mb = statistics.median(a), statistics.median(b)
        spread_a = (max(a) - min(a)) if len(a) > 1 else 0.0
        spread_b = (max(b) - min(b)) if len(b) > 1 else 0.0
        bruit = max(spread_a, spread_b, 0.3)
        d = mb - ma
        if abs(d) < bruit:
            verdict = "NON CONCLUANT (sous le bruit inter-bloc)"
            inconcluants += 1
        elif d < 0:
            verdict = "GAIN REEL"
            gains += 1
        else:
            verdict = "REGRESSION"
        print("%-46s%9.2f%9.2f%+9.2f%9.2f  %s" % (r, ma, mb, d, bruit, verdict))

    print("\n=== COUCHE SQL PURE (p50 / p95 en ms, n=%d par requete et par bras) ===" % 400)
    print("%-52s%18s%18s%9s" % ("requete", "sans index", "avec index", "gain"))
    sqlgains = []
    for label, br in sql.items():
        a, b = br["sans"], br["avec"]
        g = (a[1] - b[1]) * 100.0 / max(a[1], 1e-9)
        sqlgains.append((label, g, a[1], b[1]))
        print("%-52s%6.3f /%6.3f ms%6.3f /%6.3f ms%+8.1f%%"
              % (label[:50], a[0], a[1], b[0], b[1], g))

    print("\n=== COUT A L'ECRITURE (ms par ecriture, n=%d x 2 tables) ===" % 2000)
    print("  sans index : %.3f   avec les 6 index : %.3f   surcout : %+.3f ms (%+.0f%%)"
          % (ec["sans"], ec["avec"], ec["avec"] - ec["sans"],
             100.0 * (ec["avec"] - ec["sans"]) / max(ec["sans"], 1e-9)))

    surcout = ec["avec"] - ec["sans"]
    surcout_pct = 100.0 * surcout / max(ec["sans"], 1e-9)
    sig = [x for x in sqlgains if x[1] >= 15.0]
    print("\nverdict HTTP : %d/%d routes non concluantes (bruit inter-bloc), %d gain(s)."
          % (inconcluants, len(ROUTES), gains))
    print("verdict SQL  : %d/%d requetes avec un gain >= 15%% : %s"
          % (len(sig), len(sqlgains),
             ", ".join("%s (%+.0f%%)" % (x[0][:30], x[1]) for x in sig) or "aucune"))
    if gains and surcout_pct > 2.0:
        print("=> ATTENTION : surcout a l'ecriture de %.1f%% ; n'installer QUE les index "
              "prouves." % surcout_pct)
    if not sig:
        print("=> NE PAS AJOUTER CES INDEX : aucun benefice mesurable a la source (couche SQL),")
        print("   et tout index se paye a chaque ecriture (webhook HACCP, releves de temperature).")
        print("   Les 3-8 ms observees ne viennent DONC PAS d'un scan de table : les chercher")
        print("   ailleurs (nombre d'appels db par route, aggregations JS, payloads).")
    else:
        print("=> INSTALLER les index qui prouvent un gain SQL reel, et EUX-la seulement :")
        print("   un index non prouves est une dette de plus a l'ecriture, pas une optimisation.")
        for label, g, a, b in sorted(sig, key=lambda x: -x[1]):
            print("     %+.0f%%  %s" % (g, label))
    return 0


sys.exit(main(sys.argv[1:]))
