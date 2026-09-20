#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PREUVE DE MORSURE du contrat RECETTES (Sprint 12).

Regle du depot: un PASS qui ne peut pas devenir FAIL n'est pas une mesure.
Chaque regle de test/e2e/recipes-contract.spec.ts est doublee par une MUTATION du
code produit, jouee dans une COPIE ISOLEE de l'arbre (node_modules symlinké):
la mutation doit faire ROUGIR le spec et le CHEMIN attendu doit etre NOMME dans
le bloc de defaut. `tsc` et `node --check` ne jugent que le typage/la syntaxe:
une mutation qui compile encore mais casse la regle est exactement ce qui doit
etre detecte ici.

Les ancres ne vivent PAS dans ce fichier: elles sont lues dans
registre-mutations-recipes.py (le poste rogne les emissions longues et une
ancre mal transcrite se presentait comme un « ne mord pas », la faute consignee
du 09/09). Les ancres du POST et du PUT /api/recipes/:id se ressemblent; pour
muter la BRANCH d'un SEUL bloc, chaque ancre porte les lignes DISTINCTES de son
bloc (le POST a son comment avant la boucle, le PUT a la branche ingredients
juste avant).

Ce qui est prononce et comment:
 - TEMONIN sans mutation: doit etre VERT, sinon AUCUN verdict n'est prononce
   (rc=4) — on ne peut pas imputer aux mutations un rouge qui les precede;
 - ancre vue != 1 fois => ANCRE_MORTE, declaree non jugeable et le script sort
   en echec (elle doit etre repointee, pas ignoree);
 - TOUS les fichiers mutes sont retablis AVANT chaque bras: la premiere version
   ne restaurait que le fichier de l'iteration, donc M8 (route) survit dans M9
   et M9 (module partage) survit dans M10/M11 — trois faux « MORD_AVEC_BRUIT »
   qui etaient MES fils et non le produit. Un harnais qui contamine ses propres
   bras rend des verdicts faux et parfaitement lisibles;
 - un « ne mord pas » est RE-JOUE une fois (la contention de port d'un fils tsx
   residuel a deja produit un faux verdict ici); les DEUX runs doivent etre
   d'accord, sinon NON PRONONCE;
 - un rouge qui nomme un AUTRE chemin que l'attendu n'est pas un MORD; le nom
   de chaque defaut et son `recu` sont rendus pour que le lecteur puisse trancher
   lui-même, et une mutation qui casse DEUX regles est une mutation MAL CALIBREE
   (elle doit etre resserree, pas le verdict adouci).
