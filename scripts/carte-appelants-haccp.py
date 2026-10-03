"""Relit, pour chaque harnais qui ecrit sur les routes HACCP, le payload EXACT
qu'il poste. But: aucun verrou du contrat ne doit faire rougir un harnais
existant pour une autre raison que la sienne (regle du depot: juger avec le
payload que l'appelant reel emet)."""
import os, re, sys
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIERS = ["scripts/audit-perf.mjs", "scripts/ab-indices.py", "scripts/verify-sse.mjs",
            "scripts/verify-http.mjs", "test/e2e/routes.spec.ts"]
CIBLES = r"(temperature|iot-sensors|batches|production|cleaning|corrective-action|webhook/iot-report)"
for f in FICHIERS:
    p = os.path.join(BASE, f)
    if not os.path.isfile(p):
        print("ABSENT", f); continue
    t = open(p, encoding="utf-8", errors="replace").read()
    print("#" * 4, f)
    for m in re.finditer(r"/api/haccp/" + CIBLES, t):
        # la ligne complete qui porte l'appel, etepee sur 2 lignes
        debut = t.rfind("\n", 0, m.start()) + 1
        fin = t.find("\n", m.end())
        blk = t[debut:min(fin + 900, len(t))]
        body = re.search(r"(?:body|json|data)\s*[:=]\s*(\{.{0,340}?\}|\w+)", blk, re.S)
        meth = re.search(r"method\s*[:=]\s*[\"'](\w+)", blk)
        ln = t[:m.start()].count("\n") + 1
        print("  L%-5d %-6s %s" % (ln, (meth.group(1) if meth else "?"), m.group(0)))
        if body:
            print("        ", re.sub(r"\s+", " ", body.group(1))[:330])
