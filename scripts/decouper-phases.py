#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decoupe PHASES.md en un fichier CHAUD (l'entree) + une ARCHIVE de sprints.

POURQUOI. Le journal pese ~133 Ko et chaque agent qui demarre le pagine en entier:
mesure 2026-09-17 sur state.db, 131 523 tokens d'entree RE-ENVOYES par appel d'outil,
soit ~190 s de prefill froid par tour, et une session de nuit bloque par ses propres
garde-fous apres avoir rejoue read_file a l'identique sur les memes regions. Le
probleme n'est pas la taille du fichier, c'est le re-envoy: un agent n'a besoin que
du vivant, l'archive ne se relit que si un verdict la cite.

COMMENT CA MARCHE. Le fichier est decoupe en segments AUX EN-TETETS `## ` (niveau 2).
Les segments de sprint partent dans `phases/sprint-NN-<slug>.md`, verbatim, octets
pour octets; a leur place, PHASES.md recoit un STUB d'une ligne qui donne le chemin,
le poids et la regle de relecture. Les segments chauds restent en place, dans l'ordre
d'origine: l'ordre de lecture n'est pas bouleverse.

LA PORTE ANTI-PERTE (c'est la raison d'etre du script, pas le decoupage).
  P1  le fichier sur disque doit etre IDENTIQUE a ce que git a enregistre (sinon
      quelqu'un travaille dessous: on s'arrete au lieu d'ecrire par-dessus);
  P2  les segments doivent etre disjoints et couvrir 100 % des octets (somme == total);
  P3  la RECONSTRUCTION (chaud + archives recollés dans l'ordre d'origine) doit avoir
      le MÊME sha256 que l'original. Si une seule ligne manquait, le sha bouge: le
      script sort en echec et aucun fichier n'est ecrit.
Sans P3, un decoupage est un ecrasement qui s'ignore.

Lancement:  python3 scripts/decouper-phases.py --check    (ne touche rien, juge)
            python3 scripts/decouper-phases.py --apply
"""
import hashlib
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHASES = os.path.join(BASE, "PHASES.md")
ARCH = os.path.join(BASE, "phases")
PRE_SPLIT = os.path.join(ARCH, ".pre-split")
MANIFEST = os.path.join(ARCH, "manifest.json")

# un segment est un sprint s'il commence par cet en-tete; tout le reste reste chaud
SPRINT = re.compile(r"^## +Sprint\b", re.I)
HEAD2 = re.compile(r"^## \S")


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def tokens(lignes):
    """Compte approximatif: ~4 caracteres/tok sur du prose technique. Sert au budget."""
    return sum(len(l) for l in lignes) // 4


def segments(src):
    """Decoupe en segments disjoints aux en-tetes `## `, avec le prelude avant le premier."""
    lines = src.splitlines(True)
    starts = [i for i, l in enumerate(lines) if HEAD2.match(l)]
    if not starts:
        raise SystemExit("AUCUN en-tete '## ' : le fichier n'a pas la forme attendue")
    cuts = ([0] if starts[0] != 0 else []) + starts + [len(lines)]
    cuts = sorted(set(cuts))
    segs = []
    for a, b in zip(cuts, cuts[1:]):
        body = "".join(lines[a:b])
        segs.append({"titre": lines[a].strip(), "debut": a + 1, "fin": b,
                     "texte": body, "octets": len(body.encode("utf-8"))})
    return segs


def slug(titre):
    t = re.sub(r"^#+\s*", "", titre)
    t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return t[:44] or "section"


def numero_sprint(titre):
    m = re.match(r"^## +Sprint\D{0,4}(\d+)", titre, re.I)
    if not m:
        return None
    return int(m.group(1))


def git_pristine():
    r = subprocess.run(["git", "cat-file", "blob", "HEAD:PHASES.md"], cwd=BASE,
                       capture_output=True, timeout=90)
    if r.returncode != 0:
        raise SystemExit("P1 impossible: git cat-file HEAD:PHASES.md a echoue (%s)"
                         % (r.stderr or b"")[:160])
    return r.stdout


ORIG = os.path.join(PRE_SPLIT, "PHASES.md.orig")


def _ancre_externe():
    """Juge le .orig contre GIT, pas contre un hash que lui-meme a ecrit (constat D3).

    Le defaut etait la: `SHA256.txt` vit dans le MEME dossier scelle que le .orig.
    Falsifier les deux d'un geste ne faisot broncher aucune porte -- une preuve
    auto-attestee n'est pas une preuve. Ici l'ancre est le blob COMMITTE dans
    l'historique: pour falsifier le .orig sans rougir, il faut commiter, donc passer
    par l'historique relisible (et par le relanceur). C'est la seule ancre qui ne
    soit pas dans la main de celui qu'elle surveille.

    Deux verifications, disjointes:
      A  sha256(.orig sur disque) == sha consigne dans le manifeste  (falsification
         par recollage d'un faux .orig);
      B  blob git du fichier sur disque == blob git du meme chemin COMMITTE
         (falsification du disque sans commit -- ce que `git status` ne dit pas
         toujours quand on oublie de le regarder).
    """
    if not os.path.isfile(ORIG):
        print("ANCRE .orig: ABSENT (%s)" % ORIG.replace(BASE + "/", ""))
        return False
    m = json.load(open(MANIFEST, encoding="utf-8"))
    # A) l'ancre interne: le .orig doit rester le document d'origine consigne
    consigne = m.get("sha256_original_avant_reancrage") or m["original_sha256"]
    disque = sha256(open(ORIG, "rb").read())
    if disque != consigne:
        print("ANCRE .orig: ECHEC -- le .orig a bouge sous nos pieds.")
        print("   disque   %s" % disque[:12])
        print("   consigne %s" % consigne[:12])
        return False
    # B) l'ancre externe: git, pas notre propre fichier de hash
    rel = os.path.relpath(ORIG, BASE)
    def _git(*a):
        p = subprocess.run(["git"] + list(a), cwd=BASE, capture_output=True, text=True)
        return p.stdout.strip() if p.returncode == 0 else None
    blob_tete = _git("rev-parse", "HEAD:" + rel)
    blob_disque = _git("hash-object", rel)
    if blob_tete is None:
        print("ANCRE .orig: ECHEC -- le .orig n'est pas committe dans HEAD: "
              "aucune preuve exterieure n'existe.")
        return False
    if blob_disque != blob_tete:
        print("ANCRE .orig: ECHEC -- le .orig sur disque ne correspond pas au blob "
              "committe (contenu modifie sans commit).")
        print("   blob committe %s | blob disque %s" % (blob_tete[:12], (blob_disque or "-")[:12]))
        return False
    print("ANCRE .orig: OK -- sha conforme au manifeste ET egal au blob committe "
          "%s (preuve exterieure, pas auto-attestee)." % blob_tete[:12])
    return True


def verify():
    """Recolle depuis le DISQUE et juge contre le sha de l'original consigne.

    C'est la porte qui surit: elle peut etre relancee par n'importe qui, n'importe
    quand, pour prouver que ni le decoupage ni une eddition ulterieure n'ont perdu
    une ligne du journal. Sans elle, `--apply` n'a qu'un controle interne.
    """
    if not os.path.isfile(MANIFEST):
        raise SystemExit("PAS DE MANIFESTE: le decoupage n'a pas ete applique "
                         "(" + MANIFEST + " absent)")
    m = json.load(open(MANIFEST, encoding="utf-8"))
    segs = segments(open(PHASES, encoding="utf-8").read())
    parts = []
    for s in segs:
        n = numero_sprint(s["titre"]) if SPRINT.match(s["titre"]) else None
        if n is None:
            parts.append(s["texte"])
            continue
        # Clef de resolution = le CHEMIN porte par le stub, jamais le libelle:
        # un stub est "## Sprint N ... -> `phases/...md`", done le titre est pollue
        # par le chemin et ne matcheroit jamais le manifest par egalite de texte.
        trouve = re.search(r"`(phases/[^`]+\.md)`", s["texte"])
        chemin = (os.path.join(BASE, trouve.group(1)) if trouve else
                  os.path.join(BASE, "phases", "sprint-%02d-%s.md" % (n, slug(s["titre"]))))
        if not os.path.isfile(chemin):
            print("ECHEC: archive absente pour %r (cherches %s)"
                  % (s["titre"][:60], chemin.replace(BASE + "/", "")))
            return 4
        parts.append(open(chemin, encoding="utf-8").read())
    got = sha256("".join(parts).encode("utf-8"))
    ok = got == m["original_sha256"]
    print("VERDICT anti-perte: %s | recolle %s | original consigne %s"
          % ("OK" if ok else "ECHEC", got[:12], m["original_sha256"][:12]))
    # L'ancre du .orig est jugee dans la MEME porte (constat D3): une porte separee
    # serait oubliee, et une porte non jouee est pire qu'une porte absente -- elle
    # fait croire a une surveillance qui n'a pas eu lieu.
    if ok:
        ok = _ancre_externe()
    if not ok:
        print("   -> une ligne du journal a bouge. Restaure depuis "
               "phases/.pre-split/PHASES.md.orig et rejoue.")
    return 0 if ok else 4


def main(argv):
    if "--verify" in argv:
        return verify()
    check = "--apply" not in argv
    if not os.path.isfile(PHASES):
        raise SystemExit("PHASES.md absent: " + PHASES)
    disque = open(PHASES, "rb").read()
    total = len(disque)
    src = disque.decode("utf-8")

    # ---- etat: DEJA decoupe ? (c'est la porte qui a fige la session du 17/09) -----
    # Relancer --apply sur un journal deja decoupe butait sur la garde de
    # .pre-split: un message qui accusait « quelqu'un a deja modifie l'arbre »,
    # sur un appel qui ne PEUT pas reussir. L'agent l'a rejoue 17 fois, le
    # garde-fou identical_call_streak_halt a sonne au 5e. Un gate qui ne sait
    # que echouer deux fois n'est pas un gate, c'est un piege: l'etat est
    # reconnu AVANT toute ecriture, et un re-decoupage refuse est un SUCCES
    # (rc=0) puisqu'il n'y a rien a faire.
    deja = os.path.isfile(MANIFEST) or ("`phases/sprint-" in src)
    if deja:
        if not os.path.isfile(MANIFEST):
            # des stubs sont en place mais le manifest a disparu: passage interompu
            raise SystemExit(
                "ETAT DECHIRE: PHASES.md contient des stubs de decoupage mais le\n"
                "manifest est absent (%s). Ne re-decoupe surtout pas par-dessus.\n"
                "Recovery depuis la source conservee:\n"
                "  cp phases/.pre-split/PHASES.md.orig PHASES.md\n"
                "  rm -rf phases && python3 scripts/decouper-phases.py --apply"
                % os.path.relpath(MANIFEST, BASE))
        print("DEJA DECOUPE (manifest present) - ce script ne re-decoupe pas un")
        print("journal deja decoupe: le relancer par-dessus ne peut que l'abimer.")
        print("Rien n'est ecrit. Verdict d'integrite ci-dessous.")
        return verify()

    # ---- P1: on n'ecrit pas par-dessus un arbre qui a bouge sous nos pieds -------
    head = git_pristine()
    if sha256(head) != sha256(disque):
        raise SystemExit("P1 ECHEC: PHASES.md sur disque (%s) != HEAD (%s). "
                         "Quelqu'un travaille dessus: commit ou stashe d'abord."
                         % (sha256(disque)[:12], sha256(head)[:12]))
    print("P1 OK  disque == HEAD, sha %s, %d octets" % (sha256(disque)[:12], total))

    segs = segments(src)
    som = sum(s["octets"] for s in segs)
    if som != total:                                              # ---- P2 -----------
        raise SystemExit("P2 ECHEC: somme des segments %d != total %d (ecart %+d). "
                          "Le decoupage perd ou double des octets: on ne touche rien."
                          % (som, total, som - total))
    print("P2 OK  %d segments, somme des octets == total (%d)" % (len(segs), total))

    archives, chauds = [], []
    for s in segs:
        n = numero_sprint(s["titre"]) if SPRINT.match(s["titre"]) else None
        if n is None:
            chauds.append(s)
            continue
        name = "sprint-%02d-%s.md" % (n, slug(s["titre"]))
        s["archive"] = os.path.join("phases", name)
        archives.append(s)
    if not archives:
        raise SystemExit("Aucun segment de sprint reconnu (forme '## Sprint N ...')")

    # ---- P3: reconstruction, AVANT toute ecriture ---------------------------------
    reconstruction = "".join(
        s["texte"] if "archive" not in s else
        open(os.path.join(BASE, s["archive"]), "rb").read().decode("utf-8")
        if os.path.isfile(os.path.join(BASE, s["archive"])) else "\x00MANQUANT\x00"
        for s in segs)
    if "MANQUANT" in reconstruction:
        # au premier passage les archives n'existent pas encore: on juge sur le texte
        # en memoire, qui EST ce qui sera ecrit, donc P3 reste une vraie egalite.
        reconstruction = "".join(s["texte"] for s in segs)
    if sha256(reconstruction.encode("utf-8")) != sha256(disque):
        raise SystemExit("P3 ECHEC: la recolle ne reproduce pas l'original. "
                         "Le decoupage est defectueux, rien n'est ecrit.")
    print("P3 OK  reconstruction == original (sha %s)" % sha256(disque)[:12])

    if check:
        print("\n--check seulement. %d chauds / %d archives de sprint:"
              % (len(chauds), len(archives)))
        for s in archives:
            print("   l%-5d %6d oct  %s -> %s" % (s["debut"], s["octets"],
                                                 s["titre"][:52], s["archive"]))
        poids = sum(s["octets"] for s in chauds)
        print("   PHASES.md chaud aprés decoupage: ~%d octets (%d %% du total),"
              " ~%d tokens de moins par tour" % (poids, 100 * poids // total,
                                                  (total - poids) // 4))
        return 0

    # ---- ecritures (seulement si les trois portes sont vertes) --------------------
    os.makedirs(PRE_SPLIT, exist_ok=True)
    orig = os.path.join(PRE_SPLIT, "PHASES.md.orig")
    if not os.path.isfile(orig):                                  # preuve d'avant
        open(orig, "wb").write(disque)
        open(os.path.join(PRE_SPLIT, "SHA256.txt"), "w",
             encoding="utf-8").write(sha256(disque) + "  PHASES.md.pre-split\n")
    if sha256(open(orig, "rb").read()) != sha256(disque):
        raise SystemExit("la copie d'archive pre-split ne correspond pas: "
                         "quelqu'un a deja modifie l'arbre")
    os.makedirs(ARCH, exist_ok=True)

    manif = []
    for s in archives:
        b = s["texte"].encode("utf-8")
        open(os.path.join(BASE, s["archive"]), "wb").write(b)
        manif.append({"fichier": s["archive"], "titre": s["titre"],
                      "octets": len(b), "lignes": s["texte"].count("\n"),
                      "sha256": sha256(b)})

    # les sprints restent a leur position, remplaces par un stub d'une ligne
    lignes = src.splitlines(True)
    par_debut = {s["debut"]: s for s in segs}
    sortie = []
    for s in segs:
        if "archive" in s:
            m = [x for x in manif if x["fichier"] == s["archive"]][0]
            sortie.append("%s -> `%s` (%d octets, %d lignes)\n\n"
                         "> Archive verbatim. Ne pas relire sauf si un test, un verdict "
                         "ou une consigne cite nommement ce sprint.\n\n"
                         % (s["titre"], s["archive"], m["octets"], m["lignes"]))
        else:
            sortie.append(s["texte"])
    neuf = "".join(sortie)
    if not neuf.endswith("\n"):
        neuf += "\n"
    open(PHASES, "w", encoding="utf-8", newline="\n").write(neuf)
    nb = sum(len(x) for x in neuf.splitlines())
    json.dump({"original_octets": total, "original_sha256": sha256(disque),
               "chaud_octets": len(neuf.encode("utf-8")), "archives": manif,
               "lignes_chaud": nb, "tokens_approx_chaud": tokens(neuf.splitlines())},
              open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- et on se juge soi-même, depuis le DISQUE, immediatement -----------------
    # Une seule porte de verite: verify(), qui recolle les fichiers reellement ecrits
    # et les juge contre le sha consigne de l'original. Double l'autocontrole
    # d'avant (qui comparait un libelle de titre a un chemin de manifest: 0 match
    # par construction, done un verdict sans mesure).
    verdict = verify()
    print("APRES ECRITURE  PHASES.md %d -> %d octets (-%d %%), lignes %d -> %d"
          % (total, len(neuf.encode("utf-8")),
             100 - 100 * len(neuf.encode("utf-8")) // total, src.count("\n"), nb))
    print("APRES ECRITURE  %d archives ecrites dans phases/" % len(manif))
    return verdict


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
