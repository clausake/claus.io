#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Joue les orphelines C4 une a une et COMPTE LES VERDICTS AVEC L'IDIOME PROPRE
de chaque harnais.

Pourquoi pas un regex unique : chaque sonde emet son verdict dans sa propre
forme (cles `label  {json}` pour les sondes sqlite, `RESULTATS K=V ...` pour
les sondes de contrat, `### voie` + `status_http=` pour les sondes de VOIES
reelles, `[N1]/[N2]` + `RESULTAT :` pour la preuve negative). Un compte-rendu
unique rendrait « 0 verdicts » sur une sonde qui en rend sept : c'est l'angle
mort du capteur, pas une absence de mesure (regle 2 d'AGENTS.md).

Le capteur prouve qu'il est VIVANT de trois facons :
  A. un TEMOIN DE VIE par sonde : une chaine qu'on SAIT presente dans sa sortie
     quand elle s'est jouee. Absente => le capteur est mort, et le compte ne
     vaut rien (il n'est jamais rendu comme « 0 verdicts ») ;
  B. une AUTO-CONTROLE DU COMPTEUR sur une sortie ou l'on sait ce qui doit etre
     compte (le fichier .log deja consigne d'une course precedente, ou un
     echantillon de reference) : un compteur qui rend 0 sur une sortie qui
     porte 8 jetons est signale CAPTEUR MORT, pas « absence » ;
  C. le compte de l'idiome est confronte au nombre de lignes non vides : un
     verdict a zero sur une sortie de 60 lignes est un doute du capteur.

Les seuils `attendu_mini` sont des MESURES consignees (le nombre reel de
verdicts rendus par chaque sonde sur le serveur de ce poste), pas des vœux.

Lancement :
  python3 scripts/_joue_orphelines.py                 # les huit orphelines
  python3 scripts/_joue_orphelines.py probe-x.mjs     # une seule
  python3 scripts/_joue_orphelines.py --depuis LOG    # re-compter un log
"""
import os
import re
import signal
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(BASE, "test")

ORPHELINES = [
    "probe-binding-undefined.mjs",
    "probe-consume-semantiques.mjs",
    "probe-number-statics.mjs",
    "probe-documents-validate-contract.mjs",
    "probe-inventory-put-partial.mjs",
    "probe-post-inventory-voices.mjs",
    "probe-dashboard-voices.mjs",
    "negative-test-verify-indices.py",
]

CLE_SQLITE = re.compile(r"^[a-z][a-z_0-9]*\s+\S.*$", re.M)
JETON_KV = re.compile(r"(?<![A-Za-z_0-9])[A-Z][A-Za-z_0-9]*=[^\s]+")
BLOC_VOIE = re.compile(r"^### .+$", re.M)
LIGNE_HTTP = re.compile(r"^\s*status_http=\d+", re.M)
LIGNE_TRANCHER = re.compile(r"^\s*TRANCHER:", re.M)
LIGNE_N12 = re.compile(r"^\[N[12]\]", re.M)

# Idiomes declares par sonde LUE (octets relus), et non devines.
IDIOMES = {
    "probe-binding-undefined.mjs": {
        "compteurs": [("cle de verdict `label  valeur`", CLE_SQLITE)],
        "temoin": "update_undefined_nullable",
        "attendu_mini": 8,
        "verdicts_nommes": ["NULL", "NOT NULL constraint failed", "\"t\":\"text\""],
    },
    "probe-consume-semantiques.mjs": {
        "compteurs": [("cle de verdict `label  valeur`", CLE_SQLITE)],
        "temoin": "apres_rollback",
        "attendu_mini": 15,
        "verdicts_nommes": ["\"changes\":0", "\"q\":5", "NOT NULL constraint failed"],
    },
    "probe-number-statics.mjs": {
        "compteurs": [("jeton `K=V`", JETON_KV)],
        "temoin": "N_isNaN=function",
        "attendu_mini": 17,
        "verdicts_nommes": ["refus:true", "elig:true", "refus:false"],
    },
    "probe-documents-validate-contract.mjs": {
        "compteurs": [("jeton `K=V`", JETON_KV)],
        "temoin": "D1_ELUE=",
        "attendu_mini": 15,
        "verdicts_nommes": ["D1_BADGE_VERIFIE=", "D4_BLANC_CREE_UN_FOURNISSEUR="],
    },
    "probe-inventory-put-partial.mjs": {
        "compteurs": [("jeton `K=V`", JETON_KV)],
        "temoin": "S1_CODE=",
        "attendu_mini": 14,
        "verdicts_nommes": ["S2_QUANT_TYPE=", "S3_STATUT=", "S4_RELECTURE="],
    },
    "probe-post-inventory-voices.mjs": {
        "compteurs": [("bloc `### voie`", BLOC_VOIE), ("ligne `status_http=`", LIGNE_HTTP)],
        "temoin": "SONDE JOUEE",
        "attendu_mini": 9,
        "verdicts_nommes": ["ligne_en_base=", "reponse_recite="],
    },
    "probe-dashboard-voices.mjs": {
        "compteurs": [("bloc `### voie`", BLOC_VOIE), ("ligne `TRANCHER:`", LIGNE_TRANCHER)],
        "temoin": "SONDE JOUEE",
        "attendu_mini": 12,
        "verdicts_nommes": ["status_http="],
    },
    "negative-test-verify-indices.py": {
        "compteurs": [("verdict `[N1]/[N2]`", LIGNE_N12), ("ligne `RESULTAT`", re.compile(r"^RESULTAT", re.M))],
        "temoin": "le garde mord",
        "attendu_mini": 2,
        "verdicts_nommes": ["controle des filtres"],
    },
}


def cmd_of(f):
    # `-u` n'existe QUE pour Python (node n'a pas d'equivalent : console.log
    # vide son tampon a chaque appel). Le passer a node fit echouer la course
    # d'un `node: bad option: -u`rc=9 -- et sans le temoin de vie, le capteur
    # a dit « capteur mort » au lieu d'un faux « 0 verdicts » : c'est le
    # comportement attendu, mais la cause etait dans l'appel, pas dans la sonde.
    if f.endswith(".mjs"):
        return ["node", os.path.join("scripts", f)]
    return [sys.executable, "-u", os.path.join("scripts", f)]


def tuer_arbre(p):
    """Filet du conducteur : le groupe entier de la course, fils tsx compris.

    Un `subprocess.run(..., timeout=N)` tue la commande directe, PAS les
    petits-fils qu'elle a detaches : la course bloquee de ce soir a laisse un
    `tsx server.ts` tenir le port 4177 pendant vingt minutes apres la fin de
    la course, et c'est ce fils remanant qui a fait TIMEOUT la sonde suivante
    (un verdict qui n'etait pas celui du produit)."""
    for sig in ("SIGTERM", "SIGKILL"):
        try:
            os.killpg(p.pid, getattr(signal, sig))
        except (ProcessLookupError, PermissionError, OSError):
            pass
        else:
            try:
                p.wait(timeout=5)
                return
            except subprocess.TimeoutExpired:
                continue


def rendre(f, spec, rc, txt, source):
    """Rend le compte d'une course, avec les trois preuves du capteur."""
    lignes = [l for l in txt.split("\n") if l.strip()]
    vivant = spec["temoin"] in txt
    comptes = [(nom, rx.findall(txt)) for nom, rx in spec["compteurs"]]
    noms = [v for v in spec["verdicts_nommes"] if v in txt]
    print("\n===== %s  (%s)  rc=%s" % (f, source, rc))
    print("      lignes_sortie=%d octets=%d" % (len(lignes), len(txt.encode("utf-8"))))
    for nom, ms in comptes:
        marque = "CAPTEUR MORT" if (not ms and len(lignes) > 3) else "     "
        print("      %-30s -> %3d  %s" % (nom, len(ms), marque))
    print("      temoin_vivant=%s  verdicts_nommes=%d/%d  attendu_mini=%d"
          % ("OUI" if vivant else "NON", len(noms), len(spec["verdicts_nommes"]),
             spec["attendu_mini"]))
    if not noms:
        print("      DETAIL (10 premieres lignes non vides) :")
        for l in lignes[:10]:
            print("        | " + l[:150])
    maxc = max([len(ms) for _, ms in comptes] or [0])
    if not lignes:
        return "SORTIE VIDE (regle 2 : ce n'est pas une absence, c'est un defaut de lecture)"
    if not vivant:
        return "TEMOIN ABSENT -> capteur mort sur cette sonde, verdict non rendu"
    if maxc < spec["attendu_mini"]:
        return "SOUS LE SEUIL MESURE (%d < %d) -> re-mesurer, ne pas retirer" % (maxc, spec["attendu_mini"])
    if rc != 0:
        return "RC NON NUL (%d) -> a qualifier" % rc
    return "JOUEE, %d verdicts comptes" % maxc


def main():
    args = sys.argv[1:]
    if args and args[0] == "--depuis":
        # re-compter un log consigne, sans rejouer la course
        log = args[1]
        f = os.path.basename(log).replace("orpheline-", "", 1)
        f = f[:-4] if f.endswith(".log") else f
        spec = IDIOMES.get(f)
        if spec is None:
            print("PAS D'IDIOME DECLARE pour %s -> abstention" % f)
            return 2
        txt = open(log, encoding="utf-8").read()
        return 0 if rendre(f, spec, 0, txt, "log consigne").startswith("JOUEE") else 1

    cibles = args or ORPHELINES
    os.makedirs(OUTDIR, exist_ok=True)
    bilans = []
    for f in cibles:
        spec = IDIOMES.get(f)
        if spec is None:
            bilans.append((f, "PAS D'IDIOME DECLARE -> abstention (jamais « 0 »)"))
            continue
        log = os.path.join(OUTDIR, "orpheline-%s.log" % f)
        # Popen + start_new_session : le groupe entier est tuable au timeout.
        # subprocess.run ne tue que le fils direct (regle du module subprocess),
        # et le petit-fils tsx detache lui survit : c'est lui qui a empoisonne
        # la course suivante ce soir.
        try:
            p = subprocess.Popen(cmd_of(f), cwd=BASE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True,
                                 start_new_session=True)
            try:
                so, se = p.communicate(timeout=int(os.environ.get("SONDE_TIMEOUT", "1200")))
                txt = (so or "") + (se or "")
                rc = p.returncode
                termine = True
            except subprocess.TimeoutExpired:
                tuer_arbre(p)
                try:
                    so, se = p.communicate(timeout=15)
                except subprocess.TimeoutExpired:
                    so = se = ""
                txt = (so or "") + (se or "")
                rc = 124
                termine = False
        except OSError as e:
            bilans.append((f, "INJOUABLE: %s" % e))
            continue
        with open(log, "w", encoding="utf-8") as fh:
            fh.write(txt)
        rendu = rendre(f, spec, rc, txt, "course")
        if not termine:
            rendu = "TIMEOUT (rc=124, arbre tue) | " + rendu
        bilans.append((f, rendu))

    print("\n" + "=" * 72)
    n_ok = 0
    for f, v in bilans:
        print("%-42s %s" % (f, v))
        n_ok += v.startswith("JOUEE")
    print("JOUEES=%d/%d" % (n_ok, len(bilans)))
    sys.stdout.flush()
    return 0 if n_ok == len(bilans) else 1


if __name__ == "__main__":
    sys.exit(main())
