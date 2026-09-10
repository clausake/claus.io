# TESTS DE MUTATION de scripts/probe-labor-cost-zero.py.
#
# Le skill l'exige : « Un PASS qui ne peut pas devenir FAIL n'est pas une
# mesure. Apres chaque check ajoute, injecter la faute correspondante dans des
# COPIES isolees (node_modules symlinké) et exiger rc=1 + le check fautif nomme. »
#
# Ce harnais a deja rattrape TROIS de mes propres erreurs sur cette phase :
#   - un premier jet ou les fragments attendus ("branche heritee", "ligne de
#     base") ne correspondaient a AUCUN libelle reel de la sonde : les mutations
#     rougissaient pour une autre raison, ce qui aurait fait passer un check
#     creux pour un garde qui mord ;
#   - retirer une BRANCHE SQL casse l'ARITE des parametres : le serveur rend un
#     500, TOUS les checks rougissent, et ce n'est plus le garde vise qui parle
#     mais le plantage. Les fautes sont donc injectees par PREDICAT NEUTRE
#     (AND 1=0 / OR 1=1) qui preserve le compte de `?` ;
#   - une faute ciblait src/routes/dashboard.ts alors que l'index se cree dans
#     src/db/init.ts : la mutation n'aurait rien change et se declair quand meme
#     "MORD". Chaque faute nomme DONC SON FICHIER, et un patron qui ne matche pas
#     est un ECHEC bruyant (jamais un MORD silencieux).
#
# REGLES :
#   1. faute appliquee UNE A LA FOIS, dans une COPIE isolee du depot (node_modules
#      symlinké) : l'arbre de developpement n'est jamais touche ;
#   2. la copie NON MUTEE doit d'abord etre VERTE, sinon aucune mutation ne praut
#      quoi que ce soit ;
#   3. une mutation qui rougit TOUT (au-delà de MAX_ROUGIS) est INVALIDEE : un
#      plantage general n'est pas un garde qui mord ;
#   4. la derniere faute (index absent) doit laisser la sonde VERTE : elle prouve
#      que l'index est une optimisation et non la source de la justesse du montant.
#
# Usage : python3 scripts/mutation-test-labor.py
import os
import re
import sys
import shutil
import subprocess

SRC = os.path.expanduser("~/cookdrive-project")
ROOT = os.path.expanduser("~/.cookdrive-mut-labor")
PROBE = os.path.join(SRC, "scripts", "probe-labor-cost-zero.py")
ROUTE = "src/routes/dashboard.ts"
INIT = "src/db/init.ts"
MAX_ROUGIS = 4          # au-delà, la mutation a fait planter la route: non probant

MUTATIONS = [
    # (id, description, [(fichier, patron, remplacement)], fragment-du-check-attendu, rc)
    ("F1-heures-vides",
     "le garde des heures vides est retire",
     [(ROUTE, r"if \(!slot\.start_time \|\| !slot\.end_time\) return;", "// garde retire")],
     "creneau vide est ignore", 1),
    ("F2-branche-heritee-perdue",
     "la branche heritee est videe (les basesinstallees avant la colonne date sont perdues)",
     [(ROUTE, r"day = \? AND \(date IS NULL OR date = ''\)",
       "day = ? AND (date IS NULL OR date = '') AND 1=0")],
     "bases heritees", 1),
    ("F3-que-branche-heritee",
     "la branche date est videe (l'accident du 10/09: seul le nom de jour survit)",
     [(ROUTE, r"staff_id = \? AND date = \?",
       "staff_id = ? AND date = ? AND 1=0")],
     "vacation du jour est comptee", 1),
    ("F4-filtre-du-jour-debranche",
     "le filtre du jour est debranche des DEUX branches (toutes les dates comptees)",
     [(ROUTE, r"staff_id = \? AND date = \?", "staff_id = ? AND (date = ? OR 1=1)"),
      (ROUTE, r"day = \? AND \(date IS NULL OR date = ''\)",
       "(day = ? OR 1=1) AND (date IS NULL OR date = '')")],
     "jour voisin", 1),
    ("F5-index-absent",
     "les DEUX creations d'index sont rendues fautives (l'optimisation, pas la justesse)",
     [(INIT, r"CREATE INDEX IF NOT EXISTS ix_staff_schedule_staff_day ON "
             r"staff_schedule\(staff_id, day\)",
       "CREATE INDEX IF NOT EXISTS ix_fausse_a ON staff_schedule(nocolumn_x)"),
      (INIT, r"CREATE INDEX IF NOT EXISTS ix_staff_schedule_staff_date ON "
             r"staff_schedule\(staff_id, date\)",
       "CREATE INDEX IF NOT EXISTS ix_fausse_b ON staff_schedule(nocolumn_y)")],
     None, 0),
]

IGNORED = {"node_modules", ".git", "dist", "dist-server", "test-results",
           "__pycache__", ".playwright", "uploads", "backups"}


