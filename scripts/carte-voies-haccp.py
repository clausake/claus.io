"""Cartographe des VOIES D'ECRITURE d'une table (regle du depot: une regle posee
sur LA voie que l'on a sous les yeux n'est pas la regle du produit).
Rend, pour chaque table ciblee, chaque INSERT/UPDATE/DELETE vu dans src/ et
server.ts, avec chemin:ligne et le nommage de la porte HTTP la plus proche au-
dessus (router.<meth>('<chemin>'))."""
import os, re, sys, json

BASE = os.path.expanduser("~/cookdrive-project")
TABLES = sys.argv[1:] or ["temperature_logs", "batches", "production_records",
                          "production_batches", "cleaning_records",
                          "corrective_actions", "iot_sensors"]

def files():
    for root, dirs, fnames in os.walk(os.path.join(BASE, "src")):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist")]
        for f in fnames:
            if f.endswith((".ts", ".tsx", ".cjs", ".js")):
                yield os.path.join(root, f)
    yield os.path.join(BASE, "server.ts")

CACHE = {p: open(p, encoding="utf-8", errors="replace").read() for p in files()}

def porte_au_dessus(src, idx):
    """La derniere déclaration router.<meth>("<chemin>") avant l'octet idx."""
    tete = src[:idx]
    m = None
    for m in re.finditer(r'''router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)''', tete):
        pass
    return (m.group(1).upper(), m.group(2)) if m else ("?", "?")

total_vues = 0
for t in TABLES:
    hits = []
    for p, s in CACHE.items():
        rel = os.path.relpath(p, BASE)
        for m in re.finditer(r"(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+" + t + r"\b", s, re.I):
            ln = s[:m.start()].count("\n") + 1
            meth, chemin = porte_au_dessus(s, m.start())
            # le SQL complet de la voie (une seule ligne de texte)
            frag = s[m.start():m.start() + 240].split("\n")[0]
            hits.append((rel, ln, meth, chemin, m.group(1).upper(), re.sub(r"\s+", " ", frag)[:150]))
    total_vues += len(hits)
    print("=== %-22s %d voie(s)" % (t, len(hits)))
    for h in hits:
        print("   %s:%s  %s %s" % (h[0], h[1], h[2], h[3]))
        print("      %s | %s" % (h[4], h[5]))
print("TOTAL_VOIES=%d" % total_vues)
