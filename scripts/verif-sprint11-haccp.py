#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verdit l'etat REEL du serveur apres patch (octets, jamais rendu) et rend la
liste des routes, des imports partages, et des restes a contracter.
Sert aussia de registre pour la morsure: les ancres de mutation y sont relevees
par compte (une ancre introuvable = ancre morte, la faute du 09/09)."""
import os, re, hashlib, sys
BASE = os.path.expanduser("~/cookdrive-project")
os.chdir(BASE)
RT = open("src/routes/haccp.ts", encoding="utf-8").read()
SH = open("src/shared/haccp-fields.ts", encoding="utf-8").read()

def sha(s): return hashlib.sha256(s.encode()).hexdigest()[:12]
print("HACCP octets=%d sha=%s" % (len(RT.encode()), sha(RT)))
print("SHARE octets=%d sha=%s" % (len(SH.encode()), sha(SH)))
print("import_partage=%d" % RT.count("haccp-fields.js"))

routes = re.findall(r'''router\.(get|post|delete)\("([^"]+)"''', RT)
print("routes_declarees=%d" % len(routes))
for m, c in routes:
    print("  %-6s %s" % (m.upper(), c))

# 1) ce qui a ete contracte: chaque route ciblee appelle-t-elle estRejete ?
CIBLES = ["/api/haccp/temperature", "/api/haccp/webhook/iot-report",
          "/api/haccp/iot-sensors", "/api/haccp/cleaning", "/api/haccp/production",
          "/api/haccp/batches", "/api/haccp/corrective-action"]
METHODE_CIBLE = {"POST /api/haccp/iot-sensors": ("post", "/api/haccp/iot-sensors")}
# Le span d'UNE ROUTE = de sa ligne (methode + chemin) a la ligne de la ROUTE
# SUIVANTE, pas au premier `find` du chemin: un chemin porte par un GET et un
# POST (iot-sensors, cleaning, batches) faisait juger le GET SANS contrat au
# lieu du POST contracte (verdit faux: 6/7, alors que 7/7).
_ROUTES = [(k, m.group(1).lower(), m.group(2))
           for k, l in enumerate(RT.splitlines())
           for m in [re.match(r'\s*router\.(get|post|delete|put)\("([^"]+)"', l)] if m]
SPAN = {}
for _n, (_k, _m, _c) in enumerate(_ROUTES):
    _fin = _ROUTES[_n + 1][0] if _n + 1 < len(_ROUTES) else len(RT.splitlines())
    SPAN[(_m, _c)] = chr(10).join(RT.splitlines()[_k:_fin])


def corps(methode, chemin):
    return SPAN.get((methode, chemin), "")


CIBLES_AVEC_METHODE = [("post", c) for c in CIBLES]
non_contractees = [("%s %s" % (m.upper(), c)) for (m, c) in CIBLES_AVEC_METHODE
                   if "estRejete(" not in corps(m, c)]
print("routes_contractees=%d/%d non=%s" % (len(CIBLES_AVEC_METHODE)-len(non_contractees),
                                            len(CIBLES_AVEC_METHODE), non_contractees))

# 2) les 3 regles qui devaient DISPARAITRE — jugees sur le CODE SEUL: les
#    commentaires documentent l'ancien defaut ("l'ancien corps faisait ...") et
#    ne sont pas une presence de code (piege du 09/09: conclure d'un compte sans
#    localiser). On retire les lignes dont l'enonce commence par // avant de compter.
CODE = chr(10).join(l for l in RT.splitlines() if not l.strip().startswith("//"))
def present_code(s): return CODE.count(s)
DISPARUS = {
  "if (token && sensor.webhook_token": 'if (token && sensor.webhook_token',
  "Math.random jeton": 'Math.random().toString(36).substring(2, 8)',
  "May already exist": 'May already exist',
  "for (const batchId of batch_ids) sans Array": 'for (const batchId of batch_ids)',
  "quantity || 0": 'quantity || 0',
}
for nom, s in DISPARUS.items():
    present = present_code(s)
    # le for..of est licite DESORMAIS sous un Array.isArray: on juge le bloc
    if nom.startswith("for"):
        b = corps(RT, "/api/haccp/production")
        present = 0 if ("Array.isArray(batch_ids)" in b and present >= 1) else present
    print("  %-46s restant=%d %s" % (nom, present, "OK" if present == 0 else "<< RESTE"))

# 3) les voies NON contractees doivent SURVIVRE (angle consigne, pas masque)
for t in ("/api/haccp/scan", "/api/haccp/documents/upload"):
    print("  survie %-32s %d" % (t, RT.count('"' + t + '"')))

# 4) transaction + clefs: les gardes qui portent le verdict
for t in ("BEGIN", "COMMIT", "ROLLBACK", "FROM recipes", "FROM batches", "FROM temperature_logs"):
    print("  garde %-24s %d" % (t, RT.count(t)))

# 5) ancres de la morsure (comptes, sinon ancre morte)
ANCHRES = {
  "M1": ("src/routes/haccp.ts", "tempVal === undefined"),
  "M2": ("src/routes/haccp.ts", "return res.status(403).json({ error: \"Jeton de webhook requis.\" });"),
  "M3": ("src/routes/haccp.ts", "if (!Array.isArray(batch_ids) || batch_ids.length === 0)"),
  "M4": ("src/routes/haccp.ts", '"UNKNOWN"'),
  "M5": ("src/routes/haccp.ts", 'if (zone === undefined) return res.status(400).json(estRejete(["zone_name"]));'),
  "M6": ("src/routes/haccp.ts", "SELECT id FROM temperature_logs WHERE id = ?"),
  "M7": ("src/routes/haccp.ts", "return res.status(409).json"),
  "M8": ("src/routes/haccp.ts", "estNombreExploitable(b, 0, 100)"),
  # les DEUX regles du Sprint 11 (fin): la provenance d'une releve du chef est
  # DECLAREE PAR LE SERVEUR et un appelant qui la PORTE est refuse; la date du
  # lot n'a plus de repli TEXTE. Sans ces ancres, la porte de verdit ne pouvait
  # pas voir ces deux regles disparaitre.
  "M9": ("src/routes/haccp.ts", 'if (entry_type !== undefined) refus.push("entry_type");'),
  "M10": ("src/routes/haccp.ts", "const echeance = dateISO(expiration_date);"),
}
print("ANCHRES_MORSURE:")
for k, (f, a) in ANCHRES.items():
    c = open(f, encoding="utf-8").read().count(a)
    print("  %-3s %s %s" % (k, "OK " if c == 1 else "ROUGE", "compte=%d" % c))
sys.exit(1 if any(open(f).read().count(a) != 1 for f, a in ANCHRES.values()) else 0)
