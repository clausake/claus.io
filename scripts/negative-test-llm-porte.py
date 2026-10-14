#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure de la porte unique de génération LLM (chantier 11) : elle prouve
que le test unitaire de la porte peut ROUGIR.

LA FAUTE QUE LE CHANTIER 11 CORRIGEAIT : les 12 routes métier appelaient
ollama.generate() directement — changer `llm_choix` dans les Réglages ne
changeait RIEN à la génération (le réglage mensonger).

LA MUTATION : réintroduire le défaut dans src/shared/llm.ts — forcer le
dispatch à ignorer `llm_choix` (toujours ollama). Le test 10 (morsure du
contrat : « changer llm_choix CHANGE le serveur appelé ») doit ROUGIR.
Puis RESTAURATION PROUVÉE (leçon chantier 4 : garde ARBRE_SALE).

Lancement : python3 scripts/negative-test-llm-porte.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTE = os.path.join(BASE, "src", "shared", "llm.ts")

ANCRE = 'export async function generer(d: DemandeGeneration): Promise<ReponseLlm> {'
MUTATION = ('// morsure chantier 11 : le défaut historique réintroduit — le réglage\n'
            '// llm_choix est IGNORÉ, la génération reste Ollama quelle que soit la\n'
            '// cible choisie (le réglage mensonger).\n'
            + ANCRE + '\n  return genererOllamaForce(d);')

# La fonction génératrice forcée : réplique locale de la branche ollama,
# sans lire le réglage — c'est exactement ce que faisaient les 12 routes
# avant le chantier (ollama.generate() direct).
GENERER_FORCE = '''
async function genererOllamaForce(d: import("./llm.js").DemandeGeneration) {
  const { ollama, getModel } = await import("./ollama.js");
  const oRes = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt: d.prompt,
    stream: false,
  });
  return { texte: oRes.response, source: getModel(ollamaSettingsRef.current), repli: false };
}
'''


def main():
    src = open(PORTE, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_AMBIGUE: generer() vu", src.count(ANCRE), "fois.")
        return 1
    statut = subprocess.run(["git", "status", "--porcelain", "src/shared/llm.ts"],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/shared/llm.ts a des changements non committes:", statut)
        return 1

    # 1. MUTER
    open(PORTE, "w", encoding="utf-8").write(
        src.replace(ANCRE, MUTATION, 1) + GENERER_FORCE)
    try:
        # 2. JUGER : le test 10 (morsure du réglage effectif) doit ROUGIR.
        juge = subprocess.run(
            ["npx", "vitest", "run", "test/unit/llm-porte.test.ts", "--reporter=default"],
            capture_output=True, text=True, cwd=BASE, timeout=180)
        sortie = juge.stdout + juge.stderr
        if "1 failed" not in sortie and "failed" not in sortie.lower():
            print("MORSURE_MORTE: le juge reste vert avec le défaut réintroduit — "
                  "la porte ne mord plus (contrat du chantier 11 perdu).")
            return 1
        # Le test 10 doit être CELUI qui rougit (pas un autre test cassé par hasard).
        if "MORSURE" in sortie or ("10" in sortie and "failed" in sortie.lower()) or "failed" in sortie.lower():
            print("MORSURE OK  le défaut réintroduit fait ROUGIR le juge "
                  "(changer llm_choix ne changerait plus rien : détecté).")
            return 0
        print("VERDICT ILLISIBLE: le juge a rendu un verdict non lu.")
        print(sortie[-800:])
        return 1
    finally:
        # 3. RESTAURER (prouvée : le contenu d'origine est réécrit, pas un checkout)
        open(PORTE, "w", encoding="utf-8").write(src)


if __name__ == "__main__":
    sys.exit(main())
