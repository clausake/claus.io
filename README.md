# claus.io

Application de bureau **100 % locale** pour la gestion de cuisine professionnelle : génération de menus par IA, HACCP, inventaire, achats fournisseurs, planning du personnel et analyse aromatique d'ingrédients (moteur Epicure).

L'IA fonctionne **localement via [Ollama](https://ollama.com)** : aucune donnée n'est envoyée dans le cloud.

## Licence

claus.io est un logiciel libre distribué sous **[GNU AGPL-3.0](./LICENSE)**.

- **Usage** : libre, y compris commercial.
- **Modification** : libre ; toute version modifiée doit rester sous AGPL-3.0 et publier son code source, y compris pour un déploiement en réseau (SaaS inclus).
- **Fork commercial fermé** : interdit — quiconque distribue ou expose claus.io (modifié ou non) doit partager l'intégralité de son code source.
- **Copyright** : © 2026 ClausIO

## Architecture

- **Frontend** : React 19 + Vite + Tailwind CSS (`src/`)
- **Backend** : Express + SQLite (`server.ts`), écoute sur `127.0.0.1:3000`
- **Desktop** : Electron (`electron/main.cjs`)
- **IA** : Ollama (LLM local) + moteur d'embeddings Epicure (`epicure.ts`, fichiers `embeddings*.safetensors` et `vocab.json` requis à la racine)

## Prérequis

- **Node.js >= 22**
- **Ollama** installé et démarré, avec au moins un modèle téléchargé (ex. `ollama pull llama3.1`)

## Installation

```bash
npm install
cp .env.example .env   # puis renseigner les variables si nécessaire
```

## Lancement en développement

```bash
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000). Sous Windows, vous pouvez aussi utiliser `LANCER_APPLICATION.bat`.

L'URL d'Ollama est configurable dans les paramètres de l'application (par défaut `http://localhost:11434`).

## Build des exécutables

```bash
npm run build:exe     # Windows (NSIS)
npm run build:mac     # macOS (DMG)
npm run build:linux   # Linux (AppImage, deb)
```

Les installeurs sont générés dans `release/`.

## Données

Les données utilisateur (base SQLite, uploads, settings.json) sont stockées dans :

- Windows : `%APPDATA%\ClausIO`
- macOS / Linux : `~/.clausio`

## Qualité

```bash
npm run lint   # vérification TypeScript (tsc --noEmit)
npm run build  # build frontend
```
