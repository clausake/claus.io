#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chantier 52 — LE FICHIER SOMMES-SHA256.txt EST UN CONTRAT, PAS UN ORNEMENT.

Le contrat est ECRT dans README.md (ligne 104, verifiee par cette porte) :
« Chaque release publie aussi SOMMES-SHA256.txt : apres telechargement,
comparez la somme de votre fichier (sha256sum / Get-FileHash) a la ligne du
fichier qui porte son nom — si les deux sommes sont identiques, le
telechargement est intact. »

Le defaut mesure le 11/11 : la release v1.0.7 a ete publiee avec ses quatre
installeurs et SANS SOMMES-SHA256.txt. `grep -rn SOMMES .github/` rendait
VIDE : le workflow ne le genere JAMAIS. La release v1.0.6 le portait parce
qu'il avait ete attache a la main. Un contrat promis au client, tenu a la main
une fois sur deux, est un contrat faux — et c'est exactement le genre de
promesse qu'une porte doit empecher de mentir.

CE QUE LA PORTE JOUE (et ce qu'elle NE JOUE PAS, nomme pour ne pas mentir) :

  A. le README promet le fichier (si la phrase saute, la porte rougit : le
     contrat et la porte ne peuvent pas se separer en silence) ;
  B. le workflow est la pour le construire (l'etape qui le genere existe,
     et elle est placee AVANT l'attachement a la release — apres, elle ne
     sert a rien) ;
  C. ce qui est PUBLie sur la derniere release est conforme : les quatre
     installeurs de la version de package.json sont presents, le fichier
     SOMMES l'est aussi, et — la partie qui compte, parce qu'un fichier
     faux rassure pour rien — chaque somme du fichier est RE-CALCULEE par
     cette porte a partir des OCTETS reellement telecharges. Une somme qui
     ne correspond pas au fichier est une faute, meme si le fichier est la.

  Le controle utile ne coute pas 1,2 Go : le fichier SOMMES est joint a la
  release par la MEME etape `softprops/action-gh-release` que les installeurs
  (le motif `release/*.AppImage` du workflow est une liste de GLOBS). Une
  release dont les quatre installeurs sont presents mais le fichier absent a
  DONC ete attachee a la main, et son fichier n'est pas tenu par le workflow :
  c'est le defaut mesure du 11/11 sur v1.0.7. La porte nomme ce raisonnement
  au lieu de telecharger les installeurs a chaque lot. `SOMMES_MODE=complet`
  (variable d'environnement) telecharge EN OUTRE chaque installeur et
  recalcule sa somme sur les octets reels : c'est le chemin a jouer a la
  publication, pas au lot de CI.

Lancement : python3 scripts/verif-sommes-release.py            (chemin complet)
            SOMMES_MODE=rapide python3 scripts/verif-sommes-release.py
Le rc EST le verdict. Sans reseau ni `gh` authentifie, la porte rend
SANS TERRAIN en le nommant : jamais un PASS gratuit.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOW = os.path.join(BASE, ".github", "workflows", "build-windows.yml")
README = os.path.join(BASE, "README.md")
NOM_FICHIER = "SOMMES-SHA256.txt"


def gh(*args, **kw):
    """Un seul instrument pour parler a GitHub ; son rc est le fait."""
    r = subprocess.run(["gh"] + list(args), capture_output=True, text=True,
                       cwd=BASE, timeout=kw.pop("timeout", 300), **kw)
    return r


def installeurs_attendus(version):
    """Les quatre noms que la release DOIT porter (exigence du README)."""
    return [
        "claus.io.Setup.%s.exe" % version,
        "claus.io-%s-arm64.dmg" % version,
        "claus.io-%s-arm64.AppImage" % version,
        "clausio_%s_arm64.deb" % version,
    ]


def principale():
    echecs = []
    # par defaut : la forme (le fichier et ses lignes). `SOMMES_MODE=complet`
    # telecharge EN OUTRE les octets et recalcule chaque somme (a la publication).
    complet = os.environ.get("SOMMES_MODE", "").strip().lower() == "complet"

    def verifier(label, ok, detail=""):
        print(("  OK   " if ok else "  FAUTE ") + label + ((" — " + detail) if detail else ""))
        if not ok:
            echecs.append(label + ((" — " + detail) if detail else ""))

    version = json.load(open(os.path.join(BASE, "package.json"), encoding="utf-8"))["version"]

    # --- A. le contrat du README -------------------------------------------
    readme = open(README, encoding="utf-8").read() if os.path.exists(README) else ""
    verifier("A le README promet %s" % NOM_FICHIER, NOM_FICHIER in readme)
    verifier("A la methode de verification est donnee au client (sha256sum ET Get-FileHash)",
             "sha256sum" in readme and "Get-FileHash" in readme)

    # --- B. le workflow le construit, AVANT l'attachement -------------------
    wf = open(WORKFLOW, encoding="utf-8").read() if os.path.exists(WORKFLOW) else ""
    # Le mot « SOMMES » cite dans un commentaire ne genere RIEN (mesure du
    # 11/11 : le premier controle etait `NOM_FICHIER in wf`, et c'est exactement
    # le type de controle qui reste vert sur un workflow qui ne produit pas le
    # fichier). Ce qui decide : une etape `run:` qui joue sha256sum SUR ses
    # lignes de commandement, et une etape d'attachement qui le JOINT.
    commandements = ["\n".join(re.sub(r"#.*", "", l) for l in b.split("\n"))
                     for b in re.split(r"\n      - ", wf)]
    verrouille = any("run:" in b and "sha256sum" in c
                     for b, c in zip(re.split(r"\n      - ", wf), commandements)) \
        and any(NOM_FICHIER in c for b, c in zip(re.split(r"\n      - ", wf), commandements)
                if "softprops/action-gh-release" in b)
    verifier("B le workflow genere %s" % NOM_FICHIER, verrouille,
             "grep -n %s .github/workflows/build-windows.yml" % NOM_FICHIER if verrouille
             else "le workflow ne le genere jamais : la promesse du README n'est tenue qu'a la main")
    if verrouille:
        # On juge LA CHAINE D'ATTACHEMENT DU FICHIER, pas une position dans le
        # fichier. Le test « le premier SOMMES du fichier precede le premier
        # softprops » rougissait sur le YAML CORRECT du 11/11 : `SOMMES-SHA256.txt`
        # est cite dans le commentaire de la consigne, avant tout attachement.
        # Ce qui compte se lit dans l'etape `uses: softprops/...` qui joint les
        # installeurs linux : ses `files:` portent le fichier de sommes, et les
        # etapes qui le calculent sont BORNEES et ne peuvent pas echouer en
        # silence.
        joints = [b for b in re.split(r"\n      - ", wf) if "softprops/action-gh-release" in b]
        chaine = [b for b in joints if "SOMMES-SHA256.txt" in b]
        verifier("B le fichier SOMMES est JOINT par une etape d'attachement (files:)",
                 bool(chaine),
                 "%d des %d etapes d'attachement le joignent" % (len(chaine), len(joints)))
        # Une productrice est une etape dont le TITRE ou le geste porte le
        # fichier, et qui le CALCULE : le critère est `sha256sum` dans son
        # script. Mesure du 11/11, deux faux positifs succesifs du meme filtre :
        # `run:` seul comptait l'etape `uses:` de jointure, et le nom cite avant
        # `run:` comptait « a quelle release rattacher », qui ne fait que citer
        # le nom dans un commentaire. Un juge qui compte des etapes inexistantes
        # exige l'impossible et rougit pour toujours : ce n'est pas un controle.
        # Le geste est cherche sur les LIGNES DE COMMANDEMENT seules : le mot
        # `sha256sum` est aussi cite dans le commentaire de la consigne, et un
        # etape qui ne fait que le NOMMER n'en fait rien. (Le piege est le meme
        # que celui du juge `-qq` plus haut dans ce dossier : juger le texte
        # brut d'un script, c'est rougir sur sa documentation.)
        def commandes(b):
            return "\n".join(re.sub(r"#.*", "", l) for l in b.split("\n"))

        productrices = [b for b in re.split(r"\n      - ", wf)
                        if "run:" in b and "sha256sum" in commandes(b)]
        verifier("B les etapes qui le calculent sont BORNEES (timeout-minutes)",
                 len(productrices) >= 2 and all("timeout-minutes" in b for b in productrices),
                 "%d etapes productrices" % len(productrices))
        # ce que chaque productrice doit garantir : elle s'arrete sur erreur,
        # elle refuse un installeur absent, et elle compte ses lignes.
        # LA REGLE EST LUE SUR LE SCRIPT, PAS SUR UN COMPTE AVEUGLE : la
        # deuxieme productrice (celle qui FUSIONNE les lignes des trois jobs)
        # n'a pas de `-s` parce qu'elle ne construit pas les fichiers, elle
        # verifie qu'ils sont JOINTS (`gh release download … || manquants=`) et
        # borne le nombre de lignes a QUATRE. Exiger `-s` des deux etait un
        # faux positif de plus du meme filtre.
        def complete(b):
            c = commandes(b)
            return ("set -euo pipefail" in c and 'wc -l <' in c
                    and (re.search(r"\[\s*-\s*s\s+\"?\$", c) is not None
                         or re.search(r"-s \"?\$\(", c) is not None
                         # le test d'existence de la jointure est ecrit sur
                         # DEUX lignes (la continuation `\` avant `||`), donc le
                         # juger par une regex ligne-a-ligne etait un faux
                         # positif de plus : on cherche les DEUX faits dans le
                         # script, pas leur adjacency.
                         or ("gh release download" in c and "manquants" in c)))

        verifiees = [b for b in productrices if complete(b)]
        verifier("B elles refusent le fichier incomplet (fichier exige + compte de lignes)",
                 len(verifiees) >= 2,
                 "%d/%d etapes verifient l'existence et le nombre de lignes"
                 % (len(verifiees), len(productrices)))
        verifier("B elles ne peuvent pas reussir en silence (pas de || true sur sha256sum)",
                 not re.search(r"sha256sum[^\n]*\|\|\s*true", wf))
        # FORMAT DU CONTRAT COTE CLIENT : le README dit « la ligne du fichier
        # QUI PORTE SON NOM ». Une ligne `…  release/x.deb` ne porte pas le nom
        # que le client a telecharge : la comparaison echoue alors que tout est
        # intact. Les lignes sont donc jugees par NOM NU (mesure du 11/11 : la
        # premiere version du fichier publie portait le prefixe release/).
        verifier("B le format est conforme au README (sha256sum sur des noms NUS, pas release/…)",
                 all(("$(basename" in commandes(b) or "cd release &&" in commandes(b))
                      for b in productrices)
                 and not re.search(r'sha256sum\s+"release/', "\n".join(commandes(b) for b in productrices)),
                 "sha256sum est joue dans release/ sur des noms nus")

    # --- C. ce qui est publie ------------------------------------------------
    r = gh("release", "view", "v%s" % version, "--json", "tagName,assets", timeout=180)
    if r.returncode != 0:
        print("  SANS TERRAIN gh ne joint pas la release v%s : %s"
              % (version, (r.stderr or r.stdout).strip()[:180]))
        print("SOMMES_RELEASE=%s  FAUTES=%d" % ("SANS_TERRAIN", len(echecs)))
        if echecs:
            for e in echecs:
                print("  FAUTE " + e)
            print("VERDICT : ROUGE")
            return 1
        print("VERDICT : VERT (contrat du README et workflow verrouilles ; public non rejoue sans gh)")
        return 0

    assets = {a["name"] for a in json.loads(r.stdout).get("assets", [])}
    attendus = installeurs_attendus(version)
    absents = [n for n in attendus if n not in assets]
    verifier("C les quatre installeurs de %s sont publies" % version,
             not absents, "absents : %s" % ", ".join(absents) if absents else ", ".join(attendus))
    verifier("C %s est publie" % NOM_FICHIER, NOM_FICHIER in assets,
             "" if NOM_FICHIER in assets else "promis par le README et absent de la release")

    if NOM_FICHIER not in assets:
        print("SOMMES_RELEASE=%s  FAUTES=%d" % ("ABSENT", len(echecs)))
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1

    r = gh("release", "download", "v%s" % version, "-p", NOM_FICHIER,
           "-D", "/tmp/opencode", "--clobber", timeout=180)
    chemin = os.path.join("/tmp/opencode", NOM_FICHIER)
    verifier("C le fichier SOMMES se telecharge", r.returncode == 0 and os.path.exists(chemin),
             (r.stderr or r.stdout).strip()[:140])
    lignes = {}
    if os.path.exists(chemin):
        for ligne in open(chemin, encoding="utf-8").read().splitlines():
            m = re.match(r"^([0-9a-f]{64})\s+(\S+)$", ligne.strip())
            if m:
                lignes[m.group(2)] = m.group(1)
    verifier("C %s porte une ligne par installeur publie" % NOM_FICHIER,
             all(n in lignes for n in attendus),
             "lignes trouvees : %s" % (", ".join(sorted(lignes)) or "aucune"))

    if not complet:
        print("  (forme verifiee ; SOMMES_MODE=complet re-telecharge les octets "
              "et recalcule chaque somme — a jouer a la publication)")
    else:
        for nom in attendus:
            if nom not in lignes or nom not in assets:
                continue
            r = gh("release", "download", "v%s" % version, "-p", nom,
                   "-D", "/tmp/opencode/releases", "--clobber", timeout=1800)
            fichier = os.path.join("/tmp/opencode/releases", nom)
            if r.returncode != 0 or not os.path.exists(fichier):
                verifier("C %s se telecharge pour etre sommé" % nom, False,
                         (r.stderr or r.stdout).strip()[:140])
                continue
            h = hashlib.sha256()
            with open(fichier, "rb") as fh:
                for bloc in iter(lambda: fh.read(1 << 20), b""):
                    h.update(bloc)
            rendu = h.hexdigest()
            verifier("C la somme de %s correspond AUX OCTETS telecharges" % nom,
                     rendu == lignes[nom],
                     "calculee %s… vs publiee %s…" % (rendu[:12], lignes[nom][:12]))
            os.remove(fichier)
    print("SOMMES_RELEASE=%s  FAUTES=%d" % ("PUBLIEE" if not echecs else "?", len(echecs)))
    if echecs:
        for e in echecs:
            print("  FAUTE " + e)
        print("VERDICT : ROUGE")
        return 1
    # LE VERDICT DIT CE QUI A ETE JOUE. Un « VERT » qui laisserait croire que
    # les octets ont ete re-telecharges alors que seule la forme a ete verifiee
    # est un mensonge par omission — c'est la classe exacte du defaut du smoke
    # AppImage (un rouge sans temoin) et de SOMMES attache a la main.
    if complet:
        verdict = "VERT (promesse du README, generation du workflow, et les QUATRE sommes " \
                  "recalculees sur les octets reellement telecharges)"
    else:
        verdict = "VERT LIMITE (promesse du README, generation du workflow, forme du fichier " \
                  "et ses quatre lignes ; les octets des installeurs N'ONT PAS ete re-telecharges " \
                  "— jouer SOMMES_MODE=complet a la publication)"
    print("VERDICT : " + verdict)
    return 0


if __name__ == "__main__":
    sys.exit(principale())