def prepare():
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(ROOT)
    for entry in os.listdir(SRC):
        if entry in IGNORED:
            continue
        s, d = os.path.join(SRC, entry), os.path.join(ROOT, entry)
        if os.path.isdir(s):
            shutil.copytree(s, d, ignore=shutil.ignore_patterns("*.db", "*.db-wal", "*.db-shm"))
        else:
            shutil.copy2(s, d)
    os.symlink(os.path.join(SRC, "node_modules"), os.path.join(ROOT, "node_modules"))


def run_probe():
    env = dict(os.environ, COOKDRIVE_PROBE_REPO=ROOT,
               COOKDRIVE_PROBE_PORT=os.environ.get("COOKDRIVE_PROBE_PORT", "4499"))
    try:
        p = subprocess.run([sys.executable, PROBE], cwd=SRC, env=env,
                          capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT : la sonde n'a pas rendu la main dans le temps imparti"
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def rougis_de(out):
    return [l.strip()[5:].strip() for l in out.splitlines() if l.strip().startswith("FAIL")]


def apply(mutations):
    """Chaque patron DOIT matcher une fois. Un non-match est une faute explicite:
    le routeur a change de forme et le harnais doit le dire, pas simuler un MORD."""
    originaux, touches = {}, {}
    for chemin, patron, remplacement in mutations:
        absu = os.path.join(ROOT, chemin)
        if absu not in touches:
            originaux[absu] = open(absu, encoding="utf-8").read()
            touches[absu] = originaux[absu]
        nouveau, n = re.subn(patron, remplacement, touches[absu], count=1)
        if n != 1:
            return None, (f"patron non trouve dans {chemin} (matches={n}): "
                          + patron[:70])
        if nouveau == touches[absu]:
            return None, f"remplacement identique dans {chemin}: mutation sans effet"
        touches[absu] = nouveau
    for absu, txt in touches.items():
        open(absu, "w", encoding="utf-8").write(txt)
    return originaux, None


print("=" * 78)
print("PREPARATION de la copie isolee :", ROOT)
print("=" * 78)
prepare()

rc, out = run_probe()
print(f"\n[0] copie intacte -> rc={rc} (attendu 0)")
if rc != 0:
    print(out[-3000:])
    raise SystemExit("la copie intacte n'est pas verte: les tests de mutation "
                     "n'ont AUCUNE valeur")

echecs = []
for mid, desc, mutations, attendu, rc_attendu in MUTATIONS:
    originaux, err = apply(mutations)
    if err:
        for a, t in (originaux or {}).items():
            open(a, "w", encoding="utf-8").write(t)
        print(f"\n[{mid}] {desc}\n   ECHEC : {err}")
        echecs.append(f"{mid} ({err})")
        continue
    try:
        rc, out = run_probe()
    finally:
        for a, t in originaux.items():
            open(a, "w", encoding="utf-8").write(t)

    rougis = rougis_de(out)
    if rc == rc_attendu == 0:
        ok, verdict = True, "PAS DE REGRESSION DE JUSTESSE (l'index est bien une optimisation)"
    elif rc not in (0, 1):
        ok, verdict = False, f"INVALIDEE: rc={rc} (plantage/timeout), pas un verdict de check"
    elif rc != 1:
        ok, verdict = False, ("INATTENDU: la sonde reste VERTE alors qu'elle devait "
                              "rougir -> CHECK CREUX")
    elif attendu is None:
        ok, verdict = False, (f"INATTENDU: sans index la sonde rougit {rougis[:2]} "
                              f"-> la justesse dependait de l'index")
    elif not any(attendu in r for r in rougis):
        ok, verdict = False, f"rouge mais le check vise '{attendu}' n'est pas nomme"
    elif len(rougis) > MAX_ROUGIS:
        ok, verdict = False, (f"rouge PARTOUT ({len(rougis)} checks > {MAX_ROUGIS}): "
                              f"la mutation a fait planter la route, elle ne prouve "
                              f"pas le garde vise")
    else:
        ok, verdict = True, f"MORD le check vise [{attendu}] ({len(rougis)} rougi(s))"
    print(f"\n[{mid}] {desc}")
    print(f"   rc={rc} (attendu {rc_attendu}) -> {verdict}")
    if not ok:
        echecs.append(f"{mid} ({verdict})")
        for r in rougis[:8]:
            print("     * " + r[:140])
        if not rougis:
            print(out[-1500:])

print("\n" + "=" * 78)
if echecs:
    print("RESULTAT : des mutations ne mordent pas comme attendu :")
    for e in echecs:
        print("   - " + e)
    sys.exit(1)
print("RESULTAT : les 5 mutations mordent comme attendu. Chaque check de la sonde")
print("           est donc capable de rougir : aucun n'est une fiction. La derniere")
print("           (index absent) laisse la justesse intacte: l'index est un levier")
print("           de perf, pas la source du montant.")
sys.exit(0)
