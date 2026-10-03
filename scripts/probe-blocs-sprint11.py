#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verdit les 7 blocs du Sprint 11 par OCTETS (le rendu du poste mute les
identifiants: un bloc rendu 'art) {' n'est pas un verdict), et prepare le
remplacement transactionnel en extrayant les 7 PORTIONS anciennes par
appariement d'accolades.

Rend uniquement des lignes de chiffres + des predicats booleens: ce qui est
affiche ici est ce qui a ete compte dans le noyau, pas ce qui est affiche a
l'ecran."""
import os, re, json, hashlib

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLK = os.path.join(BASE, "scripts", "blocks")
ROUTE = os.path.join(BASE, "src", "routes", "haccp.ts")
RT = open(ROUTE, encoding="utf-8").read()

BLOCS = {
    "h1": ('router.post("/api/haccp/iot-sensors", async (req, res) => {', "h1-register-capteur.ts.block",
            ['"INSERT INTO iot_sensors', "May already exist"]),
    "h2": ('router.post("/api/haccp/webhook/iot-report", async (req, res) => {', "h2-webhook.ts.block",
            ["if (token && sensor.webhook_token", "Invalid token", "INSERT INTO temperature_logs"]),
    "h3": ('router.post("/api/haccp/temperature", async (req, res) => {', "h3-releve-chef.ts.block",
            ["INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode) VALUES"]),
    "h4": ('router.post("/api/haccp/cleaning", async (req, res) => {', "h4-nettoyage.ts.block",
            ["INSERT INTO cleaning_records"]),
    "h5": ('router.post("/api/haccp/production", async (req, res) => {', "h5-production.ts.block",
            ["INSERT INTO production_records", "for (const batchId of batch_ids)"]),
    "h6": ('router.post("/api/haccp/batches", async (req, res) => {', "h6-lot.ts.block",
            ["INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url, quantity"]),
    "h7": ('router.post("/api/haccp/corrective-action", async (req, res) => {', "h7-actions-correctives.ts.block",
            ["INSERT INTO corrective_actions"]),
}

def extraire(src, ancre):
    """La portion complete: de l'ancre jusqu'a la fermeture '});' qui solde
    l'accolade de la fleche. Appariement par compte d'accolades hors chaines."""
    i = src.find(ancre)
    if i < 0: return None, "ANCRE_ABSENTE"
    j = src.index("{", i)
    depth, k = 0, j
    while k < len(src):
        c = src[k]
        if c in "\"'`":
            q = c; k += 1
            while k < len(src) and src[k] != q:
                if src[k] == "\\": k += 1
                k += 1
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                m = re.match(r"\}\s*\)\s*;", src[k:])
                if not m: return None, "FERMETURE_INATTENDUE@" + str(k)
                return src[i:k + m.end()], "ok"
        k += 1
    return None, "EPUISEE"

verdict = {}
spans = {}
for cle, (ancre, nom, signatures) in BLOCS.items():
    ancien, etat = extraire(RT, ancre)
    bp = os.path.join(BLK, nom)
    existe = os.path.isfile(bp)
    nouveau = open(bp, encoding="utf-8").read() if existe else ""
    ob = len(nouveau.encode())
    tete = nouveau.split(chr(10))[0][:34] if nouveau else ""
    bal = nouveau.count("{") - nouveau.count("}")
    # un bon bloc: 1 declaration de route, accolades equilibrees, aucune des
    # formes corrompues observees au rendu, et SA signature d'ecriture presente
    sig_ok = all(s in nouveau for s in signatures) if nouveau else False
    declare = len(re.findall(r"router\.(post|get)\(", nouveau))
    corrompu = bool(re.search(r"^\s*(art\)|[a-z]\) \{)", nouveau))
    verdict[cle] = dict(old_etat=etat, old_octets=(len(ancien.encode()) if ancien else -1),
                        bloc_octets=ob, balancier=bal, decl=declare, signatures_ok=sig_ok,
                        corrompu=corrompu, tete=tete)
    if ancien: spans[cle] = ancien

for c in sorted(verdict):
    v = verdict[c]
    bon = (v["old_etat"] == "ok" and v["bloc_octets"] > 200 and v["balancier"] == 0
           and v["signatures_ok"] and not v["corrompu"] and v["decl"] >= 1)
    print("%s %-4s old=%-6s new=%-6s bal=%s decl=%s sig=%s corr=%s %s" % (
        "OK " if bon else "PBM", c, v["old_octets"], v["bloc_octets"], v["balancier"],
        v["decl"], v["signatures_ok"], v["corrompu"], v["tete"]))

# ce qui doit rester intact: les voies NON contractees de cette trancheee
for t in ["haccp/scan", "documents/upload", "corrective-actions"]:
    print("EN Place  %-18s %s" % (t, RT.count(t)))
# imports deposes + risque de collision de nom avec middleware/validate.ts
print("imports haccp.ts:")
for l in RT.splitlines()[:14]:
    if l.startswith("import"): print("   ", len(l), "ch  ", l[-46:])
print("collisions estRejete/optionalString dans haccp.ts:",
      len(re.findall(r"\bestRejete\b", RT)), len(re.findall(r"\boptionalString\b", RT)))
print("assertion 'May already exist' dans les specs:",
      sum(1 for f in os.listdir(os.path.join(BASE, "test", "e2e"))
          if "May already" in open(os.path.join(BASE, "test", "e2e", f), encoding="utf-8", errors="replace").read()))

os.makedirs(os.path.join(BASE, "scripts", "blocks", "spans"), exist_ok=True)
json.dump({k: {"octets": len(v.encode()), "sha": hashlib.sha256(v.encode()).hexdigest()[:12]}
           for k, v in spans.items()},
          open(os.path.join(BASE, "scripts", "blocks", "spans", "index.json"), "w"), indent=1)
for k, v in spans.items():
    open(os.path.join(BASE, "scripts", "blocks", "spans", k + ".old.ts"), "w", encoding="utf-8").write(v)
print("SPANS_ECITS=%d" % len(spans))
