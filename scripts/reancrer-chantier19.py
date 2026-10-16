#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-ancrage du journal pour le Chantier 19 (la boucle du juge, pas un hash
recopie a la main).

Jumeau de reancrer-sprint16.py, pour un chantier qui reste CHAUD (les '## Sprint'
partent en archive, les '## Chantier N —' restent dans PHASES.md — c'est la regle
du decoupeur). Le contrat du journal (AGENTS.md regle 6) : l'ancre bouge UNIQUEMENT
dans le commit qui re-ancre, et elle est RECALCULEE par segments() + sha256 du
module decouper-phases — jamais recopiee.

Cette boucle :
  G1  l'ANCIENNE ancre du manifest doit juger le recolle SANS le nouveau segment
      (sinon le journal a bouge hors boucle, on n'ecrit rien) ;
  G2  la NOUVELLE ancre est le sha du recolle COMPLET (avec le chantier), calculee,
      et elle doit differer de l'ancienne ;
  le segment reste chaud : PHASES.md n'est pas touche, seul le manifest avance ;
  l'ancre avant_reancrage (0360a1fe...) reste ce qu'elle est : le .orig garde
  sa preuve exterieure, non retablie (le recolle juge est la nouvelle ancre).

Usage : python3 scripts/reancrer-chantier19.py [--dry]
"""
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry" in sys.argv
PHASES = os.path.join(BASE, "PHASES.md")
ARCH = os.path.join(BASE, "phases")
MANIFEST = os.path.join(ARCH, "manifest.json")

spec = importlib.util.spec_from_file_location(
    "decouper", os.path.join(BASE, "scripts", "decouper-phases.py"))
dec = importlib.util.module_from_spec(spec)
sys.argv = ["decouper-phases.py"]  # ne pas jouer son __main__
spec.loader.exec_module(dec)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def lire_source(p):
    return open(p, encoding="utf-8").read()


def recolle_texte(src_phases):
    """Recolle comme verify() : stubs remplaces par leurs archives, dans l'ordre."""
    parts = []
    for s in dec.segments(src_phases):
        if not dec.SPRINT.match(s["titre"]):
            parts.append(s["texte"])
            continue
        trouve = re.search(r"`(phases/[^`]+\.md)`", s["texte"])
        if not trouve:
            raise SystemExit("ENTREE chaude sans stub : %r" % s["titre"][:60])
        chemin = os.path.join(BASE, trouve.group(1))
        if not os.path.isfile(chemin):
            raise SystemExit("ECHEC: archive absente %s" % chemin)
        parts.append(lire_source(chemin))
    return "".join(parts)


def main():
    # --dry nine pas a ce stade : G1 jugera sur disque quoi qu'il arrive.
    src = lire_source(PHASES)
    m = json.load(open(MANIFEST, encoding="utf-8"))

    segs = dec.segments(src)
    cible = [s for s in segs
             if (not dec.SPRINT.match(s["titre"])) and "Chantier 19" in s["titre"]]
    if len(cible) != 1:
        raise SystemExit("attendu 1 entree '## Chantier 19', trouve %d" % len(cible))
    seg = cible[0]
    texte_seg = seg["texte"]

    # L'entree doit rester CHAUDE : verbatim dans PHASES.md, pas de stub.
    if "`phases/" in texte_seg:
        raise SystemExit("l'entree Chantier 19 porte deja un stub : cas non prevu.")

    # G1 : l'ANCIEN recolle jugé depuis GIT (ancre exterieure, constat D3) et pas
    # par chirurgie de chaine : le commit parent de l'entree contient le journal
    # a l'etat que la porte verify() validait (vert au CI sur 11951035).
    r = subprocess.run(
        ["git", "cat-file", "blob", "f00fe35c^:PHASES.md"], cwd=BASE,
        capture_output=True, timeout=90)
    if r.returncode != 0:
        raise SystemExit("G1 impossible: git cat-file a echoue (%s)"
                         % (r.stderr or b"")[:160])
    ancien_recolle = sha256(recolle_texte(r.stdout.decode("utf-8")).encode("utf-8"))
    ancre_precedente = m["original_sha256"]
    if ancien_recolle != ancre_precedente:
        raise SystemExit(
            "G1 ECHEC: l'ancien recolle (%s) != ancre du manifest (%s).\n"
            "  Le journal a bouge HORS boucle (ou deux entrees chaudes d'un coup)."
            % (ancien_recolle[:12], ancre_precedente[:12]))
    print("G1 OK  ancien recolle == ancre du manifest (%s)" % ancien_recolle[:12])

    # G2 : la nouvelle ancre est calculee sur le recolle COMPLET (l'entree dedans).
    got = sha256(recolle_texte(src).encode("utf-8"))
    if got == ancien_recolle:
        raise SystemExit("G2 ECHEC: recolle identique a l'ancienne ancre — "
                         "l'entree ne se lit pas dans le recolle.")
    print("G2 OK  nouvelle ancre calculee %s (%d octets chauds)"
          % (got[:12], len(src.encode("utf-8"))))

    if DRY:
        print("\n--dry : rien n'est ecrit (le segment reste chaud, PHASES.md "
              "est deja commite).")
        return 0

    m["reancrage_precedent"] = m.get("reancrage")
    m["original_sha256"] = got
    m["chaud_octets"] = len(src.encode("utf-8"))
    m["lignes_chaud"] = len(src.splitlines())
    m["tokens_approx_chaud"] = dec.tokens(src.splitlines())
    # sha256_original_avant_reancrage NE BOUGE PAS : la preuve du .orig garde son
    # ancre exterieure (constat D3), points d'ancrage distincts par niveau.
    m["reancrage"] = {
        "motif": ("chantier 19 consigne : la vitrine publique auditee contre le "
                  "code (9 promesses re-jugees, regle fondatrice « IA propose / "
                  "humain applique » a l'ecran), la release v0.1.0 aux trois "
                  "plateformes (AppImage + deb ARM64 locaux, NSIS Windows x64 et "
                  "dmg Apple Silicon par le workflow d'actions build-windows.yml, "
                  "se ressert seul a chaque tag v*), et les trois couthes "
                  "dinstalleur : npm bug #4828, noms de prebuilds NAPI d'argon2 "
                  "(node.napi.node), DELETE de tag -> release draft (re-patch "
                  "draft:false). Ajoute au chaud ; l'ancre est recalculee par la "
                  "boucle du juge (segments() + sha256 du module), jamais "
                  "recopiee"),
        "date": datetime.now().isoformat(),
        "note": ("le .orig reste l'etat d'origine et n'est pas retabli ; le "
                 "recolle juge est la nouvelle ancre ; l'entree reste chaude "
                 "(regle '## Chantier N —' du decoupeur)."),
    }
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("manifest avance : original_sha256 = %s" % got[:12])
    print("segment chaud reste en place — PHASES.md n'a pas ete modifie.")


if __name__ == "__main__":
    main()
