#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fige une REFERENCE HORODATEE de la base du client pour `verify:forecast`.

POURQUOI CETTE DETTE EXISTE. La porte `verify:forecast` (et sa morsure
`verify:forecast-mord`) juge la voie de previson sur `~/promo_resto/udata/
agent_culinaire.db`: une base HORS depot, que le produit du client ecrit en
continu. Deux consequences mesurees cette session:
  - le guet peut devenir rouge sans aucune modification du code (la voie a
    ete rouge parce qu'AUCUN plat n'etait dans la fenetre de 14 jours, alors
    que la base etait riche: 6 recettes, 18 ingredients, 0 orphelin);
  - et l'inverse est vrai: un vert ne prouve pas que la voie est jouable le
    lendemain, puisque le meme depot, avec une base differente, rend un autre
    verdict. Un gate dont le verdict depend d'un fichier non versionne
    n'est pas reproductible.

CE QUE CE SCRIPT FAIT (et ce qu'il ne fait PAS).
  - il POSE une copie datee, via `sqlite3.backup()`, dans un repertoire
    HORS depot (par defaut `~/cookdrive-refs/previsions/`).
  - il JOUE la sonde contre cette copie (`--db`), pour que la reference
    soit accompagn ee d'un verdict relouable et non d'une intention.
  - il ne VERIT PAS la base du client dans le depot: y pousser les
    recettes, tarifs et fournisseurs d'un client est une decision de
    gouvernance des donnees qui n'appartient pas a un script de test. La
    copie reste locale; `regler --pousser` n'existe pas ici.

POURQUOI `sqlite3.backup()` et pas `shutil.copy`. La base du client tourne
en WAL: son `.db` ne pese que quelques Ko pendant que l'essentiel est dans
le `-wal`. Une copie du seul fichier `.db` produit une base VIDE et fait
conclure a une absence de donnees client (piege consigne dans la memoire du
projet). Le backup() produit l'etat consolide reel.

CE QUE LA REFERENCE NE RESOUD PAS (angle mort consigne): elle fige un
INSTANT de la base, pas sa logique d'evolution. Elle sert a rejouer un
verdict et a dater une regression, pas a remplacer les donnees du jour.
"""
import argparse
import datetime
import hashlib
import json
import os
import sqlite3
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_CLIENT = os.path.expanduser("~/promo_resto/udata/agent_culinaire.db")
REFS = os.path.expanduser("~/cookdrive-refs/previsions")
SONDE = os.path.join(RACINE, "scripts", "probe-forecast-real.py")
CLE = "agent_culinaire.db"


def empreinte(chemin):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def inventaire(chemin):
    """Comptes de la copie: ce qui fait la difference entre VIDE et RICHEn."""
    con = sqlite3.connect("file:%s?mode=ro" % chemin, uri=True)
    try:
        def un(requete):
            try:
                return con.execute(requete).fetchone()[0]
            except sqlite3.Error:
                return -1
        return {
            "menu_planning": un("SELECT COUNT(*) FROM menu_planning"),
            "planning_avec_recette": un(
                "SELECT COUNT(*) FROM menu_planning WHERE recipe_id IS NOT NULL"
                " AND recipe_id <> ''"),
            "recipe_ingredients": un("SELECT COUNT(*) FROM recipe_ingredients"),
            "inventaire": un("SELECT COUNT(*) FROM inventory"),
            "recettes": un("SELECT COUNT(*) FROM recipes"),
        }
    finally:
        con.close()


def poser(force):
    if not os.path.isfile(BASE_CLIENT):
        raise SystemExit("base du client absente (%s): on ne fige pas une"
                         " absence." % BASE_CLIENT)
    jour = datetime.datetime.now().astimezone(datetime.timezone.utc)
    tampon = jour.strftime("%Y%m%dT%H%M%S")
    dossier = os.path.join(REFS, tampon)
    cible = os.path.join(dossier, CLE)
    if os.path.isfile(cible) and not force:
        raise SystemExit("reference %s deja posee: relancer avec --force" % tampon)
    os.makedirs(dossier, exist_ok=True)
    source = sqlite3.connect(BASE_CLIENT)
    destination = sqlite3.connect(cible)
    try:
        source.backup(destination)
    finally:
        source.close()
        destination.close()
    octets = os.path.getsize(cible)
    if octets < 4096:
        os.remove(cible)
        os.removedirs(dossier)
        raise SystemExit(
            "copie de %d octets: une base vide (le piege du WAL). La voie"
            " copie-du-.db ne doit JAMAIS etre employee ici." % octets)
    return tampon, dossier, cible


def jouer(cible):
    """Joue la sonde sur la copie. `--semer=decaler` reste le calage licite
    (une colonne de date, deterministe, sans graine inventee)."""
    cmd = [sys.executable, SONDE, "--semer=decaler", "--db", cible]
    r = subprocess.run(cmd, cwd=RACINE, capture_output=True, text=True,
                       timeout=420)
    sortie = (r.stdout or "") + (r.stderr or "")
    rendus = [l.strip() for l in sortie.split("\n")
              if l.strip().startswith(("SEM", "oracle", "FIXTURE", "VERDICT",
                                       "ARRET", "OK  ", "FAUX", "SONDE"))]
    return r.returncode, rendus, sortie


def ecrire_manifeste(dossier, tampon, cible, rc, rendus):
    manifeste = {
        "tampon_utc": tampon,
        "source": BASE_CLIENT,
        "cle": CLE,
        "sha256": empreinte(cible),
        "octets": os.path.getsize(cible),
        "inventaire": inventaire(cible),
        "sonde": {"commande": "probe-forecast-real.py --semer=decaler --db <copie>",
                  "rc": rc, "rendu": rendus[:14]},
        "contenu": "base DU CLIENT, hors depot: ne jamais committer.",
        "a_vertir": "un INSTANT fige: sert a rejouer un verdict et dater une"
                    " regression, pas a remplacer les donnees du jour.",
    }
    with open(os.path.join(dossier, "manifeste.json"), "w",
              encoding="utf-8") as f:
        json.dump(manifeste, f, indent=2, ensure_ascii=False)
    return manifeste


def lister():
    if not os.path.isdir(REFS):
        print("aucune reference (%s non cree)." % REFS)
        return 0
    lignes = sorted(os.listdir(REFS))
    for t in lignes:
        m = os.path.join(REFS, t, "manifeste.json")
        if os.path.isfile(m):
            donnees = json.load(open(m, encoding="utf-8"))
            inv = donnees.get("inventaire", {})
            print("  %s | %d octets | planning=%s (avec recette=%s)"
                  " ingredients=%s inventaire=%s | rc=%s"
                  % (t, donnees.get("octets", -1),
                     inv.get("menu_planning"), inv.get("planning_avec_recette"),
                     inv.get("recipe_ingredients"), inv.get("inventaire"),
                     donnees.get("sonde", {}).get("rc")))
        else:
            print("  %s | ⚠ SANS MANIFESTE (posee mais jamais jouee)" % t)
    if not lignes:
        print("  (repertoire vide)")
    return 0


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[2])
    ap.add_argument("--lister", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--verifier", metavar="TAMPON",
                   help="rejoue la sonde contre une reference posee")
    ap.add_argument("--exiger-non-nul", action="store_true",
                   help="rc != 0 de la sonde est une ECHEC (refus d'un vert"
                        " rendu par un scan vide)")
    ap.add_argument("--retirer", metavar="ANCIENNETE_JOURS", type=int)
    args = ap.parse_args(argv)

    if args.lister:
        return lister()

    if args.retirer is not None:
        if not os.path.isdir(REFS):
            return 0
        limite = datetime.datetime.now().astimezone(
            datetime.timezone.utc) - datetime.timedelta(days=args.retirer)
        n = 0
        for t in sorted(os.listdir(REFS)):
            try:
                age = datetime.datetime.strptime(t, "%Y%m%dT%H%M%S").replacetime(
                    tzinfo=datetime.timezone.utc)
            except ValueError:
                continue
            if age < limite:
                import shutil
                shutil.rmtree(os.path.join(REFS, t), ignore_errors=True)
                n += 1
        print("%d reference(s) retiree(s) (au-dela de %d jours)"
              % (n, args.retirer))
        return 0

    if args.verifier:
        cible = os.path.join(REFS, args.verifier, CLE)
        if not os.path.isfile(cible):
            print("reference %s absente" % args.verifier)
            return 3
        rc, rendus, _ = jouer(cible)
        print("sonde rejouee sur %s -> rc=%d" % (args.verifier, rc))
        for l in rendus:
            print("   | " + l[:112])
        if args.exiger_non_nul and rc != 0:
            print("⚠ --exiger-non-nul: la reference ne rend pas un verdict jouable.")
            return 5
        return 0

    tampon, dossier, cible = poser(args.force)
    rc, rendus, sortie = jouer(cible)
    manifeste = ecrire_manifeste(dossier, tampon, cible, rc, rendus)
    print("REFERENCE POSEE %s" % tampon)
    print("  %s (%d octets)" % (os.path.relpath(cible, os.path.expanduser("~")),
                                manifeste["octets"]))
    print("  sha256=%s…" % manifeste["sha256"][:16])
    print("  inventaire=%s" % json.dumps(manifeste["inventaire"]))
    print("  sonde rejouee: rc=%d" % rc)
    for l in rendus:
        print("   | " + l[:112])
    if rc != 0:
        print("  ⚠ la sonde rend rc=%d sur CETTE copie: c'est un fait sur la"
              " donnee figee," % rc)
        print("     pas un defaut du script. Le manifeste le consigne tel quel")
        print("     (un vert fabrique serait la seule faute interdite).")
    print("  NOTE: la copie reste HORS depot (les donnees du client ne")
    print("        transitent pas par Git). Elle fige un instant, pas une")
    print("        logique d'evolution.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
