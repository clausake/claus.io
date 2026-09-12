#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve negative du harnais `probe-ready-parity.mjs`.

La regle du projet (PHASES.md): "un PASS qui ne peut pas devenir FAIL n'est pas
une mesure". Ce harnais injecte, dans des COPIES ISOLEES de l'arbre, une faute
par check juge, et exige a chaque fois:
  - rc != 0  (la sonde rougit),
  - ET le check vise NOMME dans la sortie (une ligne "FAUX  <token>").
Sans la seconde condition, n'importe quel defaut d'infrastructure (serveur qui
ne demarre pas, npm absent) ferait "mordre" une mutation qui ne mord rien.

Isolation: `node_modules` est SYMLINK (les copies de 400 Mo de binaires n'ont
aucun interet), et tout fichier de plus de 1 Mo est symlinke au lieu d'etre
copie (les `embeddings.*.safetensors` font des centaines de Mo et sont lus par
des routes que la sonde n'appelle pas).

Lancement: python3 scripts/negative-test-ready-parity.py
Le code de sortie EST le verdict: 0 = toutes les mutations mordent.
"""
import os
import re
import sys
import shutil
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "test", "tmp-negative-ready")
PROBE = os.path.join("scripts", "probe-ready-parity.mjs")
BIG = 1024 * 1024

# (nom, fichier, motif, remplacement, token du check qui DOIT etre nomme)
MUTATIONS = [
    ("M1 le port demande est recapture DANS la recursion (glisse devient un mensonge)",
     "server.ts",
     "  const PORT_DEMANDE = PORT;\n  const startListening = () => {",
     "  const startListening = () => {\n    const PORT_DEMANDE = PORT;",
     "S-b"),
    ("M2 le canal fichier du compte-rendu est debranche",
     "src/services/ready.ts",
     "  if (chemin) {",
     "  if (false && chemin) {",
     "P4"),
    ("M3 l'en-tete d'identite n'est plus emis",
     "server.ts",
     '    res.setHeader("X-Cookdrive-Instance", INSTANCE_TOKEN);',
     "    void INSTANCE_TOKEN;",
     "P6"),
    ("M4 l'annonce porte une identite qui n'est pas celle de l'instance",
     "server.ts",
     "instance: INSTANCE_TOKEN });",
     'instance: "identite-d-un-tiers" });',
     "P3"),
    ("M5 l'annonce publie un port qui n'est pas celui de l'objet serveur",
     "src/services/ready.ts",
     "    port: addr.port,",
     "    port: addr.port + 1,",
     "P2"),
    ("M6 le controle d'identite du client se declare toujours conforme",
     "electron/ready-parity.cjs",
     "        finir(reponse.statusCode === 200 && recu === instance);",
     "        finir(true);",
     "P6-b"),
    ("M7 le compte-rendu atomique n'est jamais lu (le client ne voit rien)",
     "electron/ready-parity.cjs",
     "        var brut = fs.readFileSync(chemin, \"utf-8\");",
     "        var brut = null;",
     "P4"),
]


def read(rel):
    with open(os.path.join(BASE, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(WORK, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def prepare_work():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    for item in os.listdir(BASE):
        if item in {"node_modules", "dist", "test-results", ".git", "test"}:
            continue
        src = os.path.join(BASE, item)
        dst = os.path.join(WORK, item)
        if os.path.isdir(src):
            # copie recursive MANUELLE (ni copytree ni ses mots-cles): le piege
            # des identifiants a doubles soulignes est consigne dans PHASES.md.
            keep = ("node_modules", "dist", "test-results", ".git", "test",
                    "__pycache__")
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames
                              if d not in keep and not d.startswith(".")]
                rel = os.path.relpath(dirpath, src)
                os.makedirs(os.path.join(dst, rel), exist_ok=True)
                for fn in filenames:
                    if fn.endswith(".log") or fn.endswith(".pyc"):
                        continue
                    if fn.startswith("__") and fn.endswith("__"):
                        continue
                    s = os.path.join(dirpath, fn)
                    d = os.path.join(dst, rel, fn)
                    if os.path.getsize(s) > BIG:
                        os.symlink(s, d)   # les embeddings: lus par d'autres routes
                    else:
                        shutil.copy2(s, d)
        else:
            if os.path.getsize(src) > BIG:
                os.symlink(src, dst)
            else:
                shutil.copy2(src, dst)
    os.symlink(os.path.join(BASE, "node_modules"), os.path.join(WORK, "node_modules"))
    os.makedirs(os.path.join(WORK, "test"), exist_ok=True)


def run_probe():
    # ⚠ NODE et non sys.executable : lancer python3 sur un .mjs produit un
    # "unterminated string literal (detected at line 4)" — un message de PYTHON,
    # pas de Node — qui fait rougir la ligne de base pour une faute d'harnais.
    node = shutil.which("node")
    assert node, "node introuvable"
    proc = subprocess.run([node, PROBE], cwd=WORK,
                          capture_output=True, text=True, timeout=420)
    return proc.returncode, ((proc.stdout or "") + (proc.stderr or ""))


def main():
    prepare_work()
    originals = {m[1]: read(m[1]) for m in MUTATIONS}
    results = []
    try:
        rc, out = run_probe()
        if rc != 0:
            print("LIGNE DE BASE ROUGE -- la preuve serait sans objet.")
            print(out[-3000:])
            return 2
        results.append(("ligne de base (attendu VERT)", 0, True, ""))

        for name, rel, pattern, repl, token in MUTATIONS:
            src = originals[rel]
            hits = re.findall(re.escape(pattern), src)
            if len(hits) != 1:
                results.append((name, -1, False,
                                "MOTIF %s (%d vus, 1 attendu)"
                                % ("ABSENT" if not hits else "AMBIGU", len(hits))))
                continue
            mutated, n = re.subn(re.escape(pattern), lambda _: repl, src)
            if n != 1 or mutated == src:
                results.append((name, -1, False, "SUB SANS EFFET"))
                continue
            write(rel, mutated)
            try:
                rc, out = run_probe()
            finally:
                write(rel, src)
            rougit = rc != 0
            # le check vise doit etre NOMME dans une ligne FAUX, pas seulement "un" echec
            nomme = bool(re.search(r"(?m)^FAUX\s+%s\b" % re.escape(token), out))
            results.append((name, rc, rougit and nomme,
                            "" if (rougit and nomme) else out[-2500:]))

        rc, out = run_probe()
        results.append(("restaure (attendu VERT)", rc, rc == 0,
                        "" if rc == 0 else out[-1500:]))
    finally:
        shutil.rmtree(WORK, ignore_errors=True)

    print()
    print("=" * 74)
    print("PREUVE NEGATIVE - probe-ready-parity.mjs")
    print("=" * 74)
    failed = 0
    for label, rc, ok, detail in results:
        print("  %s  %-72s rc=%s" % ("OK   " if ok else "ROUGE", label[:72], rc))
        if not ok:
            failed += 1
            for line in (detail or "").splitlines():
                if re.search(r"(FAUX|Error|MOTIF|SUB SANS|rc=)", line):
                    print("        |", line.strip()[:160])
    total = len(results)
    print("-" * 74)
    print("  %d/%d mordent (rc!=0 + le check vise nomme)" % (total - failed, total))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
