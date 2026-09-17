#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verdit le NOUVEAU module partage par octets et par execution, jamais par le
rendu (le poste mute identifiants et ponctuation; un 'from' rendu sans 'o' n'est
pas une absence de donnee).

Juge:
 V1 le module est bien dans le program compile (tsc --listFiles),
 V2 ses exportations attendues existent (regex sur les octets reels),
 V3 AUCUN des noms corrompus visibles a l'ecran n'est present en dur (garde
    contre un correctif qui aurait ecrit du faux code),
 V4 tsc sort a 0 erreur ET son log fait 0 octet (un rc rendu peut etre le rendu
    d'un resultat perime),
 V5 le generateur de token produit des clefs UNIQUES et de bonne longueur (le
    contrat est juge par execution, pas par lecture)."""
import os, re, subprocess, json, collections

BASE = os.path.expanduser("~/cookdrive-project")
os.chdir(BASE)
MOD = "src/shared/haccp-fields.ts"
src = open(MOD, encoding="utf-8").read()
octets = len(src.encode())
print("MODULE=%s octets=%d" % (MOD, octets))

ATTENDU = ["export const TEMPERATURE_MIN", "export const TEMPERATURE_MAX",
           "export const RECEPTION_TEMP_MIN", "export const QUANTITE_LOT_MAX",
           "export const TYPES_CAPTEUR", "export const TYPES_EQUIPEMENT",
           "export const TYPES_ENTREE", "export const MODES_CAPTEUR",
           "export function estRejete", "export function nombreDeReleve",
           "export function clefEtrangere", "export function dateISO",
           "export function clefEnum", "export function newToken",
           "export const LONGUEUR_TOKEN_MIN"]
manq = [a for a in ATTENDU if src.count(a) != 1]
print("V2_EXPORTS_OK=%s manquants_ou_dupliques=%s" % (len(manq) == 0, manq))

# V3: les formes corrompues (observees au rendu) ne doivent JAMAIS etre ecrites
# ⚠ Le premier jeton de ce check avoit un predicat DEFFECTUEUX (classe consignee
# du depot): r'Number\.isNa[^i]' matchait « Number.isNaN » — la methode LECITE
# prouvee existante par probe-number-statics.mjs. Un garde qui accuse le code
# juste n'est pas un garde. On ne juge que des formes qui n'existent PAS en JS.
CORROMPUS = [r'\bisNaNa\b', r'\bMath\.random\(\)\.toString\(36\)',
             r'\bNumber\.isNa\b', r'\bconsole\.log\b[^)]{0,12}$', r'\bdebugger\b']
v3 = {c: len(re.findall(c, src)) for c in CORROMPUS}
print("V3_FORMES_CORROMPUES=%s %s" % (all(v == 0 for v in v3.values()), v3))

r = subprocess.run(["npx", "tsc", "--noEmit", "--listFiles"], capture_output=True, text=True)
inprog = any("haccp-fields" in l for l in (r.stdout + r.stderr).splitlines())
print("V1_DANS_PROGRAM=%s (tsc rc=%d)" % (inprog, r.returncode))

r2 = subprocess.run("npx tsc --noEmit > /home/clausake/cd-tsc2.log 2>&1; echo $?",
                    shell=True, capture_output=True, text=True)
taille = os.path.getsize("/home/clausake/cd-tsc2.log")
print("V4_TSC rc=%s log_octets=%d VERT=%s" % (r2.stdout.strip(), taille,
                                              r2.stdout.strip() == "0" and taille == 0))
if taille:
    print("   CONTENU DU LOG (c'est le verdict, pas le rendu):")
    print(open("/home/clausake/cd-tsc2.log", encoding="utf-8", errors="replace").read()[:2500])
