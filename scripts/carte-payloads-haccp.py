"""Extrait, pour une liste de chemins, le fetch REEL de l'UI (payload recopie tel
quel) + ce que la route en fait. Regle du depot: juger avec le payload que l'UI
enverRA, pas un payload invente par la sonde."""
import os, re, sys
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHEMINS = sys.argv[1:] or ["/api/haccp/temperature", "/api/haccp/production",
                           "/api/haccp/batches", "/api/haccp/iot-sensors",
                           "/api/haccp/webhook/iot-report",
                           "/api/haccp/corrective-action", "/api/haccp/cleaning",
                           "/api/haccp/scan", "/api/haccp/documents"]
srcs = {}
for root, dirs, fs in os.walk(os.path.join(BASE, "src")):
    dirs[:] = [d for d in dirs if d not in ("node_modules",)]
    for f in fs:
        if f.endswith(".tsx"):
            srcs[os.path.join(root, f)] = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()

for c in CHEMINS:
    print("#" * 3, c)
    for p, s in srcs.items():
        for m in re.finditer(r'''fetch\(\s*([`\x27"])[^\x27"`]*''' + re.escape(c) + r'''[^\x27"`]*\1''', s):
            blk = s[m.start():m.start() + 1400]
            meth = re.search(r'''method:\s*["\x27](\w+)''', blk)
            body = re.search(r'''body:\s*JSON.stringify\((\{.*?\n\s*\})\s*,?\s*\}''', blk, re.S) \
                   or re.search(r'''body:\s*JSON.stringify\((\{.*?\}\s*)\)''', blk, re.S)
            fd = "FormData" in blk[:600]
            ln = s[:m.start()].count("\n") + 1
            print("  %s:%s  %s%s" % (os.path.basename(p), ln, (meth.group(1) if meth else "GET"),
                                     "  [FormData]" if fd else ""))
            if body:
                print("    PAYLOAD UI :", re.sub(r"[ \t]+", " ", body.group(1)).strip()[:520])
