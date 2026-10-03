#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Avant d'ecrire le patcheur: prouver que la nouvelle porte est BIEN dans le
program compile (un tsc vert sur un fichier exclu est un PASS creux) et que
CHACUNE de mes ancres de substitution est UNIQUE (count==1), sinon abstention.

On ne fait confiance ni au rendu (qui mute les identifiants sur ce poste) ni au
rc seul: la liste des fichiers du program vient de tsc --listFiles et le compte
d'occurences vient des octets du fichier."""
import os, re, subprocess, json

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE)

r = subprocess.run(["npx", "tsc", "--noEmit", "--listFiles"], capture_output=True, text=True)
out = r.stdout + r.stderr
fich = [l.strip() for l in out.splitlines() if "haccp-fields" in l or "inventory-fields" in l]
print("TSC_RC=%d" % r.returncode)
print("PORTES partagees DANS le program:")
for l in fich:
    print("   ", os.path.basename(l), "| chemin:", l[-58:])
print("haccp-fields_in_program =", any("haccp-fields" in l for l in fich))

ts = open("tsconfig.json", encoding="utf-8").read()
print("\ntsconfig include:", re.findall(r'"include"\s*:\s*\[([^\]]*)\]', ts, re.S)[:1])
print("tsconfig exclude:", re.findall(r'"exclude"\s*:\s*\[([^\]]*)\]', ts, re.S)[:1])

# --- uniquesses des ancres prevues ------------------------------------------
ANCH = {
    "src/routes/haccp.ts": [
        'router.post("/api/haccp/temperature", async (req, res) => {',
        'router.post("/api/haccp/webhook/iot-report", async (req, res) => {',
        'router.post("/api/haccp/iot-sensors", async (req, res) => {',
        'router.post("/api/haccp/cleaning", async (req, res) => {',
        'router.post("/api/haccp/production", async (req, res) => {',
        'router.post("/api/haccp/batches", async (req, res) => {',
        'router.post("/api/haccp/corrective-action", async (req, res) => {',
        'router.get("/api/haccp/corrective-actions"',
        'const token = "token_" + Math.random()',
        '"SELECT * FROM iot_sensors"\n',
        'import fs from "fs";',
    ],
    "server.ts": [
        'fs.mkdirSync(uploadsDir, { recursive: true });',
        'express.static(distPath, {',
        '"/uploads',
    ],
}
res = {}
for f, ancres in ANCH.items():
    src = open(f, encoding="utf-8").read()
    for a in ancres:
        key = "%s :: %s" % (f, a[:62].replace(chr(10), "\\n"))
        res[key] = src.count(a)
print("\nCOMPTE D'OCCURENCES DES ANCRES:")
for k, v in res.items():
    marque = "" if v == 1 else ("  <<< ABSTENTION (0 ou >1)" if v != 1 else "")
    print("   %d  %s%s" % (v, k, marque))
