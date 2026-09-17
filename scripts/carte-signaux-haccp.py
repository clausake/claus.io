"""Carte par PREDICATS (et non par rendu): pour chaque site d'appel HACCP d'un
harnais, rend le compte des sous-chaines qui prouvent ce que le payload porte.
Le poste mute le rendu: on tranche par compteurs d'octets, pas en affichant."""
import os, re, json
BASE = os.path.expanduser("~/cookdrive-project")
SITES = {
 "test/e2e/routes.spec.ts": [216, 223, 230, 237, 412, 460],
 "scripts/audit-perf.mjs": [67],
 "scripts/ab-indices.py": [51],
 "scripts/verify-sse.mjs": [153, 167, 181, 187, 194],
 "scripts/verify-http.mjs": [178, 203],
}
SIGNES = ["equipment_name", "temperature", "parseFloat", "batch_ids", "recipe_id",
          "zone_name", "quantity", "unit", "reception_temp", "packaging_ok",
          "action_taken", "log_id", "battery", "token", "JSON.stringify", "FormData",
          "Inconnu", "UNKNOWN", "congelateur", "frigo", "ambient", "Froid", "Chaud"]
out = {}
for f, lignes in SITES.items():
    t = open(os.path.join(BASE, f), encoding="utf-8", errors="replace").read().splitlines()
    for ln in lignes:
        # fenetre: la ligne de l'appel + 12 suivantes
        fen = chr(10).join(t[ln - 1: ln + 11])
        present = {s: fen.count(s) for s in SIGNES if s in fen}
        out["%s:%s" % (f, ln)] = present
print(json.dumps(out, ensure_ascii=False, sort_keys=True, indent=1))
