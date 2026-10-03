"""Patcher les BORNES de cost-data a la date LOCALE (defaut de Sprint 14.f).

Substitution par chaine EXACTE verifiee (count == 1, abstention sinon), comme
le skill du depot l'impose pour une zone qui porte un verdict consigne: le
patcheur flou a deja remplace TROIS sites d'un seul coup dans ce depot.

PORTÉE CALCULÉE, PAS AU BRAS (scripts/juge138.mjs, joue dans 4 fuseaux):
  - les BORNES (lignes 118/119) sont EN CAUSE: elles sont calculees par
    toISOString() donc en UTC, et confrontees a un attendu LOCAL.
  - generateDates (la 3e voie toISOString, l.138) est HORS DE CAUSE: a
    bornes DONNEES, les quatre fuseaux rendent le MEME tableau (le round-trip
    d'une date-calendrier par minuit UTC est stable). On ne la touche DONC
    PAS. Une "correction" de cette voie-la serait une falsification de la
    mesure pour contenter l'observation.
Apres le patch on EXIGE:
  * plus AUCUNE des deux bornes en UTC,
  * la voie generateDates TOUJOURS presente (exactement 1 occurrence),
  * plus aucune reference a nowLocal (la declaration orpheline est retiree),
  * le fichier n'est ecrit que si TOUTES les gardes passent (tmp + os.replace).
"""
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CIBLE = os.path.join(RACINE, "src", "routes", "dashboard.ts")

src = open(CIBLE, encoding="utf-8").read()
avant = src

NB_GARDE = 0


def substitue(lignes, ancre, nouvelle):
    """Remplace la LIGNE entiere qui contient `ancre`, en exigeant UNE seule
    occurrence. Rend la liste modifiee."""
    global NB_GARDE
    visees = [i for i, l in enumerate(lignes) if ancre in l]
    if len(visees) != 1:
        print("ABSTENTION: ancre %r vue %d fois (1 attendue)" % (ancre, len(visees)))
        sys.exit(1)
    lignes[visees[0]] = nouvelle
    NB_GARDE += 1
    return lignes


L = avant.split("\n")

# --- 1) la voie `labor`: la declaration du jour (deja locale, mais dupliquee)
# ORDRE OBLIGATOIRE : on remplace PRIMO la ligne qui CONSOMME nowLocal,
# et seulement ensuite on retire la declaration. Dans l'autre sens, la
# ligne todayISO contient encore le mot a l'instant de l'assertion et le
# script craque en AssertionError (traceback brut) au lieu de l'abstention
# propre qu'on veut rendre.
L = substitue(
    L,
    "const todayISO = ",
    "  // Date du jour LOCAL par le helper partage (src/shared/util.ts:"
    " jourLocalISO).\n"
    "  // La raison du LOCAL et non de UTC est consigneee sur le helper, pas ici"
    " (une borne\n"
    "  // dupliquee se perime en silence -- la lecon des BUDGETS d'audit-perf.mjs).\n"
    "  const todayISO = jourLocalISO(0);",
)
# la declaration n'est plus consommee par personne: on la retire ICI, apres.
L = [l for l in L if "const nowLocal = new Date();" not in l]
assert all("nowLocal" not in l for l in L), "nowLocal survit quelque part"

# --- 2) les BORNES de cost-data: c'est LA que le defaut est mesure
L = substitue(
    L,
    "const startDate = start ? String(start) :",
    "  // ⚠ Sprint 14.f: les bornes etaient calculees en UTC"
    " (toISOString) alors que le\n"
    "  // calendrier du chef est LOCAL. Entre 00:00 et 02:00 (CEST), UTC est"
    " la VEILLE:\n"
    "  // la fenetre perdait le jour en cours et le tableau affichait une"
    " journee\n"
    "  // fantome. Prouve par execution + porte par la porte D1 sous 4 fuseaux\n"
    "  // (scripts/matrice-fuseaux-d1.sh, couverture prouvée 24/24 par\n"
    "  // scripts/juge-couverture-fuseaux-d1.py).\n"
    "  const startDate = start ? String(start) : jourLocalISO(7);",
)
L = substitue(
    L,
    "const endDate = end ? String(end) :",
    "  const endDate = end ? String(end) : jourLocalISO(0);",
)

apres = "\n".join(L)

# --- les gardes d'apres-patch --------------------------------------------
garde = []
if src.count("const todayISO = jourLocalISO(0);") != 1 and \
   apres.count("const todayISO = jourLocalISO(0);") != 1:
    garde.append("todayISO non derive")
n_utc_bornes = len(re.findall(r"new Date\(Date\.now\(\) - 7 \* 24 \* 60 \* 60 \* 1000\)\.toISOString", apres)) \
    + len(re.findall(r"new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]", apres))
if n_utc_bornes != 0:
    garde.append("%d borne(s) encore en UTC" % n_utc_bornes)
n_gen = len(re.findall(r"toISOString\(\)\.split\(\"T\"\)\[0\]|toISOString\(\)\.split\('T'\)\[0\]", apres))
if n_gen != 1:
    garde.append("generateDates: %d occurrence(s), 1 attendue (voie HORS DE"
                 " CAUSE a laisser intacte)" % n_gen)
if "nowLocal" in apres:
    garde.append("nowLocal survit")
if 'import { jourLocalISO } from "../shared/util.js";' not in apres:
    garde.append("l'import du helper partage est absent")
if len(apres.split("\n")) == len(avant.split("\n")):
    garde.append("le nombre de lignes n'a pas bouge: un patch n'a rien ecrit")

if garde:
    print("ABSTENTION, rien n'est ecrit:", "; ".join(garde))
    sys.exit(1)

tmp = CIBLE + ".tmp-14f"
with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(apres)
os.replace(tmp, CIBLE)
print("PATCH_POSE=%d substitution(s) verifiees" % NB_GARDE)
print("BORNES_UTC_RESTANTES=%d  generateDates=1 (horce de cause, intacte)"
      % n_utc_bornes)
print("LIGNES %d -> %d" % (len(avant.split(chr(10))), len(apres.split(chr(10)))))
