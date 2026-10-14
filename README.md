# claus.io

**Système expert de gestion de cuisine professionnelle** — génération de menus par IA, HACCP, inventaire, achats fournisseurs, planification du personnel et analyse aromatique des ingrédients (moteur Epicure).

Application de bureau **100 % locale** : vos données (fournisseurs, factures, stocks, températures) restent sur votre machine. **Aucune donnée n'est envoyée dans le cloud** — l'IA tourne sur votre propre ordinateur.

[![CI](https://github.com/clausake/claus.io/actions/workflows/ci.yml/badge.svg)](https://github.com/clausake/claus.io/actions/workflows/ci.yml)
[![License: EUPL-1.2](https://img.shields.io/badge/License-EUPL--1.2-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)](https://nodejs.org)

<p align="center"><img src="public/screenshot.png" alt="claus.io" width="800"></p>

## Fonctionnalités

| Module | Ce qu'il fait |
|---|---|
| **Ingenierie des Menus** | Discutez avec l'assistant culinaire IA : il crée des fiches techniques complètes (ingrédients, quantités, étapes, allergènes) que le chef valide avant enregistrement |
| **Fiches Techniques** | Le livre de recettes par cartes (Entrée / Plat / Dessert), scan de menus papier par IA (OCR), export PDF |
| **Analyse de Menu** | Photo d'un menu → fiches techniques pré-remplies (le chef édite tout à 100 % avant de sauver) |
| **Inventaire** | Suivi des stocks, seuils d'alerte, import CSV, audit des écarts |
| **Achats** | Panier de production consolidé par fournisseur, bons de commande PDF, réceptions, comparaison de prix, mercuriales |
| **HACCP** | Journal de conformité : températures IoT en temps réel (SSE), DLC, lots, nettoyage, preuves sanitaires, export PDF réglementaire |
| **Plan de Production** | Recalcul automatique des quantités par nombre de couverts |
| **Anti-gaspillage** | Suggestions de recettes par l'IA sur les stocks critiques |
| **Planification** | Planning hebdomadaire du personnel, calcul des heures et du coût |
| **Epicure Studio** | Analyse aromatique : embeddings d'ingrédients, substitutions, accords |

## Intelligence : 100 % local par défaut, multi-moteurs

Le choix se fait dans **Réglages → Intelligence** et est **effectif à la génération** (jugé par la CI — voir `src/shared/llm.ts` et sa morsure) :

- **[Ollama](https://ollama.com)** (défaut) — API native, vision incluse, repli OCR Tesseract automatique
- **Serveurs locaux compatibles OpenAI** — llama.cpp-server, **vLLM** (port 8000 détecté automatiquement), SGLang, LM Studio (`/v1/chat/completions`)
- **Fournisseurs cloud** (optionnel, liste blanche fermée) : OpenAI, Mistral, Anthropic, Cohere, DeepSeek — la clef d'API vit dans l'environnement (`OPENAI_API_KEY`...), jamais en base, jamais à l'écran ; l'URL de la liste ne peut pas être remplacée (anti evil-proxy)

**Hermes**, le cerveau de suggestions, surveille l'établissement (ruptures, DLC, températures) et propose des actions — que l'humain applique de sa main (le compte IA n'a jamais le droit d'écrire : 403 sur toute route mutable).

La liste des serveurs locaux est détectée automatiquement au démarrage (ports 11434, 8080, 1234, 8000).

## Architecture

- **Frontend** : React 19 + Vite + Tailwind CSS, lazy-loading par vue
- **Backend** : Express + SQLite (20 routeurs, `server.ts` 258 lignes), `127.0.0.1:3000`
- **Desktop** : Electron (Windows NSIS, macOS DMG, Linux AppImage/deb)
- **OCR** : PaddleOCR PP-OCRv5 (12,8 Mo, hors ligne) + repli Tesseract
- **Epicure** : embeddings d'ingrédients 300d (arXiv:2605.22391)
- **Identité** : sessions argon2, audit trail de chaque écriture (règlement CE 852/2004 art. 5)

## Prérequis

- **Node.js >= 22**
- **Python 3.12** (pour le lot des 84 portes de qualité)
- **Ollama** + un modèle (`ollama pull llama3.1`) — ou un autre serveur local

## Installation

```bash
git clone https://github.com/clausake/claus.io.git
cd claus.io
npm install
cp .env.example .env   # renseigner si nécessaire
```

## Lancement

```bash
npm run dev     # développement : http://localhost:3000
npm start       # production locale
```

Windows : `LANCER_APPLICATION.bat`. L'URL du moteur IA est configurable dans les Réglages.

## Build des exécutables

```bash
npm run build:exe     # Windows (NSIS)
npm run build:mac     # macOS (DMG)
npm run build:linux   # Linux (AppImage, deb)
```

## Qualité : 84 portes, 0 rouge

Le projet est jugé par **84 portes automatiques** (lot `npm run verify:all`), exécutées à chaque push par la CI GitHub Actions :

- **Types** : `tsc --noEmit` 0 erreur + **zéro `:any`** (seuil 0, morsure prouve que la porte rougit)
- **Tests** : 170 tests unitaires (vitest)
- **e2e** : 46 routes en contrats Playwright (serveur isolé par spec)
- **Sécurité** : sessions, rate-limit, garde d'instance, audit trail (+ morsures)
- **Contrats métier** : recipes, purchasing, inventory, HACCP, documents, dashboard, KPI
- **LLM** : porte unique de génération (le réglage est effectif — morsure incluse), fournisseurs, serveurs locaux
- **Journal** : vérification anti-perte cryptographique du journal des phases (SHA-256)

Chaque porte a une **morsure** (test négatif) qui prouve qu'elle peut rougir : *« un PASS qui ne peut pas devenir FAIL n'est pas une mesure »*.

```bash
npm run verify:all            # le lot complet (verdict lu, jamais inféré)
python3 scripts/lire-gates.py # qui est rouge (jamais grepper test/gates.out)
```

## Données

100 % locales : SQLite, uploads et réglages dans `%APPDATA%\ClausIO` (Windows) ou `~/.clausio` (macOS/Linux).

## Licence

### Code claus.io — EUPL-1.2

Logiciel libre sous **[EUPL-1.2](./LICENSE)**.

- **Usage** : gratuit pour tous, y compris professionnel (restaurants, traiteurs...)
- **Modification** : libre ; toute version modifiée doit rester sous EUPL-1.2 et publier son code source (SaaS inclus)
- **Revente du logiciel** : **interdite** — quiconque distribue claus.io (modifié ou non) doit partager l'intégralité de son code sous la même licence. Le logiciel ne peut pas devenir un produit payant fermé
- **Services autour du logiciel** (installation, support, formation, hébergement) : possibles
- **Copyright** : © 2026 ClausIO

### Composants tiers

Les données **Epicure** (embeddings d'ingrédients) sont redistribuées sous **CC BY 4.0** avec attribution (Radzikowski & Chen, arXiv:2605.22391). OCR `fra.traineddata` : Apache 2.0. Détails : [`NOTICE.md`](./NOTICE.md).
