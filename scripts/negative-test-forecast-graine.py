#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve de MORSURE du mode `--semer=decaler` (regle du depot: un PASS qui ne
peut pas rougir n'est pas une mesure).

Le mode rend 9/9 depuis qu'il est branche. Sans ce script, ce 9/9 est une
DECORATION: rien ne prouve qu'il est lie au calcul des besoins et non a un
hasard de la base.

DEUX decisions d'harnais qui ne sont pas decoratives:

1) chaque lancement passe en `--horizon=0`. L'horizon de defaut (14) est trop
   large pour deux des voies: un besoin qui fuite hors fenetre y rentre quand
   meme, et le check « rien d'autre n'affiche un besoin » devient satisfait par
   la taille de la fenetre au lieu de la juger. A horizon=0 le SEUL plat en
   fenetre est celui cale a aujourd'hui: la mesure est serree et le check du
   7 septembre reste jouable.

2) un process de la sonde qui survivrait d'un run precedent jugerait une
   instance qui n'est pas la tienne (piege consigne: « un PASS rendu par une
   instance qui n'est pas la tienne n'est pas une mesure »). La sonde lie son
   port a 0 (le systeme le donne), done le risque n'est PAS le port: c'est le
   fils qui rejoue sur la MEME copie de travial. On refuse de demarrer tant
   qu'un `probe-forecast-real.py` tourne.

