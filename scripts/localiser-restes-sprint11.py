#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LOCALISE (et non: compte) les chaines signalees « RESTE » par
verif-sprint11-haccp.py, avec numerotation et la ROUTE qui les porte.
Regle du depot: une presence/absence se tranche par localisation dans les
octets, pas par un compte qui ne dit pas OU."""
import os, re
BASE = os.path.expanduser("~/cookdrive-project")
os.chdir(BASE)
lines = open("src/routes/haccp.ts", encoding="utf-8").read().splitlines()

def route_de(i):
    for j in range(i, -1, -1):
        m = re.search(r'''router\.(get|post|delete|put)\("([^"]+)"''', lines[j])
        if m: return "%s %s @L%d" % (m.group(1).upper(), m.group(2), j + 1)
    return "?"

CHAINES = ["if (token && sensor.webhook_token",
           "Math.random().toString(36).substring(2, 8)",
           "quantity || 0",
           'refus.push("zone_name")',
           "sensor.webhook_token !== token",
           "Jeton de webhook requis"]
for c in CHAINES:
    occ = [i for i, l in enumerate(lines) if c in l]
    print("### %r -> %d occurrence(s)" % (c[:52], len(occ)))
    for i in occ:
        print("     L%-4d [%s]" % (i + 1, route_de(i)))
        print("        %s" % lines[i].strip()[:130])

# etat reel du bloc nettoyage et du registre (ce que la morsure devra muter)
print()
for nom, ancre in (("h4-nettoyage", '"/api/haccp/cleaning"'), ("h1-registre", '"/api/haccp/iot-sensors"')):
    i = next(k for k, l in enumerate(lines) if ancre in l and "post(" in l.replace(" ", ""))
    print("--- %s (des L%d) ---" % (nom, i + 1))
    for k in range(i, min(i + 26, len(lines))):
        print("   %4d| %s" % (k + 1, lines[k][:150]))
        if k > i and re.match(r"router\.", lines[k].strip()): break
