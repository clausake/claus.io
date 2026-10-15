#!/usr/bin/env python3
# Porte : le hash CSP du script inline de dist/index.html doit etre EXACTEMENT
# celui autorise dans server.ts.
#
# Pourquoi cette porte existe : le 15/10, le banc UI Playwright a mesure que le
# garde-fou inline (l'ecran de secours affiche quand React ne monte pas, #root
# vide) etait BLOQUE par la CSP de helmet (`script-src 'self'` sans le hash) —
# mort en production pour tous les utilisateurs, sans qu'aucune porte ne rouge
# (aucune porte ne jugeait le navigateur). Reparation : hash autorise dans
# server.ts. Si quelqu'un modifie le script inline sans mettre a jour la CSP,
# le garde-fou meurt DE NOUVEAU en silence — cette porte rend le silence
# impossible.
#
# Contrat : rc=0 si le hash du corps du <script> inline de dist/index.html est
# present dans la liste scriptSrc de server.ts. rc=1 sinon (avec le hash a
# reporter). Prerequis : `npm run build` (comme verify:http/verify:bundle).

import base64
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(BASE, "dist", "index.html")
SERVER = os.path.join(BASE, "server.ts")

def main():
    if not os.path.isfile(DIST):
        print("MANQUANT dist/index.html — lancer `npm run build` avant cette porte (meme contrat que verify:http)")
        return 2
    html = open(DIST, encoding="utf-8").read()
    inlines = re.findall(r"<script>(.*?)</script>", html, re.S)
    if not inlines:
        print("AUCUN script inline dans dist/index.html — rien a autoriser, OK")
        return 0
    hashes = {
        "sha256-" + base64.b64encode(hashlib.sha256(corps.encode()).digest()).decode()
        for corps in inlines
        if corps.strip()
    }
    src = open(SERVER, encoding="utf-8").read()
    manquants = sorted(h for h in hashes if h not in src)
    if manquants:
        print("ECHEC — script(s) inline non autorise(s) par la CSP de server.ts :")
        for h in manquants:
            print("  ", h)
        print("Reporter ce hash dans contentSecurityPolicy.scriptSrc (server.ts),")
        print("sinon le garde-fou inline est bloque par la CSP (mort en production).")
        return 1
    print("OK — %d script(s) inline autorise(s) par la CSP : %s" % (len(hashes), ", ".join(sorted(hashes))))
    return 0

if __name__ == "__main__":
    sys.exit(main())