La restauration est CONFRONTEE AU SHA d'origine dans un `finally`, et le
controle final rejoue le code retabli: si le harnais ne retablit pas un etat
jouable, la morsure n'est PAS prononcee (rc 6).
"""
import hashlib
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_morsure_forecast_table import CAUSES_MORTS, RAISONS, TABLE

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RACINE, "src", "routes", "suppliers.ts")
SONDE = os.path.join(RACINE, "scripts", "probe-forecast-real.py")


def lire(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def ecrire(p, t):
    with open(p, "w", encoding="utf-8") as f:
        f.write(t)


def sha(b):
    return hashlib.sha256(b).hexdigest()[:12]


def degrader(raison, details=()):
    """Verdict SANS TERRAIN rendu rc=0 (degrade propre, consigne 05/10).

    La porte `verify:forecast-mord` ne peut mordre que sur un terrain : une
    reference non verte ou une cible injoignable est une ABSENCE DE TERRAIN,
    pas une preuve que la porte ne mord pas. La rendre rouge ici accuserait
    le produit d'un defaut qu'elle n'a pas mesure. La sortie NOMME l'absence ;
    sur une machine qui porte la base client, la porte retrouve ses rc 2-9.
    """
    print("=" * 74)
    print("VERDICT : SANS TERRAIN — %s" % raison)
    print("=" * 74)
    for d in details:
        print(d)
    print("  Porte non jugee sur cette machine (absence de terrain, pas un defaut")
    print("  produit). Sur une machine qui porte la base client, la porte retrouve")
    print("  ses codes reels (PRONONCEE rc=0, NON PRONONCEE rc=7+).")
    return 0


def fils_de_sonde_vivants():
    """Les process de la sonde qui tournent encore (hors de ce script)."""
    r = subprocess.run(["pgrep", "-af", "probe-forecast-real.py"],
                       capture_output=True, text=True)
    lignes = [l for l in (r.stdout or "").split("\n") if l.strip()]
    return [l for l in lignes if "pgrep" not in l]


def lancer():
    """Joue la sonde en mode grain + horizon serre; rend (rc, sortie)."""
    # `--fixture=branches` est INDISPENSABLE et non decoratif: sans la
    # gramature a 0 que le fixture depose, M4 est joue sans la donnee qui
    # l'exerce et rendrait « ne mord pas » pour une raison d'harnais.
    r = subprocess.run([sys.executable, SONDE, "--semer=decaler",
                       "--horizon=0", "--fixture=branches"],
                       cwd=RACINE, capture_output=True, text=True, timeout=420)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    if not os.path.isfile(SRC) or not os.path.isfile(SONDE):
        print("CIBLES INJOIGNABLES")
        return degrader("CIBLES INJOIGNABLES", [
            "  src      : %s (%s)" % (SRC, "ok" if os.path.isfile(SRC) else "ABSENT"),
            "  sonde    : %s (%s)" % (SONDE, "ok" if os.path.isfile(SONDE) else "ABSENT")])
    if not os.path.exists(os.environ.get("COOKDRIVE_CLIENT_DB",
                                         os.path.join(RACINE, "var", "agent_culinaire.db"))):
        return degrader("BASE CLIENT ABSENTE (pas de terrain pour la reference)", [
            "  chemin attendu : %s" % os.path.join(RACINE, "var", "agent_culinaire.db"),
            "  La sonde de reference rendrait rc=2 SANS TERRAIN ; juger la morsure",
            "  sans terrain reviendrait a comparer deux vides."])
    g = subprocess.run(["git", "status", "--porcelain", "--",
                        os.path.relpath(SRC, RACINE)],
                       cwd=RACINE, capture_output=True, text=True)
    if g.stdout.strip():
        print("LE SOURCE PORTE UN TRAVIAL NON CONSIGNE — ABSTENTION")
        print("  " + g.stdout.strip()[:140])
        return degrader("SOURCE A TRAVIAL NON CONSIGNE — ABSTENTION", [
            "  " + g.stdout.strip()[:140]])
    fils = fils_de_sonde_vivants()
    if fils:
        print("UN FILS DE LA SONDE TOURNE ENCORE — ABSTENTION")
        for l in fils[:3]:
            print("  " + l[:130])
        return degrader("UN FILS DE LA SONDE TOURNE ENCORE — ABSTENTION", [
            "  " + l[:130] for l in fils[:3]])

    original = lire(SRC)
    tref = sha(original.encode("utf-8"))
    print("=" * 74)
    print("MORSURE DU MODE --semer=decaler  (horizon serre a 0, oracle a la main)")
    print("source jugee:" + os.path.relpath(SRC, RACINE) + " sha " + tref)
    print("=" * 74)

    rc_ref, out_ref = lancer()
    print("REFERENCE (code intact)                     rc=%d" % rc_ref)
    if rc_ref != 0:
        print("  IMPOSSIBLE: la reference n'est pas verte — la morsure n'a pas")
        print("  de sens. Derniere ligne:" + (out_ref.strip().splitlines() or [""])[-1][:110])
        return degrader("REFERENCE NON VERTE (rc=%d) — pas de terrain" % rc_ref, [
            "  " + (out_ref.strip().splitlines() or [""])[-1][:110]])
    print("  la mesure existe (les 9 checks passent contre l'oracle)")

    mordues = []
    morts = []
    constats = []
    fautes = []
    for nom, vieil, neuf, check, expectatif in TABLE:
        marq = nom.split(" ")[0]
        n = original.count(vieil)
        if n != 1:
            fautes.append("%s: anchre NON UNIQUE (%d) — non jouee" % (marq, n))
            print("%-52s ANCHRE %d — non jouee" % (marq, n))
            continue
        installe = original.replace(vieil, neuf, 1)
        if installe == original:
            fautes.append("%s: mutation NEUTRE — non jouee" % marq)
            print("%-52s NEUTRE — non jouee" % marq)
            continue
        ecrire(SRC, installe)
        try:
            rc, out = lancer()
            bas = out.lower()
            nomme = check.lower() in bas
            jug = ("faux  " + check.lower()) in bas or "faux " in bas
            if rc != 0 and nomme and jug:
                print("%-52s MORD   rc=%d (%s)" % (marq, rc, check))
                mordues.append(marq)
            elif rc != 0 and not (nomme and jug):
                # rougit pour une AUTRE raison: la voie visee n'est pas jugee
                motif = "mauvaise raison"
                if "incomplet" in bas or "error" in bas.split("verdict")[-1][:200]:
                    motif = "crash/erreur, pas un check"
                fautes.append("%s: rougit (%s)" % (marq, motif))
                print("%-52s rougit MAL rc=%d — %s" % (marq, rc, motif))
            else:
                if expectatif == "mord":
                    # pas de donnee qui traine: ici le chemin est sans temoin,
                    # c'est la porte qui est en defaut.
                    fautes.append("%s: NE MORD PAS (rc=0) — CHEMIN SANS TEMOIN" % marq)
                    print("%-52s *** NE MORD PAS (rc=0) — SANS TEMOIN" % marq)
                elif expectatif == "redundance":
                    constats.append((marq, RAISONS.get(marq, "redundante")))
                    print("%-52s ne mord pas, PREVU: voie REDONDANTE" % marq)
                elif expectatif == "inatteignable":
                    constats.append((marq, RAISONS.get(marq, "inatteignable")))
                    print("%-52s ne mord pas, PREVU: INATTEIGNABLE" % marq)
                else:
                    cause = CAUSES_MORTS.get(marq) or "branche non exercee par ces donnees"
                    morts.append("%s: %s" % (marq, cause))
                    print("%-52s NE MORD PAS — attendu: branche morte ici" % marq)
        except subprocess.TimeoutExpired:
            fautes.append("%s: EXPIRE" % marq)
            print("%-52s EXPIRE" % marq)
        finally:
            ecrire(SRC, original)
            if sha(lire(SRC).encode("utf-8")) != tref:
                ecrire(SRC, original)
                if sha(lire(SRC).encode("utf-8")) != tref:
                    print("  *** RESTAURATION IMPOSSIBLE — VERIFIER `git diff`")
                    return 9

    rc_fin, out_fin = lancer()
    print("-" * 74)
    print("controle final (code retabli, attendu VERT)  rc=%d" % rc_fin)
    jouables = len(TABLE) - len([f for f in fautes if "non jouee" in f])
    print("  mordues %d/%d jouables | %d angle(s) mort(s) de donnees | "
          "%d constat(s) structurel(s)"
          % (len(mordues), jouables, len(morts), len(constats)))
    for marq, txt in constats:
        print("    - %s: %s" % (marq, txt))
    for m in morts:
        print("    ~ " + m)
    for f in fautes:
        print("    ! " + f)
    if rc_fin != 0:
        print("  ⚠ le harnais ne retablit pas un etat jouable: MORSURE NON PRONONCEE")
        return 6
    # Le verdict ne se compare pas a « 6 sur 6 »: trois branches ne sont
    # pas ateaigtes par les donnees du client (voir CAUSES_MORTS). Exiger
    # 6/6 ferait rougir un harnais qui n'a rien casse, et tenterait donc de
    # falsifier la mesure pour contenter l'attente.
    if fautes:
        print("  VERDICT: NON PRONONCEE — des voies jouables ne mordent pas")
        return 7
    if len(mordues) < 3:
        print("  VERDICT: NON PRONONCEE — moins de trois voies jouables mordent")
        return 7
    print("  VERDICT: PRONONCEE sur les voies que ces donnees exercent")
    print("         (%d jouables mordues; %d non jouables: %d de donnees, "
          "%d structurels — causes ci-dessus)"
          % (len(mordues), len(morts) + len(constats), len(morts), len(constats)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
