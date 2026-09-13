#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carte des chemins qui ECRIVENT `document_items`, jugee au CONTENU des specs.

Pourquoi ce script existe (lecon du Sprint 9, consignee dans PHASES.md): le
premier calcul de carte des routes jugees comparait les chemins declares de
`src/routes/*.ts` aux chemins CITES dans `test/e2e/`. Il a rendu quatre faux
positifs et a cru que `POST /api/documents` etait juge — alors qu'il acceptait
`quantity: "beaucoup"`. **Etre cite dans un spec ne veut pas dire etre juge.**

Ici la carte est a DEUX niveaux:
  1. le chemin est-il appele par un spec,
  2. et, si oui, un test de ce spec ASSERTIONNE-t-il quelque chose sur les
     LIGNES (quantite / prix / clef / total) ?
Un chemin appele seulement avec une ligne nominale, sans assertion de forme,
est marque `NOMINAL` et non `JUGE`: c'est exactement l'angle mort qui a laisse
le defaut vivre.

Il rend aussi les INSERT vers document_items par fichier, pour qu'une TROISIEME
porte ne puisse pas rester silencieuse.
"""
import hashlib
import os
import re
import sys

RACINE = os.path.join(os.path.expanduser("~"), "cookdrive-project")
SRC = os.path.join(RACINE, "src")
E2E = os.path.join(RACINE, "test", "e2e")

VERBES = ("get", "post", "put", "patch", "delete")

# Un test « assertionne les lignes » s'il nomme un champ de ligne ET qu'il a
# une attente (expect) dans le meme bloc.
SIGNAUX_LIGNES = (
    "quantity", "quantite", "unit_price", "prix", "inventory_id", "clef",
    "original_name", "total_amount", "rejetees", "ecrites", "items",
    "beaucoup", "orpheline", "brut",
)


def lire(chemin):
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def fichiers(dossier, exts):
    out = []
    for base, _dirs, noms in os.walk(dossier):
        for n in sorted(noms):
            if n.endswith(exts) and not n.endswith(".d.ts"):
                out.append(os.path.join(base, n))
    return sorted(out)


def chemins_de_route(src):
    """Les (verbe, gabarit) declares par un fichier de route."""
    out = []
    for m in re.finditer(
            r"router\.(%s)\(\s*(?:\"([^\"]+)\"|`([^`]+)`)" % "|".join(VERBES),
            src):
        verbe = m.group(1)
        gabarit = (m.group(2) or m.group(3) or "").strip()
        if gabarit:
            out.append((verbe, gabarit))
    return out


def noyaux(gabarit):
    """Le gabarit rendu en noyaux comparables aux appels des specs."""
    n = gabarit.strip("/")
    n = re.sub(r"\$\{[^}]*\}", "*", n)
    n = re.sub(r":[A-Za-z0-9_]+", "*", n)
    return n.lower()


def assertions_lignes(corps_test):
    """Le test porte-t-il une VRAIE attente sur les lignes ?"""
    if "expect(" not in corps_test:
        return 0
    vus = set()
    bas = corps_test.lower()
    for s in SIGNAUX_LIGNES:
        if s in bas:
            vus.add(s)
    # une attente qui ne porte que sur `status` n'est pas une attente de forme
    if len(vus) < 2:
        return 0
    return len(vus)


def tests_de(spec_src):
    """Decoupe un spec en blocs de test (test("...", ...))."""
    blocs = []
    for m in re.finditer(r"\btest(?:\.\w+)?\s*\(\s*[`\"']([^`\"']{0,140})", spec_src):
        blocs.append((m.group(1), m.start()))
    out = []
    for i, (titre, pos) in enumerate(blocs):
        fin = blocs[i + 1][1] if i + 1 < len(blocs) else len(spec_src)
        out.append((titre, spec_src[pos:fin]))
    return out


def main():
    routes = fichiers(os.path.join(SRC, "routes"), (".ts",))
    specs = fichiers(E2E, (".spec.ts",))
    specs_src = {p: lire(p) for p in specs}

    # -- les INSERT vers document_items, par fichier source ------------------
    print("=== PORTE D'ECRITURE: qui INSERT dans document_items ===")
    insereurs = {}
    for base, _d, noms in os.walk(SRC):
        for n in sorted(noms):
            if not n.endswith(".ts"):
                continue
            p = os.path.join(base, n)
            t = lire(p)
            for m in re.finditer(r"INSERT\s+INTO\s+document_items", t, re.I):
                ligne = t[:m.start()].count("\n") + 1
                insereurs.setdefault(os.path.relpath(p, RACINE), []).append(ligne)
    for f, lignes in sorted(insereurs.items()):
        print("  %-38s lignes %s" % (f, ",".join(str(x) for x in lignes)))
    if not insereurs:
        print("  AUCUN — suspect: verifier la regex")

    # -- le module est-il reellement branche aux portes ----------------------
    print()
    print("=== BRANCHEMENT DU MODULE ===")
    for f in sorted(insereurs):
        p = os.path.join(RACINE, f)
        t = lire(p)
        appele = "jugerLignesDeDocument(" in t
        importe = "shared/document-items" in t
        print("  %-38s importe=%s appele=%s" % (f, importe, appele))

    # -- carte des routes / specs -------------------------------------------
    print()
    print("=== CARTE AU CONTENU (JUGE / NOMINAL / APPELE / JAMAIS) ===")
    total_juge = total_nominal = total_appele = total_jamais = 0
    for f in sorted(insereurs):
        src = lire(os.path.join(RACINE, f))
        for verbe, gabarit in chemins_de_route(src):
            if "document" not in gabarit.lower() and "purchasing" not in gabarit.lower():
                continue
            cible = noyaux(gabarit)
            etat = "JAMAIS"
            meilleurs = 0
            ou = "-"
            for p, t in specs_src.items():
                if ("/" + cible.replace("*", "[^/]*")) not in t.replace("*", "[^/]*"):
                    # comparaison souple: on cherche le gabarit littéral ou son motif
                    pass
                motif = re.escape(("/" + cible).replace(r"\*", "[^/]*"))
                if not re.search(motif, t):
                    continue
                for titre, corps in tests_de(t):
                    if re.search(motif, corps):
                        n = assertions_lignes(corps)
                        if n > meilleurs:
                            meilleurs = n
                            ou = "%s :: %s" % (os.path.basename(p), titre[:44])
            if meilleurs >= 2:
                etat = "JUGE"
                total_juge += 1
            elif meilleurs == 1:
                etat = "PARTIEL"
                total_nominal += 1
            elif ou != "-":
                etat = "NOMINAL"
                total_nominal += 1
            else:
                total_appele += 0
                total_jamais += 1
            print("  %-6s %-46s %-8s %s" % (verbe.upper(), gabarit, etat, ou))
    print("  sous-total: juge=%d nominal/partiel=%d jamais=%d"
          % (total_juge, total_nominal, total_jamais))

    print()
    print("(sha de la carte)", hashlib.sha256(
        "|".join(sorted(insereurs)).encode()).hexdigest()[:12])
    return 0


if __name__ == "__main__":
    sys.exit(main())
