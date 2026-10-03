#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sort EN OCTETS EXACTS les segments d'harnais qui postent sur les routes HACCP
que le Sprint 11 va durcir. But: aucun verrou ne doit faire rougir verify:indices
ou audit:perf pour une autre raison que la sienne (regle du depot: juger avec le
payload que l'appelant reel emet). On ecrit dans un fichier, pas dans le rendu
(qui mute les identifiants sur ce poste)."""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CIBLES = [
    ("scripts/audit-perf.mjs", 52, 92, "audit-perf-segment.txt"),
    ("scripts/ab-indices.py", 36, 70, "ab-indices-segment.txt"),
    ("scripts/verify-http.mjs", 170, 215, "verify-http-segment.txt"),
    ("scripts/verify-sse.mjs", 148, 200, "verify-sse-segment.txt"),
]
OUTDIR = os.path.join(BASE, "scripts", "blocks")
os.makedirs(OUTDIR, exist_ok=True)
for src, a, b, out in CIBLES:
    t = open(os.path.join(BASE, src), encoding="utf-8", errors="replace").read().splitlines()
    with open(os.path.join(OUTDIR, out), "w", encoding="utf-8") as fh:
        fh.write("// %s lignes %d-%d\n" % (src, a + 1, b))
        for i in range(a, min(b, len(t))):
            fh.write("%4d| %s\n" % (i + 1, t[i]))
    print("ECRIT scripts/blocks/%s (%d lignes)" % (out, min(b, len(t)) - a))
