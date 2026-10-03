#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Saisit, par PREDICATS, ce que la voie d'ECRITURE de l'app depose reellement
dans les colonnes a enum du domaine HACCP, et si le webhook_token est expose au
chef. La regle du depot: un ENUM doit inclure ce que la voie d'ecriture y depose
(juge contre la migration, pas contre l'UI) — sinon on rejette des lignes que le
produit a lui-même creees."""
import os, re, json

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(p):
    return open(os.path.join(BASE, p), encoding="utf-8", errors="replace").read()

HACCP_UI = read("src/components/Haccp.tsx")
MOD_UI = read("src/components/HaccpModules.tsx")
ROUTE = read("src/routes/haccp.ts")
INIT = read("src/db/init.ts")

rapport = {}

# 1) Valeurs que l'UI peut depose dans type / equipment_type (options de select)
def options_de(src, nom_etat):
    # cherche les littéraux des SETTERS d'options et des <option value=...>
    m = re.search(r"const \[" + nom_etat + r", set\w+\]\s*=\s*useState(?:<[^>]*>)?\(([^;]{0,400}?)\);", src, re.S)
    bloc = m.group(1) if m else ""
    vals = re.findall(r"""['"]([A-Za-z0-9_ -]{1,24})['"]""", bloc)
    opts = re.findall(r"""<option[^>]*value=[{'"]?([A-Za-z0-9_ -]{1,24})""", src)
    return sorted(set(vals) | set(opts)), bool(m)

for champ, fichier, etat in [
    ("type", "Haccp.tsx", "newSensorType"),
    ("equipment_type", "Haccp.tsx", "newSensorEqType"),
]:
    vals, trouve = options_de(HACCP_UI, etat)
    rapport["ui_" + champ] = {"valeurs": vals, "etat_trouve": trouve}

# 2) Ce que la MIGRATION/DEFINITIF depose (la regle de l'enum doit les inclure)
rapport["defauts_schema"] = {
    "iot_sensors.type": re.findall(r"type TEXT (?:NOT NULL )?DEFAULT '([^']*)'", INIT),
    "iot_sensors.equipment_type": re.findall(r"equipment_type TEXT DEFAULT '([^']*)'", INIT),
    "temperature_logs.entry_type": re.findall(r"ensureColumn\(\"temperature_logs\", \"entry_type\", TEXT DEFAULT '([^']*)'\)", INIT),
    "temperature_logs.sensor_mode": re.findall(r"ensureColumn\(\"temperature_logs\", \"sensor_mode\", TEXT DEFAULT '([^']*)'\)", INIT),
}

# 3) Les litteraux que les ROUTES/ecrivains depose (INSERT ... 'iot', 'online')
rapport["litteraux_routes"] = {
    "entry_type": sorted(set(re.findall(r"'(manuel|iot|auto|scan)'", ROUTE))),
    "sensor_mode": sorted(set(re.findall(r"'(online|offline)'", ROUTE))),
}

# 4) Le token est-il rendu a l'ecran du chef? (decide du risque a le durcir)
#    Predicat: toute interpolation de webhook_token dans le JSX, hors console.*
expose = []
for i, ligne in enumerate(HACCP_UI.splitlines(), 1):
    if "webhook_token" in ligne and "console." not in ligne:
        expose.append((i, len(ligne)))
rapport["token_expose_lignes"] = expose

# 5) Le DELETE d'un capteur est-il confirme cote UI (le 'confirm(' du skill: doit
#    etre un ConfirmDialog, pas alert/confirm natif)
rapport["confirm_natif_haccp"] = {
    "Haccp.tsx": len(re.findall(r"\bconfirm\(", HACCP_UI)),
    "HaccpModules.tsx": len(re.findall(r"\bconfirm\(", MOD_UI)),
    "ConfirmDialog_cite_Haccp.tsx": len(re.findall(r"ConfirmDialog", HACCP_UI)),
    "ConfirmDialog_cite_HaccpModules.tsx": len(re.findall(r"ConfirmDialog", MOD_UI)),
    "alert_natif_Haccp.tsx": len(re.findall(r"\balert\(", HACCP_UI)),
}

# 6) Ou l'UI lit-elle le token pour le simulateur (voies de lecture du secret)
rapport["token_lectures"] = sorted(set(re.findall(r"\b(s\w*\.|sensor\w*\.)webhook_token\b", HACCP_UI)))

print(json.dumps(rapport, ensure_ascii=False, indent=1, sort_keys=True))