"""
import os, sys, re, time, shutil, hashlib, subprocess, importlib.util

BASE = os.path.expanduser("~/cookdrive-project")
WORK = os.path.expanduser("~/cd-morsure-recipes")
REGISTRE = os.path.join(os.path.dirname(os.path.realpath(__file__)),
                        "registre-mutations-recipes.py")
SPEC = "test/e2e/recipes-contract.spec.ts"
CHEMINS = ["R1", "R2", "R3", "R4", "S2", "S2b", "S3", "S3b", "S8", "S9", "R5",
           "P2", "P3", "P4", "P5", "P6", "P7", "P8", "R6", "S5", "S11b", "R7", "R8"]
SEP = chr(0x203A)  # le separateur du reporter Playwright, par codepoint


def charger_registre():
    """Import le registre SANS jouer son __main__ (la lecon du `sys.exit` au
    niveau module: un exec avec l'argv du controleur joue le script d'un autre)."""
    spec = importlib.util.spec_from_file_location("registre_muts", REGISTRE)
    mod = importlib.util.module_from_spec(spec)
    argv_garde = sys.argv
    sys.argv = [REGISTRE]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv_garde
    return mod.MUTATIONS


def preparer():
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK)
    for sub in ("src", "test", "scripts", "public", "electron"):
        s = os.path.join(BASE, sub)
        if os.path.isdir(s):
            shutil.copytree(s, os.path.join(WORK, sub),
                            ignore=shutil.ignore_patterns("node_modules", "dist",
                                                           "test-results", "tmp-recipes"))
    # TOUS les fichiers racine: le serveur charge le modele Epicure depuis la
    # racine (src/routes/epicure.ts importe ../../epicure + les embeddings/csv).
    # Une liste blanche de fichiers rendait la copie INJOABLE
    # (ERR_MODULE_NOT_FOUND sur epicure) et le temoin rougissait pour une raison
    # d'infrastructure — un faux rouge qui, laisse tel quel, aurait rendu
    # « aucune morsure prononcee » sans que personne ne voie la cause.
    for f in os.listdir(BASE):
        fp = os.path.join(BASE, f)
        if os.path.isfile(fp):
            shutil.copy2(fp, os.path.join(WORK, f))
    nm = os.path.join(WORK, "node_modules")
    if not os.path.lexists(nm):
        os.symlink(os.path.join(BASE, "node_modules"), nm)


def retablir(fichiers):
    for f in fichiers:
        shutil.copy2(f, os.path.join(WORK, os.path.relpath(f, BASE)))


def defauts_de(sortie):
    """(chemins vus, detail des defauts) depuis le bloc du reporter. Une ligne de
    defaut ressemblance a '  1) .../spec.ts:183:1 SEP R1 POST /api/recipes...'."""
    vus, detail = set(), []
    for l in sortie.splitlines():
        if not re.match(r"\s*\d+\)\s", l):
            continue
        for c in CHEMINS:
            if re.search("(?:^|[\\s.:\" + SEP + \"])" + c + "[\\s:]", l + " "):
                vus.add(c)
                detail.append(c)
    return sorted(vus), detail


def defauts_nommes(sortie):
    """Les lignes 'Error: ...' + 'Received: ...' des blocs: sans elles un verdict
    'MORD_AVEC_BRUIT' ne permet pas de savoir quelle regle a bouge."""
    out = []
    for l in sortie.splitlines():
        s = l.strip()
        if s.startswith(("Error:", "Expected:", "Received:")):
            out.append(s[:120])
    return out[:10]


def rejouer(tag):
    log = os.path.join(WORK, "playwright-%s.log" % tag)
    env = dict(os.environ)
    env.pop("COOKDRIVE_INSTANCE_TOKEN", None)
    with open(log, "wb") as f:
        rc = subprocess.run(["npx", "playwright", "test", SPEC, "--reporter=line"],
                            cwd=WORK, env=env, stdout=f, stderr=subprocess.STDOUT,
                            timeout=900).returncode
    sortie = open(log, encoding="utf-8", errors="replace").read()
    vus, detail = defauts_de(sortie)
    return rc, vus, defauts_nommes(sortie), detail


def main():
    muts = charger_registre()
    TOUS = {m["fichier"] for m in muts}
    preparer()
    print("# copie isolee %s  |  %d mutations" % (WORK, len(muts)))
    rc0, ech0, _, _ = rejouer("temoin")
    print("TEMOIN_SANS_MUTATION rc=%d echoues=%s" % (rc0, ech0 or "-"))
    if rc0 != 0:
        print("NON PRONONCE: le temoin sans mutation n'est pas vert; aucune morsure ne")
        print("peut etre imputee aux mutations. Rejouer le spec seul avant de conclure.")
        return 4
    retablir(TOUS)

    prononces, consignees = [], []
    for m in muts:
        retablir(TOUS)
        cible = os.path.join(WORK, os.path.relpath(m["fichier"], BASE))
        octets = open(m["fichier"], encoding="utf-8").read()
        if octets.count(m["avant"]) != 1:
            consignees.append((m["id"], m["attendu"], "ANCRE_MORTE", []))
            print("%-4s ANCRE_MORTE: l'ancre n'est pas vue une seule fois" % m["id"])
            continue
        open(cible, "w", encoding="utf-8").write(octets.replace(m["avant"], m["apres"], 1))
        sha = hashlib.sha256(open(cible, "rb").read()).hexdigest()[:10]
        rc, ech, det, _ = rejouer(m["id"])
        if rc == 0:
            time.sleep(2)
            rc2, ech2, det2, _ = rejouer(m["id"] + "-bis")
            if rc2 != 0:
                print("     RE-JOUE: le premier « ne mord pas » etait une contention")
                rc, ech, det = rc2, ech2, det2
        extra = [e for e in ech if e != m["attendu"]]
        if rc == 0:
            etat = "NE_MORD_PAS"
        elif m["attendu"] in ech and not extra:
            etat = "MORD"
        elif m["attendu"] in ech:
            etat = "MORD_MAL_CALIBREE +%s" % extra
        else:
            etat = "ROUGE_SANS_NOMMER_%s (vus=%s)" % (m["attendu"], ech)
        print("%-4s %-3s sha=%s  %s   [%s]" % (m["id"], m["attendu"], sha, etat, m["titre"]))
        if etat != "MORD":
            for d in det:
                print("        %s" % d)
        if etat == "MORD":
            prononces.append(m["id"])
        else:
            consignees.append((m["id"], m["attendu"], etat, det))
    retablir(TOUS)

    print("\nVERDIT LUS: %d/%d MORDENT" % (len(prononces), len(muts)))
    for mid, att, etat, det in consignees:
        print("  %-4s attendu=%-3s %s" % (mid, att, etat))
        for d in det:
            print("      %s" % d)
    return 0 if not consignees else 1


if __name__ == "__main__":
    sys.exit(main())
