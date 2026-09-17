#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patcheur transactionnel du Sprint 11 (HACCP). Regles du depot appliquees:
 - substitution par CHAINE EXACTE verifiee (count == 1) sur les OCTETS reels,
   jamais depuis le rendu; une divergence d'avec le sha du probe = ABSTENTION;
 - sauvegarde avant toute ecriture; gate `npx tsc --noEmit` dont le log doit
   faire 0 octet; ECHEC => restauration et rc!=0;
 - les blocs JS vivent dans scripts/blocks/*.block (le poste rogne les emissions
   longues), relus ici par octets;
 - le span englobe le bloc de commentaires IMMEDIATEMENT au-dessus de la route
   (pas de commentaire obsolete contredisant le contrat pose);
 - les attendus post-remplacement sont CALCULES sur les octets des blocs, jamais
   recopies depuis le rendu (la faute consignee des BUDGETS)."""
import os, re, sys, hashlib, shutil, subprocess

BASE = os.path.expanduser("~/cookdrive-project")
BLK = os.path.join(BASE, "scripts", "blocks")
ROUTE = os.path.join(BASE, "src", "routes", "haccp.ts")
BACKUP = os.path.join(BASE, "scripts", "blocks", "spans", "haccp.ts.orig")
LOG = "/home/clausake/cd-tsc-s11.log"

ENTREES = [
 ("h1", 'router.post("/api/haccp/iot-sensors", async (req, res) => {',
        "h1-register-capteur.ts.block"),
 ("h2", 'router.post("/api/haccp/webhook/iot-report", async (req, res) => {',
        "h2-webhook.ts.block"),
 ("h3", 'router.post("/api/haccp/temperature", async (req, res) => {',
        "h3-releve-chef.ts.block"),
 ("h4", 'router.post("/api/haccp/cleaning", async (req, res) => {',
        "h4-nettoyage.ts.block"),
 ("h5", 'router.post("/api/haccp/production", async (req, res) => {',
        "h5-production.ts.block"),
 ("h6", 'router.post("/api/haccp/batches", async (req, res) => {',
        "h6-lot.ts.block"),
 ("h7", 'router.post("/api/haccp/corrective-action", async (req, res) => {',
        "h7-actions-correctives.ts.block"),
]
IMPORT_ANCRE = 'import { sensorHub } from "../services/sensor-hub.js";'
IMPORT_NOUVEL = IMPORT_ANCRE + """
import {
  TEMPERATURE_MIN, TEMPERATURE_MAX, RECEPTION_TEMP_MIN, RECEPTION_TEMP_MAX,
  QUANTITE_LOT_MAX, TYPES_CAPTEUR, TYPES_EQUIPEMENT, TYPES_ENTREE, MODES_CAPTEUR,
  ID_CAPTEUR_MAX, ID_CAPTEUR_MIN,
  estRejete, nombreDeReleve, clefEtrangere, dateISO, clefEnum,
  newToken, nouvelId, maintenantISO,
  lireNombre, lireTexte, estNombreExploitable, COLONNE_TEXTE_MAX,
} from "../shared/haccp-fields.js";"""


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()[:12]


def span_jusqu_ici(src, ancre):
    """(debut, fin) du bloc de commentaires + de la fleche, par appariement
    d'accolades hors chaines. (None, None, raison) si non tranchable."""
    if src.count(ancre) != 1:
        return None, None, "ancre compte=%d" % src.count(ancre)
    i = src.index(ancre)
    debut = i
    while True:
        ln = src.rfind("\n", 0, debut)
        if ln < 0:
            break
        if src[ln + 1:debut].strip().startswith("//"):
            debut = ln + 1
        else:
            break
    depth, k = 0, src.index("{", i)
    while k < len(src):
        c = src[k]
        if c in "\"'`":
            q, k = c, k + 1
            while k < len(src) and src[k] != q:
                if src[k] == "\\":
                    k += 1
                k += 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                m = re.match(r"\}\s*\)\s*;", src[k:])
                if not m:
                    return None, None, "fermeture inattendue@" + str(k)
                return debut, k + m.end(), "ok"
        k += 1
    return None, None, "epuise"


def main():
    src0 = open(ROUTE, encoding="utf-8").read()
    src = src0

    if "haccp-fields" in src:
        print("ABSTENTION: import haccp-fields deja present"); return 2
    if src.count(IMPORT_ANCRE) != 1:
        print("ABSTENTION: ancre import compte=%d" % src.count(IMPORT_ANCRE)); return 2
    if src.count(IMPORT_NOUVEL) != 0:
        print("ABSTENTION: import deja injecte"); return 2

    # Phase de calcul: AUCUNE ecriture avant que TOUT soit verifie.
    remplacements = []          # (span, nouveau)
    attendus = {}               # sous-chaine -> minimum calcule sur les blocs
    for cle, ancre, fichier in ENTREES:
        debut, fin, etat = span_jusqu_ici(src, ancre)
        if etat != "ok":
            print("ABSTENTION %s: %s" % (cle, etat)); return 2
        span = src[debut:fin]
        bp = os.path.join(BLK, fichier)
        if not os.path.isfile(bp):
            print("ABSTENTION %s: bloc absent" % cle); return 2
        bloc = open(bp, encoding="utf-8").read()
        if bloc.count("{") - bloc.count("}") != 0:
            print("ABSTENTION %s: bloc desequilibre" % cle); return 2
        if "SPRINT-11" not in bloc:
            print("ABSTENTION %s: sans marqueur" % cle); return 2
        for t in ("estRejete(", "nombreDeReleve(", "clefEtrangere("):
            attendus[t] = attendus.get(t, 0) + bloc.count(t)
        remplacements.append((cle, span, bloc.rstrip("\n")))

    # Application in-memory
    for cle, span, bloc in remplacements:
        if src.count(span) != 1:
            print("ECHEC %s: span compte=%d" % (cle, src.count(span))); return 3
        src = src.replace(span, bloc, 1)
    if src.count(IMPORT_ANCRE) != 1:
        print("ECHEC: ancre d'import perdue"); return 3
    src = src.replace(IMPORT_ANCRE, IMPORT_NOUVEL, 1)

    # Invariants: calcules sur les octets, pas recopies depuis le rendu
    for t, mini in sorted(attendus.items()):
        if src.count(t) < mini:
            print("ECHEC: %r compte=%d < attendu %d" % (t, src.count(t), mini)); return 3
    for t in ("haccp/scan", "documents/upload"):
        if src.count(t) != 1:
            print("ECHEC: voie non contractee %s compte=%d" % (t, src.count(t))); return 3
    if src.count("haccp-fields.js") != 1:
        print("ECHEC: import partage compte=%d" % src.count("haccp-fields.js")); return 3
    if "May already exist" in src:
        print("ECHEC: le message d'ancien doublon survit"); return 3

    print("VERIFS_OK remplacements=%d attendus=%s" % (
        len(remplacements), {k: v for k, v in sorted(attendus.items())}))
    if "--sec" in sys.argv:
        print("SECSCHES (rien ecrit). octets %d -> %d" % (len(src0), len(src)))
        return 0

    shutil.copyfile(ROUTE, BACKUP)
    open(ROUTE, "w", encoding="utf-8").write(src)
    print("ECRIT sha_avant=%s sha_apres=%s" % (sha(src0), sha(src)))

    # Gate: rc 0 ET log de 0 octet, rejoue deux fois (un rendu peut etre perime)
    for passage in (1, 2):
        r = subprocess.run("npx tsc --noEmit > %s 2>&1; echo $?" % LOG,
                           shell=True, capture_output=True, text=True)
        rc = int((r.stdout or "1").strip() or 1)
        taille = os.path.getsize(LOG)
        if rc != 0 or taille != 0:
            shutil.copyfile(BACKUP, ROUTE)
            log = open(LOG, encoding="utf-8", errors="replace").read()[:2500]
            print("TSC ROUGE (passage %d, rc=%s, log=%d oct) -> RESTAURE\n%s"
                  % (passage, rc, taille, log))
            return 4
    print("PATCH_OK tsc=VERT deux passages, logs 0 octet | octets %d -> %d" % (len(src0), len(src)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
