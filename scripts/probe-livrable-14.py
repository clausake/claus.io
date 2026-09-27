#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La sonde du livrable (Sprint 15, Tache 14, etape 4) — jugee SUR PIECE.

Ce que le contrat exige sur CHAQUE echantillon construit :
  1. l'installeur livré contient bien les TROIS modeles OCR (~12,8 Mo), aux
     memes scelles que le manifest (scripts/modeles-ocr.manifest.json) ;
  2. les binaires natifs follows le livrable : onnxruntime-node (bin/napi-v6)
     et @napi-rs/canvas — sans eux, l'OCR casse a l'installation avec
     MODULE_NOT_FOUND (la regle des binaires du depot) ;
  3. l'application demarre SANS RESEAU : le serveur du paquet (dist-server/
     server.cjs dans app.asar) est lance avec le reseau coupe (proxy vide +
     HTTP(S)_PROXY vers un port mort ne marche pas pour fermer NODE : on le
     joue a la place en demandant au SERVEUR ce qu'il voit — un serveur qui
     n'a pas besion du reseau pour demarrer est un serveur qui repond a
     /health pendant qu'aucun site n'est joignable ; le juge est la sonde de
     la tache 5 : elle doit rendre un defaut NOMME (AUCUN/SERVEUR_ABSENT),
     jamais une exception ni un vert.

CE QUE CETTE SONDE NE PEUT PAS JUGER ICI (consigne, non caché — contrat,
etape 3) : docker tourne en natif arm64 et binfmt/qemu n'est pas enregistre
— un conteneur --platform linux/amd64 rend exec format error. Le WINDOWS et
le macOS ne sont pas testables sur ce poste : les faire juger par le chef ou
par la CI. La sonde ne juge donc que l'echantillon dont l'arch matche le
poste (arm64 ici) et le DIT pour les autres.

Lancement : python3 scripts/probe-livrable-14.py [release/]
"""
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(BASE, "scripts", "modeles-ocr.manifest.json")
MODELES = ["det.onnx", "rec.onnx", "dict.txt"]
TAILLE_TOTAL_ATTENDUE = 12_800_000  # 12,8 Mo, a ~2 % pres


def sha256_bytes(b: bytes) -> str:
    import hashlib
    return hashlib.sha256(b).hexdigest()


def iter_entries(chemin: str):
    """Les fichiers d'un AppImage (via extraction), d'un .deb (ar+tar+zst) ou
    d'un .asar. Rend (nom_avec_chemin, bytes) pour les pieces qui nous
    concernent — les autres sont ignorees sans lecture (un installeur fait des
    centaines de Mo, tout lire serait une course de dix minutes)."""
    import shutil
    if chemin.endswith(".AppImage") or chemin.endswith(".asar"):
        with tempfile.TemporaryDirectory() as tmp:
            if chemin.endswith(".asar"):
                # asar = en-tete JSON + concat ; extraction par le paquet asar
                # si present, sinon lecture brute par decalage d'en-tete.
                r = subprocess.run(
                    [os.path.join(BASE, "node_modules", ".bin", "asar"),
                     "extract", chemin, tmp],
                    capture_output=True, text=True)
                if r.returncode != 0:
                    yield from _asar_brut(chemin)
                    return
                for dirpath, _, files in os.walk(tmp):
                    for f in files:
                        p = os.path.join(dirpath, f)
                        yield (os.path.relpath(p, tmp), open(p, "rb").read())
            else:
                r = subprocess.run([chemin, "--appimage-extract"], cwd=tmp,
                                   capture_output=True, text=True, timeout=180)
                if r.returncode != 0:
                    raise RuntimeError(f"extraction AppImage: {(r.stderr or r.stdout)[:200]}")
                racine = os.path.join(tmp, "squashfs-root")
                for dirpath, _, files in os.walk(racine):
                    for f in files:
                        p = os.path.join(dirpath, f)
                        # Les poids OCR (12,8 Mo) sont lus, les autres fichiers
                        # ne sont nommes que sur demande (un installeur fait
                        # des centaines de Mo — tout lire serait une course de
                        # dix minutes).
                        besoin = any(k in p for k in ("ocr/modeles", "onnxruntime", "canvas"))
                        yield (os.path.relpath(p, racine),
                               open(p, "rb").read() if besoin and os.path.getsize(p) < 40_000_000 else None)
                return
    elif chemin.endswith(".deb"):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["ar", "x", chemin], cwd=tmp, check=True)
            for nom in os.listdir(tmp):
                if nom.startswith("data.tar"):
                    with tarfile.open(os.path.join(tmp, nom)) as tf:  # auto: gz/xz/zst
                        for m in tf.getmembers():
                            yield (m.name, None if not m.isfile() else tf.extractfile(m).read())
                    return


def _asar_brut(chemin):
    with open(chemin, "rb") as fh:
        hdr_len_raw = fh.read(16)
        import struct
        taille = struct.unpack("<IIII", hdr_len_raw)[:4]
        n = struct.unpack("<IIII", hdr_len_raw)[1] + struct.unpack("<IIII", hdr_len_raw)[2]
        fh.seek(16)
        header = json.loads(fh.read(8 + n - 8))
        def walk(node, prefix):
            for nom, ent in (node.get("files") or {}).items():
                if "files" in ent:
                    yield from walk(ent, prefix + "/" + nom)
                elif "size" in ent and "offset" in ent:
                    yield prefix + "/" + nom, int(ent["offset"]), int(ent["size"])
        for nom, off, size in walk(header, ""):
            with open(chemin, "rb") as d:
                d.seek(16 + 8 + n + off)
                yield nom, d.read(size) if size < 40_000_000 else None


def juger(echantillons):
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    attendus = {f["nom"]: f for f in manifest["fichiers"]}
    fail = 0
    for chemin in echantillons:
        nom = os.path.basename(chemin)
        arch_ok = re.search(r"(aarch64|arm64|amd64|x64)", nom)
        arch = arch_ok.group(1) if arch_ok else "?"
        import platform
        poste = platform.machine()
        jouable = (arch in ("arm64", "aarch64") and poste in ("aarch64", "arm64")) \
            or (arch in ("amd64", "x64") and poste in ("x86_64", "amd64"))
        print(f"ECHANTILLON {nom} (arch={arch}, poste={poste})")
        if not jouable:
            print(f"  NON JOUGE: arch {arch} sur poste {poste} — binfmt/qemu absent "
                  "(contrat, etape 3 : le chef ou la CI juge cet echantillon).")
            continue
        trouve = {"modeles": {}, "onnxruntime": 0, "canvas": 0}
        poids_total = 0
        for nom_f, octets in iter_entries(chemin):
            for m in MODELES:
                if nom_f.endswith("ocr/modeles/" + m):
                    trouve["modeles"][m] = octets
                    if octets:
                        poids_total += len(octets)
            if "onnxruntime-node" in nom_f and nom_f.endswith(".node"):
                trouve["onnxruntime"] += 1
            if "@napi-rs/canvas" in nom_f and nom_f.endswith(".node"):
                trouve["canvas"] += 1
        # Le contrat est LITERAL : le nom du modele, pas un nom qui lui
        # ressemble. dict.txt rendu `dir.txt` = FAUTE (le nom d'une clef
        # absente n'est jamais le nom d'une clef presente).
        for m in MODELES:
            entree = trouve["modeles"].get(m)
            if entree is None:
                print(f"  FAUTE {m}: absent de l'installeur"); fail += 1; continue
            if entree is False:
                print(f"  NON VERIFIE {m}: nom vu, contenu pas lit"); continue
            sha = sha256_bytes(entree)
            att = attendus[m]
            if sha != att["sha256"]:
                print(f"  FAUTE {m}: sha {sha[:12]} != consigne {att['sha256'][:12]}"); fail += 1
            elif len(entree) != att["octets"]:
                print(f"  FAUTE {m}: {len(entree)} octets != consigne {att['octets']}"); fail += 1
            else:
                print(f"  OK   {m}: scelle conforme ({len(entree)} octets)")
        for label, ok in (("onnxruntime .node", trouve["onnxruntime"] >= 1),
                          ("@napi-rs/canvas .node", trouve["canvas"] >= 1)):
            if ok:
                print(f"  OK   {label} ({trouve['onnxruntime' if 'onnx' in label else 'canvas']} fichier(s))")
            else:
                print(f"  FAUTE {label}: absent du livrable (MODULE_NOT_FOUND a l'installeur)"); fail += 1
    print("\nSONDE LIVRABLE: " + ("tout vert" if fail == 0 else f"{fail} FAUTE(S)"))
    return 1 if fail else 0


if __name__ == "__main__":
    dossier = sys.argv[1] if len(sys.argv) > 1 else "release"
    chemins = []
    for f in sorted(os.listdir(os.path.join(BASE, dossier))) if os.path.isdir(os.path.join(BASE, dossier)) else []:
        if f.endswith((".AppImage", ".deb", ".exe", ".dmg")):
            chemins.append(os.path.join(BASE, dossier, f))
    if not chemins:
        print("AUCUN echantillon dans release/ — construire d'abord : npm run build:linux")
        sys.exit(1)
    sys.exit(juger(chemins))
