#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lot des portes de qualite, avec les verdicts LUS et non inferez.

Pourquoi ce script existe: les portes sont dix-sept commandes npm, et les lancer
dans une chaine shell produit un verdict qui ment de deux facons:
  - le `rc` d'une chaine est celui du DERNIER element: neuf portes rouges puis
    une verte rendent "tout vert";
  - les sorties se melangent, et un "passed" qui vient du lot precedent se lit
    comme le verdict du lot courant.
Ici chaque porte a son rc propre, sa queue de sortie est consignee dans un
fichier, et le resume final est rendu en TOKENS (gates=14 rc_sse=0 ...), pas
dans un tableau de noms: le rendu de ce poste altere les identifiants (piege
consigned dans PHASES.md), un nombre survit, un nom de check non.

Lancement: python3 scripts/run-all-gates.py [port1 port2 ...]
"""
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "test", "gates.out")
COURSE_ID = os.path.basename(sys.argv[0]) + "-" + str(os.getpid())
OUT = os.path.join(BASE, "test", "gates-" + COURSE_ID + ".out")
SYMLINK = os.path.join(BASE, "test", "gates.out")

DEFAUT = ["verify:split",
          # Le journal chaud est la seule entree shared par tous les agents; s'il
          # est recolle mal (une ligne perdue dans une archive), chaque agent lit
          # desormais un faux sans le savoir. La porte verifie par sha256 que
          # chaud+archives se recollent a l'original consigne. Sans elle dans
          # DEFAUT, elle n'est jouee que si un agent y pense: une porte que
          # personne n'appelle n'est pas une porte.
          "verify:sse", "verify:perf", "verify:http", "verify:bundle",
          "verify:ratelimit", "verify:ci", "verify:indices",
          "verify:instance-guard", "verify:instance-mord",
          "verify:purchasing", "verify:forecast", "verify:forecast-mord",
          "verify:ready", "verify:ready-mord",
          "verify:inventory-put",
          # les trois portes du contrat des prix fournisseurs: une par VOIE
          # D'ECRITURE de la colonne jugeable (saisie unitaire, import CSV,
          # validation de facture). Les retirer rend le contrat jugeable
          # partiellement sans que personne ne le voie.
          "verify:supplier-price", "verify:supplier-import",
          "verify:documents-validate",
          # Les TROIS portes de la chaine d'achat (Sprint 14): la sonde du
          # REDISPOST (import-contract), la sonde du POST unitaire
          # (supplier-probe) et la sonde de l'installeur (installeur-morsure).
          # Les retirer rend la chaine jugeable partiellement sans qu'aucun
          # lot ne le voie (la famille de verify:forecast du Sprint 10).
          "verify:import-contract", "verify:supplier-probe", "verify:installeur",
          # Les deux portes d'ECRITURE d'inventaire du Sprint 8, chacune avec sa
          # preuve de morsure: consume (decrement de stock du chariot de
          # production) et post-inventory (la CREATION, qui avait TROIS voies dans
          # l'UI dont une morte en 500). Sans elles, une de ces routes peut
          # redevenir un 500 generalise sans qu'aucun lot ne le voie.
          "verify:consume", "verify:consume-mord",
          "verify:post-inventory", "verify:post-inventory-mord",
          # Les trois portes du contrat des LIGNES DE DOCUMENT (Sprint 9):
          # le spec de contrat, sa preuve de morsure, et la sonde des voies
          # REELLES (celle qui force le payload vide de l'UI a ARRIVER vide).
          # Les retirer rend la porte d'entree de document_items jugeable
          # partiellement sans qu'aucun lot ne le voie.
          "verify:document-items", "verify:document-items-mord",
          "verify:document-items-voices",
          # Le contrat HACCP (Sprint 11): les routes d'ecriture du seul domaine
          # qui porte une OBLIGATION REGLEMENTAIRE (regl. (CE) n°852/2004 art. 5).
          # Les 5 tests HACCP de routes.spec.ts etaient des GET nominaux (un PASS
          # creux); les 8 CHEMINS C1..C8 jugent desormais l'ECRITURE et la
          # RELECTURE, et la morsure prouve que les 12 regles peuvent rougir.
          # Sans la porte `-mord`, l'une de ces routes peut redevenir un 200 muet
          # (releve en texte, lot a 0 kg, action corrective orphelinee) sans
          # qu'aucun lot ne le voie.
          "verify:haccp", "verify:haccp-mord",
          # Le contrat RECETTES (Sprint 12): les routes d'ecriture du domain
          # des recettes (POST/PUT/DELETE/save/generate-steps), chacune avec sa
          # preuve de morsure et les sondes des voies REELLES. Sans elles,
          # une de ces routes peut redevenir un 500 ou un 200 muet sans qu'aucun
          # lot ne le voie.
          "verify:recipes", "verify:recipes-mord",
          "verify:recipes-voices", "verify:recipes-put",
          # La spec de routes generales (49 tests, port fige 3999): la spec est
          # jouee par une porte depuis Sprint 12.1.
          "verify:routes",
          # Chantier 1 (audit 2026-10-02 §8) : l'identite. La sonde juge le
          # serveur REEL (spawn tsx, USER_DATA_PATH isole) : GET libre, mutation
          # anonyme 401, setup unique, agent refuse sur toute ecriture (§8 :
          # Hermes informe, l'humain execute). La retirer rend l'identite
          # jugeable partiellement sans qu'aucun lot ne le voie.
          "verify:auth",
          # Chantier 2 (feuille de route §8) : l'audit trail. La sonde juge le
          # serveur REEL (spawn tsx, USER_DATA_PATH isole) : chaque route
          # mutable testee doit ecrire UNE LIGNE dans audit_log, lue PAR DELTA
          # en base SQLite (le contrat "cite ≠ juge" : une route qui logge
          # mais jamais JUGEE n'est pas couverte). HACCP obligatoirement trace
          # (regl. (CE) n°852/2004 art. 5 : A1 temperature, A8 lots, A9
          # nettoyage, A10 actions correctives). La retirer rend la
          # tracabilite jugeable partiellement sans qu'aucun lot ne le voie.
          "verify:audit",
          # La morsure du contrat d'audit : elle retire le logAudit de
          # POST /api/staff, rejoue verify:audit, exige ECHEC sur A12 puis
          # RESTAURE (garde ARBRE_SALE). Elle prouve que la porte peut ROUGIR
          # — un PASS qui ne peut pas devenir FAIL n'est pas une mesure.
          # Elle exige un arbre propre (git checkout), donc elle n'est
          # JAMAS jouee sur un workspace sale.
          "verify:audit-mord",
          # Chantier 3 (feuille de route §8) : la boîte de suggestions. La
          # sonde juge le serveur REEL AVEC identite active : l'agent propose
          # (A1 — sa SEULE ecriture), le staff est refuse (A3), les payloads
          # invalides et les routes hors liste blanche sont refuses NOMMES
          # (A4), l'agent ne tranche pas (B1), le maitre applique (la route
          # cible est VRAIMENT rejouee, DELTA en base B2) ou rejette avec
          # motif obligatoire (B3/B4), deja decidee = 409 (B5), une action
          # que la cible refuse reste 'nouveau' (B6), l'application est
          # tracee dans audit_log (D1). La retirer rend la boite jugeable
          # partiellement sans qu'aucun lot ne le voie.
          "verify:suggestions",
          # La morsure du contrat suggestions : elle neutralise le CHECK de
          # la liste blanche (if (false)), rejoue verify:suggestions, exige
          # ECHEC sur A4c puis RESTAURE. Elle prouve que la boite ne peut
          # pas redevenir une voie de contournement de la gate §8 sans
          # qu'aucun lot ne le voie.
          "verify:suggestions-mord",
          # Chantier 6 (feuille de route §8) : les portes des DEUX MODES.
          # verify:mode-manuel juge le serveur avec COOKDRIVE_AGENT_OFF=1 et
          # identite active : la boite de suggestions est FERMEE (404), le
          # CRUD HUMAIN reste COMPLET (inventory CRUD + recipes + suppliers +
          # haccp), l'audit trail fonctionne toujours, l'agent ne peut RIEN
          # ecrire (l'exemption §8 fermee). verify:mode-agent juge la boucle
          # de bout en bout avec un cerveau FACTICE DETERMINISTE (le spec
          # joue l'agent par sa voie API reelle — JAMAIS de LLM en CI) :
          # l'agent lit tout, n'ecrit que ses suggestions, le maitre tranche
          # (applique -> DELTA cible / rejette -> motif), le staff garde son
          # CRUD terrain. Les retirer rend les deux modes jugeables
          # partiellement sans qu'aucun lot ne le voie.
          "verify:mode-manuel", "verify:mode-agent",
          # La morsure des deux modes : elle prouve que le garde MODE_SANS_
          # AGENT et l'exemption §8 peuvent rougir (mutation -> porte rouge ->
          # restauration). La regle 6 exige sa presence au DEFAUT : une sonde
          # citee par package.json sans etre au lot est une DEMI-PORTEE (le
          # capteur-orphelines rougit sinon — mesure du 08/10).
          "verify:mode-mord",
          # Chantier 4 (feuille de route §8) : le moteur de surveillance.
          # La sonde juge le serveur REEL : les regles deterministes (pas de
          # LLM) produisent des SUGGESTIONS et rien d'autre — chaque regle
          # est jouee sur un terrain semé par le spec puis jugee par DELTA
          # sur la table suggestions relue EN BASE. R1 rupture, R2 stock
          # mort, R3 DLC, R4 temperatures HACCP, R5 anti-gaspillage, S7
          # deduplication, S8 le moteur n'a JAMAIS ecrit le metier (§8),
          # S9 seuils configurables du maitre. La retirer rend la
          # surveillance jugeable partiellement sans qu'aucun lot ne le voie.
          "verify:surveillance",
          # La morsure du moteur : elle neutralise le filtre de dedup de la
          # route (les memes cles se repostent a chaque scan), rejoue
          # verify:surveillance, exige ECHEC sur S7a puis RESTAURE. Au lot
          # par la regle 6 (une sonde package.json sans DEFAUT est une
          # DEMI-PORTEE — le capteur-orphelines rougit sinon, mesure 08/10).
          "verify:surveillance-mord",
          # Chantier 5 (feuille de route §8) : le cerveau Hermes. La sonde
          # juge la BOUCLE (contexte -> consigne -> cerveau INJECTE ->
          # propositions validees -> boite) avec le cerveau FACTICE
          # DETERMINISTE — JAMAIS de LLM reel en CI. H3 DELTA en base sur
          # les propositions deposes, H5 dedup, H6 le cerveau n'a JAMAIS
          # touche le metier, H8 le contexte PUR, H9 AGENT_OFF coupe le
          # cerveau. La retirer rend le cerveau jugeable partiellement sans
          # qu'aucun lot ne le voie.
          "verify:hermes",
          # La morsure du cerveau : elle saute l'INSERT de deposition (la
          # boucle rend 200 sans rien deposer), rejoue verify:hermes, exige
          # ECHEC sur H3a puis RESTAURE (preuve de restauration, lecon
          # chantier 4). Au lot par la regle 6.
          "verify:hermes-mord",
          # Chantier 7 (fond de liste AGENTS.md) : l'hygiene TypeScript. La
          # porte juge le COMPTEUR d':any du BACKEND (routes/services/
          # middleware/db/shared, hors commentaires) — 0 depuis le chantier.
          # Le seuil ne peut qu'etre REABAISSÉ par un commit qui l'accompagne :
          # une regression remonte un rouge, jamais un silence. La retirer
          # rend la dette technique invisible a nouveau.
          "verify:types",
          # La morsure de l'hygiene : un :any reintroduit rougit (regle 6).
          "verify:types-mord",
          # Le contrat DASHBOARD (Sprint 13): les deux routes de LECTURE du
          # tableau de bord (cost-data + stock-data), chacune avec sa preuve
          # de morsure. Sans elles, la route cost-data peut redevenir une
          # SEMAINE FACTICE sur zero ligne (la famille de Sprint 10) sans
          # qu'aucun lot ne le voie.
          "verify:dashboard", "verify:dashboard-mord",
          # Sprint 14: deux nouvelles portes (KPI de cout du travail et la
          # vue reception, un fixture page -> les libs systeme du navigateur
          # en CI).
          "verify:kpi", "verify:reception",
          # La voie d'import CSV de l'auditeur (POST /api/inventory/bulk): elle
          # repondoit 404 et l'UI affichait un succes (audit C3). La porte juge
          # le contrat TOUT-OU-RIEN; sa morsure prouve que les douze verdicts
          # peuvent rougir. Les retirer rend l'import jugeable partiellement
          # sans qu'aucun lot ne le voie.
          "verify:inventory-bulk", "verify:inventory-bulk-mord",
          # Article 4 de l'audit du 20/09 (docs/audit-2026-09-20.md): les SONDES
          # BRUTES qui ne portaient AUCUNE barre. Les quatre "-voices" jugent les
          # VOIES REELLES de l'UI sur un serveur reel (la voie que le spec de
          # contrat n'a jamais recopiee); les trois "semantiques" juge la BIBLIOTHEQUE
          # node-sqlite3 / Number.* sur ce que la route suppose d'elle; la preuve
          # de morsure d'indices prouve que le garde du harnais d'indices rougit.
          # Retirer une de ces portes rend le contrat jugeable partiellement sans
          # qu'aucun lot ne le voie.
          "verify:inventory-put-voices", "verify:documents-validate-voices",
          "verify:post-inventory-voices", "verify:dashboard-voices",
          "verify:binding-semantiques", "verify:consume-semantiques",
          "verify:number-statics", "verify:indices-mord",
          # La sonde du REDISPOST du POST /api/inventory: elle rejoue le payload
          # EXACT que la porte npm envoie (unit:"") et dit si le contrat a bouge
          # (400/200). La porte du contrat la juge la spec, cette sonde-la dit
          # CE QUE le serveur rend quand on lui poste la mutation.
          "verify:juge-unite-vide",
          # --- Sprint 14.e: les sondes de l'article 4 C4 qui ont ete jugees
          # une a une et trouvees CAPABLES de rougir (classification par AST du
          # capteur: un chemin de sortie non nul conditionnel existe). Les
          # brancher a un sens; les retirer rend ces contrats jugeables
          # partiellement sans qu'aucun lot ne le voie.
          #   labor-cost-zero : le KPI de cout du jour, juge par DELTA et par
          #     contre-controles (jour voisin exclu, branche heritee, creneau
          #     vide) -- la mutation F4 de scripts/mutation-test-labor.py.
          #   put-yield : le PUT d'inventaire ecrit-il le rendement, en base.
          #   module-contract : le module partage HACCP par octets, par tsc, et
          #     le CONTRAT du token par EXECUTION (V5, consigne d'un verdict
          #     promit mais jamais calcule: la docstring le promettoit depuis
          #     sa creation sans que le corps ne le juge).
          #   installe-index / installe-index-forecast : l'index est POSÉ, le
          #     plan est PLEIN, la route rend un JSON exploitable.
          "verify:labor-cost-zero", "verify:put-yield", "verify:module-contract",
          "verify:installe-index", "verify:installe-index-forecast",
          # La porte du CAPTEUR: il ne juge pas le produit, il juge que le
          # depot ne produit pas de NOUVELLE sonde sans porte. Sans elle ici,
          # le defaut de l'article 4 (une liste FIGEE qui ne voit pas ce qui
          # s'ajoute) se rejoueroit sur le capteur lui-meme.
          "verify:capteur-orphelines",
          # Sprint 14.f: la couverture des FUSEAUX de la porte D1. C'est ici
          # qu'est le PIEGE a consigner, et pourquoi la MATRICE n'y est pas.
          # `matrice-fuseaux-d1.sh` depend de l'HEURE REELLE: hors du creneau
          # divergent (00:00-02:00 local) AUCUNE de ses zones ne diverge de
          # UTC, elle rend alors `MATRICE_NON_PRONONCEE rc=4` -- un refus
          # legitime de prononcer, mais que CE harnais compte comme ROUGE (il
          # ne connait que rc==0). Brancher la matrice ici ferait une porte
          # faussement rouge vingt-deux heures sur vingt-quatre: exactement la
          # famille des verdicts-mensonges que l'article 4 denonce.
          # L'examen de couverture, lui, fabrique ses vingt-quatre instants (le
          # suffixe Z fige l'echelle a UTC) et juge donc la couverture du jeu
          # sans dependre de l'horloge du serveur: il est vert a toute heure.
          # La matrice reste jouee a la main, dans le creneau, quand elle a
          # quelque chose a dire (les deux verdicts de 14.f, AVANT et APRES).
          #   La sonde du FUSEAU: elle fige son instant et rend, par fuseau,
          # les dates des DEUX voies (UTC par toISOString, locale par les
          # composants locaux). Elle dit DIVERGENT et ne depend pas de
          # l'heure ou on la joue; sa morsure est l'amplitude, qui doit
          # rester de sept jours calendriers dans chaque fuseau.
          "verify:juge-fuseaux", "verify:fuseau-cost-data",
          # Sprint 15 (Tache 5): la porte du CAPTEUR DE FOURNISSEURS. Elle ne
          # sonde PAS les serveurs reels du poste (dont la vie depend du
          # chargement du modele, mene par le maitre d'ouvrage): elle juge la
          # SONDE elle-même sur neuf serveurs fictifs dont le comportement est
          # ecrit d'avance, morsure incluse. Deterministe: jouable au lot sans
          # jamais rendre un faux rouge a une heure donnee.
          "verify:fournisseur-sonde",
          # verify:serveurs-locaux EST jouee au lot : le juge demarre ses
          # propres serveurs stubs sur ports ephemeres (jumeau deterministe).
          # Les ports d'usage reels ne sont JAMAIS joues par la porte — un
          # serveur qu'un humain lance/stoppe est un outil, pas une porte.
          "verify:serveurs-locaux",
          # verify:reglage-llm (Tache 9) : le juge lance le VRAI serveur (tsx,
          # port libre, jeton d'instance verifie) et joue /api/llm/tester avec
          # sa morsure muette — la voie est libre, pas de port fixe partage.
          "verify:reglage-llm",
          # verify:assistant (Tache 10) : l'etat machine de l'epreuve, juge par
          # lecteur FABRIQUE (le vrai Paddle n'est jamais joue par une porte —
          # les poids sont hors git, la course dependrait de l'infrastructure
          # d'autrui). Morsures : muet, forget, clef vide, clef qui ressort.
          "verify:assistant",
          # verify:ocr-moteur-mord (Tache 11) : la morsure du juge OCR joue la
          # CONSIGNE fabriquee (le couloir court-circuite le moteur) — elle ne
          # depend pas des poids et peut rester au lot. La course NOMINALE
          # verify:ocr-moteur est HORS DEFAUT, pour la MEME raison que
          # verify:ocr-modeles : elle joue le vrai moteur et exige les poids
          # (12,8 Mo hors git).
          # verify:llm-fournisseur (Tache 13) : les trois
          # voies du routage + le reglage LLM, juges au banc (le contrat nomme
          # la porte ; les juges existants sont joues sous leur nom).
          "verify:llm-fournisseur",
          "verify:extraction",
          "verify:langues-formats",
          "verify:etiquettes-dlc",
          # verify:livrable (Tache 14) : la sonde SUR PIECE des echantillons
          # construits (3 poids OCR aux scelles du manifest + les binaires
          # .node). Sans echantillon sous release/ elle rend la main (rc=0,
          # « rien a juger ») — la course ne rougit pas pour l'absence d'un
          # artefact hors git ; avec les pieces, elle juge pour de vrai.
          "verify:livrable",
          # verify:ocr-modeles EST volontairement HORS DEFAUT : les poids OCR
          # (12,8 Mo) ne sont pas sous git (decision du contrat, tache 7).
          # Dans un clone neuf sans les poids, la porte rougiROIT pour une
          # absence qui n'est pas un defaut du produit. Elle est jouee par
          # l'installeur (tache 14) et a la main ; sa morsure est prouvee par
          # test/banc/juge-modeles-ocr.py (trois fautes injectees, verrouillees
          # par le juge lui-meme).
          ]

# Le contrat de ce lot: les portes sont LUEES dans package.json, jamais recopiees
# ici. Une liste recopiee se perime silencieusement des qu'une porte change de
# nom (la meme faute que les budgets de BUDGETS recopies dans audit-perf.mjs, qui
# a fait annoncer un 429 inexistant pendant des jours).
def portes_declarees():
    with open(os.path.join(BASE, "package.json"), encoding="utf-8") as f:
        return set(json.load(f).get("scripts", {}))


def main(cible):
    declarees = portes_declarees()
    inconnues = [g for g in cible if g not in declarees]
    if inconnues:
        # Une porte qui n'existe plus dans package.json n'est pas une porte verte:
        # c'est une porte qui a cesse d'etre jugee. Elle doit etre nommee.
        print("PORTES_INCONNUES " + "|".join(inconnues))
        return 2

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.remove(OUT) if os.path.lexists(OUT) else None
    with open(OUT, "w", encoding="utf-8") as log:
        verdicts = []
        for g in cible:
            p = subprocess.run(["npm", "run", g, "--silent"], cwd=BASE,
                               capture_output=True, text=True, timeout=1800)
            txt = (p.stdout or "") + (p.stderr or "")
            verdicts.append((g, p.returncode))
            log.write("\n===== %s rc=%s =====\n%s\n" % (g, p.returncode, txt[-2500:]))
            log.flush()

    rouges = [g for g, rc in verdicts if rc != 0]
    with open(OUT, "a", encoding="utf-8") as log:
        log.write("\nGATES=%d\nROUGES=%d\n" % (len(verdicts), len(rouges)))
        if rouges:
            log.write("LISTE " + "|".join(rouges) + "\n")
        log.write("LOG " + OUT + "\n")
        log.flush()
    print("GATES=%d" % len(verdicts))
    for g, rc in verdicts:
        print("RC %s %d" % (g.replace(":", "_"), rc))
    print("ROUGES=%d" % len(rouges))
    if rouges:
        print("LISTE " + "|".join(rouges))
    # le OUT nominal du lecteur (test/gates.out) est un SYMLINK vers la course courante.
    # DEUX courses qui finissent ensemble meurent FileExistsError sur os.symlink sans
    # remplacement atomique: le lien est creé sous un NOM TEMPORAIRE (unique par course)
    # puis os.replace l'installe en UN geste atomique (POSIX rename(2) sur un symlink).
    TMP_LINK = SYMLINK + "-" + COURSE_ID + ".tmp"
    if os.path.lexists(TMP_LINK):
        os.remove(TMP_LINK)
    os.symlink(os.path.basename(OUT), TMP_LINK)
    os.replace(TMP_LINK, SYMLINK)
    print("LOG " + OUT)
    return 1 if rouges else 0


if __name__ == "__main__":
    cible = sys.argv[1:] or DEFAUT
    sys.exit(main(cible))
