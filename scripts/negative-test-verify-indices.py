# Test NEGATIF du garde « les requetes du bench doivent rapporter des lignes »
# ajoute dans scripts/ab-indices.py.
#
# Le skill l'impose : « Un garde qui ne mord pas est une decoration. Le prouver
# par test negatif ». Le garde a ete ecrit pour empecher la recurrence du verdict
# errone du 09/09 (`staff_schedule(day)` consigne « refuse par mesure +0,4 % »
# alors que le seed ne remplissait pas la colonne que le filtre regardait).
#
# Deux verifications, sur des COPIES isolees du depot (node_modules symlinké,
# l'arbre de developpement n'est jamais touche) :
#   N1  la copie intacte doit PASSER le garde (rc=0) et annoncer ses filtres
#       controles -- sans quoi le garde serait un blocage permanent ;
#   N2  rendre le seed INVISIBLE au filtre juge (toutes les `date` deplacées en
#       2030, hors de la fenetre 2026 du bench) doit rougir rc=1 EN NOMMANT la
#       requete qui ne rapporte plus rien. Le compte de rangees reste a 4 000 :
#       c'est ce qui distingue ce test de l'anti-test « seed vide », que le garde
#       « seed incomplet » traiterait deja — on veut que le NOUVEAU garde parle.
#
# ⚠ Deux formes de fausse preuve, toutes deux rattrapees ici et donc gardees :
#   1. une MUTATION QUI CASSE la syntaxe ne prouve rien : a la premiere execution
#      de ce fichier, le retrait du bloc de seed laissait un `(` orphelin, le
#      harnais mourrait d'un SyntaxError et le test concluyait a tort « garde
#      DECORATIF ». Toute mutation est donc passe au `compile()` AVANT d'etre
#      lancee, et un mutant qui ne compile pas est un ECHEC du test negatif, pas
#      un verdict sur le garde ;
#   2. un garde qui rougit sur sa PROPRE facture (Traceback, connexion fermee) ne
#      prouve pas la faute surveillee : on exige le message « ne rapportent
#      AUCUNE ligne » ET le nom d'une requete, et l'absence de Traceback.
import os
import sys
import shutil
import subprocess

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.expanduser("~/.cookdrive-mut-abindices")
SCRIPT = "scripts/ab-indices.py"

# La portion de seed qui alimente la colonne `date` de staff_schedule, dans la
# forme EXACTE du fichier (le second tuple ISO, celui qui ferme le tuple).
CIBLE = '          "2026-%02d-%02d" % ((i % 12) + 1, (i % 28) + 1))\n'
REMPLACEMENT = '          "2030-01-01")\n'   # hors de la fenetre 2026 du bench

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


def run_harnais():
    """Le harnais demarre le serveur reel (tsx) pour creer la base: c'est long."""
    try:
        p = subprocess.run([sys.executable, os.path.join(ROOT, SCRIPT)],
                           cwd=ROOT, env=dict(os.environ), capture_output=True,
                           text=True, timeout=1200)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT: le harnais n'a pas rendu la main"
    return p.returncode, (p.stdout or "") + (p.stderr or "")


print("=" * 78)
print("PREPARATION de la copie isolee :", ROOT)
print("=" * 78)
prepare()

echecs = []

# --- N1: la copie intacte doit passer le garde -----------------------------
rc, out = run_harnais()
controle = [l for l in out.splitlines() if "controle des filtres" in l]
print(f"\n[N1] copie intacte -> rc={rc}")
if not controle:
    echecs.append("N1: le garde ne s'est pas manifeste (aucune ligne 'controle des filtres')")
    print("   ABSENT -- le garde n'a pas tourne")
    print(out[-1200:])
elif rc != 0:
    echecs.append(f"N1: rc={rc} au lieu de 0 sur une copie intacte")
    print("   " + controle[0].strip())
    print(out[-1200:])
else:
    print("   " + controle[0].strip())

# --- N2: le seed rendu invisible au filtre doit rougir EN NOMMANT ----------
absu = os.path.join(ROOT, SCRIPT)
original = open(absu, encoding="utf-8").read()
n_cible = original.count(CIBLE)
if n_cible != 1:
    echecs.append(f"N2: la cible de la mutation apparait {n_cible} fois (attendu 1) "
                  f"-- le harnais a change de forme, ce test doit etre aligne")
    print(f"\n[N2] ECHEC: cible rencontree {n_cible} fois, mutation refusee")
else:
    mutant = original.replace(CIBLE, REMPLACEMENT, 1)
    # La mutation doit COMPLIER avant d'etre jugee: un mutant cassé ne dit rien
    # du garde (c'est ce qui a fait conclure faux a la premiere execution).
    try:
        compile(mutant, absu, "exec")
    except SyntaxError as e:
        echecs.append(f"N2: la MUTATION est invalide (SyntaxError ligne {e.lineno}) "
                      f"-> aucun verdict possible sur le garde")
        print(f"\n[N2] ECHEC: mutant non compilable ({e})")
    else:
        open(absu, "w", encoding="utf-8").write(mutant)
        try:
            rc2, out2 = run_harnais()
        finally:
            open(absu, "w", encoding="utf-8").write(original)
        plante = "Traceback (most recent call last)" in out2
        a_roug = rc2 != 0 and "ne rapportent AUCUNE ligne" in out2
        nomme = [l for l in out2.splitlines() if "staff_schedule" in l]
        print(f"\n[N2] seed rendu invisible au filtre (date -> 2030) -> rc={rc2}")
        if plante:
            echecs.append("N2: le garde rougit sur un Traceback et non sur la faute surveillee")
            print(out2[-1500:])
        elif not a_roug:
            echecs.append("N2: le garde NE ROUGIT PAS sur un filtre qui ne rapporte "
                          "plus rien -> DECORATIF")
            print(out2[-1500:])
        elif not nomme:
            echecs.append("N2: rougit mais ne NOMME aucune requete fautive")
            print(out2[-1500:])
        else:
            print("   le garde rougit et nomme :")
            for l in nomme[:6]:
                print("     * " + l.strip()[:120])

print("\n" + "=" * 78)
if echecs:
    print("RESULTAT : le garde n'est PAS prouvé :")
    for e in echecs:
        print("   - " + e)
    sys.exit(1)
print("RESULTAT : le garde mord. Il passe une base saine (rc=0) et rougit en")
print("           nommant la requete fautive quand le seed ne correspond plus au")
print("           filtre -- la classe exacte de faute qui avait produit le verdict")
print("           'staff_schedule(day) refuse par mesure' du 09/09.")
sys.exit(0)
