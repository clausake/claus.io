#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prerequis a l'ecriture du contrat HACCP. Quatre questions, tranchees par
octets et rendues dans un FICHIER (le rendu du poste mute les identifiants):

 Q1  Quels LITTERAUX les emetteurs reels deposent dans type / equipment_type /
     entry_type / sensor_mode ? (regle du depot: un ENUM se juge contre ce que la
     voie d'ecriture y depose, pas contre l'UI)
 Q2  Ces fichiers sont-ils CHAUDS (ecrivain concurrent, classe de faute 13/09) ?
 Q3  Par quelle voie de LECTURE l'app relit-elle chaque table, et la reponse
     inclut-elle une JOIN qui fait DISPARAITRE une ligne orpheline ?
     (c'est ce qui decide si une clef inexistante est un 400 ou un rien)
 Q4  Le token du capteur est-il lu ailleurs que dans la reponse d'enregistrement ?
"""
import os, re, time, json

BASE = os.path.expanduser("~/cookdrive-project")
OUT = os.path.join(BASE, "scripts", "blocks", "haccp-prerequis.txt")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
L = []
def w(s=""): L.append(s)

def rd(p):
    return open(os.path.join(BASE, p), encoding="utf-8", errors="replace").read()

UI1, UI2, RT, INIT = rd("src/components/Haccp.tsx"), rd("src/components/HaccpModules.tsx"), rd("src/routes/haccp.ts"), rd("src/db/init.ts")

# ---- Q1: litteraux par champ, isoles par bloc de select --------------------
w("### Q1 LITTERAUX DES EMETTEURS REELS")
for champ, src, nom in (("type", UI1, "newSensorType"), ("equipment_type", UI1, "newSensorEqType")):
    # le <select> qui lit l'etat, avec ses <option value=...>
    m = re.search(r"<select[^>]*value=\{\s*" + nom + r"[^>]*>(.{0,900}?)</select>", src, re.S)
    opts = re.findall(r"value=[{'\x22]??([A-Za-z0-9_ -]{1,22})", m.group(1)) if m else []
    w(f"  {champ} (select {nom}): select_trouve={bool(m)} options={sorted(set(opts))}")
for champ in ("entry_type", "sensor_mode", "entry", "mode"):
    lits = sorted(set(re.findall(r"'(manuel|iot|auto|scan|online|offline)'", RT)))
w(f"  litteraux SQL dans haccp.ts: {sorted(set(re.findall(chr(39)+r'(manuel|iot|auto|scan|online|offline)'+chr(39), RT)))}")
w(f"  defauts schema: type={re.findall(r'type TEXT DEFAULT .([A-Za-z]+).', INIT)} eq={re.findall(r'equipment_type TEXT DEFAULT .([A-Za-z]+).', INIT)}")
w(f"  entry_type/sensor_mode cite dans l'UI: {len(re.findall('entry_type|sensor_mode', UI1))}/{len(re.findall('entry_type|sensor_mode', UI2))}")

# ---- Q2: chaleur des fichiers que je vais editer ----------------------------
w()
w("### Q2 CHALEUR (mtime, 2 relèves a 20 s)")
cibles = ["src/routes/haccp.ts", "src/shared/inventory-fields.ts", "src/components/Haccp.tsx",
          "src/components/HaccpModules.tsx", "test/e2e/routes.spec.ts", "package.json",
          "scripts/run-all-gates.py", "PHASES.md", "src/routes/documents.ts"]
snap1 = {c: (os.path.getsize(os.path.join(BASE, c)), os.path.getmtime(os.path.join(BASE, c))) for c in cibles}
time.sleep(20)
snap2 = {c: (os.path.getsize(os.path.join(BASE, c)), os.path.getmtime(os.path.join(BASE, c))) for c in cibles}
for c in cibles:
    age_h = (time.time() - snap2[c][1]) / 3600
    w(f"  {'CHAUD ' if snap1[c] != snap2[c] else ('chaud?' if age_h < 10 else 'froid ')} age={age_h:6.1f}h {c}")

# ---- Q3: voies de lecture + JOIN ------------------------------------------
w()
w("### Q3 VOIES DE LECTURE (une JOIN interne fait disparaitre l'orpheline)")
for tab in ("batches", "corrective_actions", "temperature_logs", "production_records", "cleaning_records", "iot_sensors"):
    sel = [(f, ln) for f in ("src/routes/haccp.ts", "src/routes/documents.ts", "src/routes/dashboard.ts",
                             "src/routes/search.ts", "src/routes/admin.ts", "src/routes/analytics.ts")
            if os.path.isfile(os.path.join(BASE, f))
            for ln, ligne in enumerate(rd(f).splitlines(), 1)
            if re.search(r"FROM\s+" + tab + r"\b", ligne, re.I)]
    joint = [(f, ln, re.sub(r"\s+", " ", chr(10).join(rd(f).splitlines()[ln - 1 - 3:ln + 6])).strip()[:190])
             for f, ln in sel]
    w(f"  {tab}: {len(sel)} SELECT vus")
    for f, ln, ctx in joint[:4]:
        w(f"     {f}:{ln} | {ctx}")

# ---- Q4: lectures du token --------------------------------------------------
w()
w("### Q4 LECTURES DU webhook_token (decide du durcissement sans casser le simulateur)")
for f, src in (("Haccp.tsx", UI1), ("Haccp.tsx routes", RT), ("verify-sse", rd("scripts/verify-sse.mjs"))):
    for ln, ligne in enumerate(src.splitlines(), 1):
        if "webhook_token" in ligne or "reg.token" in ligne or "tokenLive" in ligne or "token:" in ligne:
            w(f"  {f}:{ln} | {len(ligne)}ch")

open(OUT, "w", encoding="utf-8").write(chr(10).join(L) + chr(10))
print("ECRIT", OUT, len(L), "lignes")
