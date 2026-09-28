#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-ancrage du journal pour le Sprint 16.a (la boucle du juge, pas un hash
recopie a la main).

Le contrat du journal (AGENTS.md regle 6) : hash consigne bouge UNIQUEMENT
dans le commit qui re-ancre, et l'ancre est RECALCULEE par segments() + sha256
du module decouper-phases — jamais recopiee. Cette boucle :
  1. ecrit l'archive phases/sprint-16-sprint-16-a-*.md (le segment chaud) ;
  2. remplace l'entree chaude dans PHASES.md par le STUB d'une ligne ;
  3. recolle (segments de PHASES.md + archives relues du disque) et juge :
     l'ancre precedente du manifest doit egaler le sha de l'ANCIEN recolle
     (sans la nouvelle entree), et la nouvelle ancre est le sha du recolle
     COMPLET — sinon rien n'est ecrit.

Usage : python3 scripts/reancrer-sprint16.py [--dry]
"""
import hashlib
import importlib.util
import json
import os
import re
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
    dry = "--dry" in sys.argv
    src = lire_source(PHASES)
    m = json.load(open(MANIFEST, encoding="utf-8"))

    segs = dec.segments(src)
    cible = [s for s in segs
             if dec.SPRINT.match(s["titre"]) and "Sprint 16" in s["titre"]]
    if len(cible) != 1:
        raise SystemExit("attendu 1 entree '## Sprint 16...', trouve %d" % len(cible))
    seg = cible[0]
    if "`phases/sprint-" in seg["texte"]:
        print("DEJA RE-ANCRE (le stub est en place) — rien a faire.")
        return 0

    titre = seg["titre"]
    texte_seg = seg["texte"]
    name = "sprint-%02d-%s.md" % (dec.numero_sprint(titre), dec.slug(titre))
    rel = os.path.join("phases", name)
    chemin = os.path.join(BASE, rel)

    # G1 : l'ancre precedente du manifest doit juger l'ANCIEN recolle — celui
    # d'avant cette entree (c'est ce que verify() validait au dernier commit).
    src_sans = src.replace(texte_seg, "", 1)
    ancien_recolle = sha256(recolle_texte(src_sans).encode("utf-8"))
    ancre_precedente = m["original_sha256"]
    if ancien_recolle != ancre_precedente:
        raise SystemExit(
            "G1 ECHEC: l'ancien recolle (%s) != ancre du manifest (%s).\n"
            "  Le journal a bouge HORS boucle (ou deux entrees chaudes d'un coup)."
            % (ancien_recolle[:12], ancre_precedente[:12]))
    print("G1 OK  ancien recolle == ancre du manifest (%s)" % ancien_recolle[:12])

    lignes = texte_seg.splitlines()
    stub = "%s -> `%s` (%d octets, %d lignes)\n" % (
        titre.rstrip(), rel, len(texte_seg.encode("utf-8")), len(lignes))
    src_nouveau = src.replace(texte_seg, stub, 1)

    # Ecrire l'archive puis juger la recolle COMPLETE AVANT de toucher PHASES.md.
    deja_present = os.path.isfile(chemin)
    if deja_present and lire_source(chemin) != texte_seg:
        raise SystemExit("ECHEC: l'archive existe deja et differe du segment chaud.")
    if not deja_present:
        with open(chemin, "w", encoding="utf-8", newline="") as f:
            f.write(texte_seg)
    got = sha256(recolle_texte(src_nouveau).encode("utf-8"))
    if got == ancien_recolle:
        if not deja_present:
            os.remove(chemin)
        raise SystemExit("G2 ECHEC: recolle identique a l'ancienne ancre — "
                         "le stub ne rend pas le texte.")
    print("G2 OK  archive conforme au segment; nouvelle ancre calculee %s "
          "(%d octets, %d lignes)"
          % (got[:12], len(texte_seg.encode("utf-8")), len(lignes)))

    if dry:
        if not deja_present:
            os.remove(chemin)
        print("\n--dry : rien d'autre n'est ecrit (archive testee puis retiree).")
        return 0

    open(PHASES, "w", encoding="utf-8", newline="").write(src_nouveau)

    m["reancrage_precedent"] = m.get("reancrage")
    m["original_sha256"] = got
    m["chaud_octets"] = len(src_nouveau.encode("utf-8"))
    m["lignes_chaud"] = len(src_nouveau.splitlines())
    m["tokens_approx_chaud"] = dec.tokens(src_nouveau.splitlines())
    m["archives"].append({
        "fichier": rel,
        "titre": titre,
        "octets": len(texte_seg.encode("utf-8")),
        "lignes": len(lignes),
        "sha256": sha256(texte_seg.encode("utf-8")),
    })
    m["reancrage"] = {
        "motif": ("sprint 16.a (chat plein ecran dans Ingenierie des Menus, fiches "
                  "en TROIS CARTES pretes a sauvegarder pre-remplies, fiches "
                  "editables 100 %, normaliserCarte cote serveur) ajoute au chaud "
                  "(stub) + archive " + rel
                  + " ; l'ancre est recalculee par la boucle du juge (segments() "
                  "+ sha256 du module), jamais recopiee"),
        "date": datetime.now().isoformat(),
        "note": ("le .orig reste l'etat d'origine et n'est pas retabli ; le "
                 "recolle juge est la nouvelle ancre."),
    }
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("RE-ANCRE: %s | stub en place | manifest original_sha256=%s"
          % (rel, got[:12]))

    # jugement final par la porte elle-meme, pas par une copie de sa logique
    rc = dec.verify()
    if rc != 0:
        raise SystemExit("verify() rouge apres re-ancrage : restauration a faire "
                         "par 'git checkout -- PHASES.md phases/'")
    return rc


if __name__ == "__main__":
    sys.exit(main())
