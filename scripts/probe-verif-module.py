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
import os, re, shutil, subprocess, sys, json, collections

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

# --- V5: le CONTRAT du generateur de token, juge par EXECUTION.
# ⚠ Angle mort consigne le 24/09: la docstring de ce fichier PROMETVAIT un V5
# qui n'a jamais existe dans le corps -- cinq verdicts affiches, quatre juges.
# Un verdict affiche mais non calcule est pire qu'une absence de verdict: il
# endort. V5 est donc ecrit, et le rc global est calcule (voir plus bas): avant
# ce correctif, cette sonde rendait TOUJOURS rc=0 et ne pouvait donc pas etre
# une porte -- c'est exactement le faux PASS structurel que l'audit C4 denonce.
# Le harnais est un FICHIER (.mjs joue par tsx) et non un `node -e` inline:
# le harnais de securite de ce poste bloque l'inline (piege consigne), et un
# fichier se relit alors qu'un inline ne se relit pas.
def _v5():
    node = shutil.which("node")
    tsx = os.path.join(BASE, "node_modules", ".bin", "tsx")
    harnais = os.path.join(BASE, "scripts", "_harnais_token.mjs")
    if not (node and os.path.exists(tsx) and os.path.exists(harnais)):
        return False, "harnais indisponible (node=%s tsx=%s harnais=%s)" % (
            bool(node), os.path.exists(tsx), os.path.exists(harnais))
    r = subprocess.run([node, tsx, harnais], cwd=BASE,
                       capture_output=True, text=True, timeout=180)
    ligne = (r.stdout or "").strip().splitlines()
    donne = [x for x in ligne if x.strip().startswith("{")]
    if not donne:
        return False, "aucun JSON rendu par le harnais (rc=%d) %s" % (
            r.returncode, (r.stderr or "")[-300:])
    d = json.loads(donne[-1])
    if d.get("err"):
        return False, "exception du harnais: %s" % d["err"]
    n, uniq = d.get("n", 0), d.get("uniques", 0)
    m = d.get("attendu_min")
    if not isinstance(m, int) or m <= 0:
        return False, "LONGUEUR_TOKEN_MIN absent ou non-entier du module: %r" % (m,)
    if d.get("vides", 0) or d.get("hors_contrat", 0):
        return False, "%d token(s) vide/hors-contrat rendus par newToken" % (
            d.get("vides", 0) + d.get("hors_contrat", 0))
    if d.get("minlen", -1) < m:
        return False, "token plus court que le contrat (%d < %d)" % (d["minlen"], m)
    if n and uniq != n:
        return False, "%d collision(s) sur %d tokens (uniques=%d)" % (n - uniq, n, uniq)
    return True, "%d tokens, %d uniques, longueur [%s..%s] >= contrat %s" % (
        n, uniq, d.get("minlen"), d.get("maxlen"), m)

ok5, detail5 = _v5()
print("V5_TOKEN_CONTRAT=%s %s" % (ok5, detail5))

# --- Le verdict global, CALCULE. Une sonde qui ne peut pas rougir n'est pas
# une porte: elle est un decor. Chaque V ci-dessus est un predicat reele.
echecs = []
if len(manq) != 0:
    echecs.append("V2")
if not all(v == 0 for v in v3.values()):
    echecs.append("V3")
if not inprog:
    echecs.append("V1")
if not (r2.stdout.strip() == "0" and taille == 0):
    echecs.append("V4")
if not ok5:
    echecs.append("V5")
print("VERDIT_MODULE=%s %s" % ("VERT" if not echecs else "ROUGE",
                              "aucun defaut" if not echecs else "echoues=" + ",".join(echecs)))
sys.exit(0 if not echecs else 1)
