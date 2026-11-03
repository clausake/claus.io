# Plan d'attaque — Qwen — les trois défauts du poste Windows (03/11/2026)

Retours du maitre d'ouvrage sur l'installeur **0.1.3** réellement installé sur son
portable Windows (même Wi-Fi que le cluster, pair Tailscale `claus`
100.107.17.60) :

1. **« Tester » sur le moteur IA → `TEST ÉCHOUÉ (HTTP_404)`** ; il a dû corriger
   l'URL à la main (`http://localhost:11434`), puis **saisir le nom exact du
   modèle à la main** pour que ça marche.
2. **Le lien Wi-Fi ne s'ouvre pas sur le smartphone** (`http://192.168.1.8:3000`).
3. **L'historique du chat disparaît** : il discute avec l'IA, change d'onglet,
   revient — plus rien. « Il n'y a plus de mémoire. »

Consigne du maitre d'ouvrage : **corriger ces petits détails sans casser le
logiciel**. Un commit par étape, preuve brute + run CI vert à chaque étape.

## 1. Faits mesurés (03/11, sur cette machine) — à re-mesurer, pas à recopier

### Défaut 1 — l'URL du moteur est testée avec un chemin en trop

- Défauts écrits en dur avec un **endpoint**, pas une **base** :
  `src/App.tsx:74` et `src/services/settings.ts:45` →
  `ollama_url: "http://localhost:11434/api/generate"`.
- `POST /api/settings` persiste le corps **tel quel** (`src/routes/settings.ts:179`,
  aucune liste blanche hors secrets) : la valeur empoisonnée est écrite dans
  `settings.json` du client et rechargée par le panneau
  (`src/components/SettingsView.tsx:164`).
- `cibleDuReglage` (`src/shared/fournisseur/reglage-llm.ts:52-55`) prend
  `llm_url` **brut** comme `base`. La sonde y ajoute `/api/tags`
  (`scripts/sonde-fournisseur.mjs:154`) et `/api/generate` (ligne 166).
- **Reproduction mesurée** (Ollama vivant sur le port 11434 de cette machine) :

```
$ npx tsx <script jetable appelant cibleDuReglage + getOllamaHost>
base construite par cibleDuReglage : http://localhost:11434/api/generate
host normalise par getOllamaHost   : http://localhost:11434
URL finale de la sonde (/api/tags) : http://localhost:11434/api/generate/api/tags
```
```
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:11434/api/generate/api/tags   -> 404
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:11434/api/tags                -> 200
```
**404 ≠ 405** : Ollama répond 405 sur `/api/generate` en GET (le chemin existe),
donc le 404 de la capture est bien le **chemin doublé**, pas un moteur éteint.

- Point capital : `getOllamaHost` (`src/shared/util.ts:210-221`) **normalise déjà**
  correctement (il rend `protocol//host`). Le trou est **localisé** à
  `cibleDuReglage` — c'est pour ça que la génération marchait déjà et que seul le
  bouton « Tester » échouait.

### Défaut 1 bis — le modèle doit être tapé à la main

- Le champ « Nom du modèle » du panneau Intelligence est un `<input>` libre
  (`src/components/SettingsView.tsx:527-533`), sans aucune suggestion.
- Les modèles **sont déjà connus** du client : `/api/llm/detecter`
  (`src/routes/settings.ts:146-150`) rend `serveurs[].modeles[]`
  (`src/shared/fournisseur/serveurs-locaux.ts:39`, rempli ligne 99).
- Un état `availableModels` existe déjà (`SettingsView.tsx:175`) mais n'alimente
  qu'un **autre** sélecteur plus haut (`SettingsView.tsx:339-354`), pas le champ
  du panneau Intelligence.

### Défaut 2 — le QR code annonce une adresse qui ne peut pas répondre

- `src/routes/settings.ts:189-201` annonce `http://<1re IPv4 non interne>:3000`.
- **Le serveur n'écoute que sur loopback** : `server.ts:250`
  `const HOST = process.env.HOST || "127.0.0.1";` et **rien** ne pose `HOST`
  (mesuré : un seul hit `HOST=` dans tout le dépôt, celui-là ; le lanceur
  `electron/main.cjs` ne transmet que `NODE_ENV`, `COOKDRIVE_READY_FILE`,
  `COOKDRIVE_INSTANCE_TOKEN`, `COOKDRIVE_DIST`).
  Donc `http://192.168.1.8:3000` **ne peut pas** répondre au téléphone, pare-feu
  ou non. Le 200 obtenu sur `http://127.0.0.1:3000` côté PC est cohérent.
- Le choix de l'IP est en plus **fragile** : premier `Object.keys` venu. Même
  algorithme rejoué ici → `172.17.0.1` (docker0 !), il annoncerait
  `http://172.17.0.1:3000`. Sur le PC il a rendu la bonne IP **par chance**.
- Aucun réglage d'exposition LAN n'existe (grep `lan_|acces_reseau|network_access`
  sur `src/services/settings.ts` + `src/routes/settings.ts` → 0 hit).
- Bonne nouvelle pour la suite : `electron/ready-parity.cjs:29,83` traite
  `0.0.0.0`/`::` comme adresses **non liées** et ouvre la fenêtre sur
  `127.0.0.1` — binder plus large ne casse pas la fenêtre.

### Défaut 3 — l'historique du chat est un état de composant

- `src/components/CulinaryChat.tsx:37-39` : `messages` en `useState([])`.
  **Aucune persistance** : `localStorage|sessionStorage|indexedDB` → **0 hit**
  dans tout `src/`.
- `src/App.tsx:595` : `{activeTab === "menus" && (… <LazyViews.MenuAnalysis …>)}`
  → changer d'onglet **démonte** `MenuAnalysis`, donc `CulinaryChat`, donc l'état.
- `src/components/MenuAnalysis.tsx:98` (`vue`) et `:103` (`propositions`) sont
  aussi des états locaux : les **cartes de recettes déjà générées** sont perdues
  avec l'historique (c'est le vrai travail du chef).
- Le serveur est **sans état** : `src/routes/ai.ts:108-116` relit l'historique
  depuis `req.body.history` à chaque tour. Perdre le client = perdre la mémoire.
- Conséquence secondaire : une réponse **en cours** (l'IA « écrit ») est perdue
  au démontage (`setMessages` sur composant démonté).

## 2. Ordre d'exécution et périmètre

| Étape | Objet | Risque | Dépend de |
|---|---|---|---|
| **P1** | Base d'URL normalisée dans `cibleDuReglage` + défauts corrigés | faible (fonction pure) | — |
| **P2** | Suggestions de modèles dans le champ « Nom du modèle » | faible (additif UI) | P1 |
| **P3** | Historique du chat + cartes survivent au changement d'onglet | moyen (état) | — |
| **P4a** | Choix de l'IP LAN : fonction pure + `null` honnête | faible (fonction pure) | — |
| **P4b** | Exposition LAN **opt-in** (décision du maitre requise) | **sécurité** | P4a |
| **P5** | Journal `PHASES.md` + ré-ancrage | faible | P1-P4 |

**Règle d'or inchangée** : l'agent n'écrit jamais en base, l'humain clique et
exécute. Aucune étape ci-dessous n'ajoute d'écriture serveur.

---

## P1 — l'URL du moteur : une base, pas un endpoint

### Consigne
1. Ajouter dans `src/shared/fournisseur/reglage-llm.ts` une **fonction pure**
   `baseNue(url: string): string` qui retire, en boucle, un suffixe d'endpoint
   (`/api/generate`, `/api/chat`, `/v1/chat/completions`, `/v1`, `/api`) puis les
   `/` de fin. Même sémantique que `getOllamaHost` (`src/shared/util.ts:210-221`),
   mais **sans** `new URL` (qui réussit sur une URL à chemin et ne normalise donc
   pas : c'est exactement le piège mesuré).
2. L'appliquer dans `cibleDuReglage` aux branches `ollama` (ligne 53) **et**
   `llamacpp` (ligne 57) : `base: baseNue(base)`.
3. Corriger les deux défauts : `src/App.tsx:74` et `src/services/settings.ts:45`
   → `http://127.0.0.1:11434` (base nue).
4. **Ne pas** toucher `getOllamaHost` (il est déjà juste) ni `DEFAUT_OLLAMA`.
5. Couvrir par des tests dans `test/unit/reglage-llm.test.ts` (le fichier existe) :
   `…/api/generate` → base ; `…/api/generate/` → base ; `…/v1/chat/completions`
   → base ; base nue → inchangée ; `llamacpp` idem ; chaîne vide → `URL_ABSENTE`
   pour llamacpp (comportement actuel préservé).

### Interdits
- Réécrire `scripts/sonde-fournisseur.mjs` (la sonde est le juge, pas le fautif).
- « Réparer » en changeant `DEFAUT_OLLAMA` (déjà bon) ou en ajoutant une rustine
  dans le composant React.
- Toucher `pdf-parse` ou toute dépendance.
- Ajouter une clé de réglage ou une migration de `settings.json` : la
  normalisation se fait **à la lecture**, donc les installations existantes
  (dont celle du maitre) sont réparées sans réinitialiser sa configuration.

### Preuves exigées
```
npx vitest run test/unit/reglage-llm.test.ts      # rc=0, cas ci-dessus couverts
npm run verify:reglage-llm                        # juge existant, vert
npm run verify:llm-fournisseur                    # lot LLM, vert
npx tsc --noEmit && npm run build
```
Plus la preuve de bout en bout **sur un vrai Ollama** (port 11434 de cette
machine) : POST `/api/settings` avec `llm_url = http://localhost:11434/api/generate`,
puis `GET /api/llm/tester` → `vivant: true` (aujourd'hui : `DEFAILLANCE`/404).

---

## P2 — le nom du modèle : proposer ce qui est détecté

### Consigne
1. Dans `src/components/SettingsView.tsx`, l'input « Nom du modèle » (527-533)
   reçoit un `list="modeles-detectes"` + un `<datalist id="modeles-detectes">`
   rempli par les modèles **déjà détectés** : `serveursDetectes.flatMap(s =>
   s.modeles.map(m => m.nom))` (source `serveurs-locaux.ts:39,99`).
2. Le champ **reste libre** (un chemin `.gguf` de llama.cpp n'est pas un nom de
   modèle Ollama) — aucune validation bloquante, aucune valeur imposée.
3. Si la détection ne rend rien : `datalist` vide, **pas** de message d'erreur
   nouveau (le message `AUCUN_MOTEUR_TROUVE` existant suffit, ligne 471-476).
4. Aucune nouvelle dépendance, aucun appel réseau supplémentaire
   (`/api/llm/detecter` est déjà appelé au montage, ligne 157).

### Interdits
- Remplacer l'input par un `<select>` (casserait llama.cpp et les modèles non
  listés).
- Écrire une valeur par défaut dans `llm_modele` en douce : le maitre choisit.
- Ajouter un `:any` dans `src/` (la porte `verify:types` juge zéro `:any`).

### Preuves exigées
```
npx tsc --noEmit && npx vitest run && npm run build
npm run verify:ui-tabs && npm run verify:bundle && npm run verify:types
```
Capture d'écran du panneau (les suggestions apparaissent) **ou**, à défaut,
la sortie de `verify:ui-tabs` + le diff (3-8 lignes) collé dans le commit.

---

## P3 — l'historique du chat (et les cartes) survivent au changement d'onglet

### Consigne
1. Créer `src/shared/atelier-chat.ts` : **store de module** (pas de disque, pas de
   base) exposant `messages`, `propositions`, `enCours`, et
   `useSyncExternalStore`-compatible : `sAbonner(fn)`, `instantane()`,
   `envoyer(message)`, `reinitialiser()` (pour les tests).
2. `envoyer()` porte le `fetch("/api/ai/chat")` **dans le store** (aujourd'hui
   `CulinaryChat.tsx:134`) : la réponse atterrit dans le store même si le
   composant est démonté — c'est ce qui répare « l'IA écrit, je change d'onglet ».
   L'historique envoyé reste `historiqueSur(messages)`
   (`src/shared/recette-chat.ts:129`, fenêtre 12, déjà bornée côté serveur).
3. `CulinaryChat.tsx` ne garde **que** `input`, `isLoading`, `isListening` en
   `useState` ; `messages` vient du store. Le message d'accueil
   (`CulinaryChat.tsx:40-57`) devient l'état initial du store, pas un effet.
4. Les cartes : `propositions` (`MenuAnalysis.tsx:103`) passent dans le **même**
   store. À la remontée du composant, elles sont **redérivées** de la dernière
   réponse brute stockée (le parseur `handleProposition` reste dans
   `MenuAnalysis`, il n'est pas déplacé) — ainsi le travail du chef survit au
   changement d'onglet sans introduire de callback inter-composants fragile.
5. `envoyer()` **refuse** un second envoi tant que `enCours` est vrai (même
   garde qu'aujourd'hui, `CulinaryChat.tsx:122`).
6. **Rien sur le disque** : ne pas introduire `localStorage`/`sessionStorage`
   (aucun n'existe aujourd'hui dans `src/` ; en ajouter change la surface de
   confidentialité d'un poste partagé). La mémoire vit le temps de la session.

### Interdits
- Persister le chat en base (l'agent n'écrit jamais ; et aucune migration).
- Lever l'état dans `App.tsx` par une chaîne de props (rendrait `App.tsx` —
  déjà 700+ lignes — responsable d'un détail) : le store de module est le point
  le plus petit qui survit au démontage.
- Changer la fenêtre d'historique (`historiqueSur`, 12 messages) pour « faire
  mieux » : c'est un contrat serveur mesuré.
- Ajouter un `:any` ou désactiver un test existant.

### Preuves exigées
```
npx vitest run test/unit/atelier-chat.test.ts   # nouveau : abonnement, envoi, cap, reset
npx tsc --noEmit && npx vitest run && npm run build
npm run verify:ui-tabs && npm run verify:bundle
```
Test de non-régression **exigé** : deux montages successifs (démontage entre les
deux) rendent les **mêmes** messages — c'est la traduction exacte du défaut
rapporté. Les e2e locaux ne sont **pas** fiables sur ce poste
(`requestAnimationFrame` = 0, consigné au journal) : la CI fait foi.

---

## P4a — l'IP LAN : la choisir, ou dire qu'il n'y en a pas

### Consigne
1. Créer `src/shared/reseau.ts` avec une **fonction pure**
   `choisirIpLan(interfaces)` : exclut `internal`, `169.254.*`, et les
   interfaces manifestement non-LAN (`docker`, `br-`, `veth`, `wsl`, `vEthernet`,
   `VirtualBox`, `tailscale`, `utun`, `tun`, `tap`) ; préfère `192.168.*`, puis
   `10.*`, puis `172.16-31.*` ; rend `null` si aucune candidate.
2. `src/routes/settings.ts:189-201` utilise cette fonction et, si `null`, rend
   `{ ip: null, port, url: null }` — **jamais** une URL inventée.
3. `SettingsView.tsx` affiche alors « aucune adresse LAN détectée » au lieu
   d'une adresse fausse (le QR n'est rendu que si `url` existe, ligne 662).
4. Tests unitaires `test/unit/reseau.test.ts` : wifi+tailscale+docker → wifi ;
   tailscale seul → `null` ; `169.254` ignoré ; `10.x` préféré à `172.17.x`.

### Interdits
- Filtrer par « premier trouvé » ou par nom d'interface exact du poste du maitre.
- Changer le **bind** du serveur dans cette étape : P4a ne touche pas `HOST`.

### Preuves exigées
```
npx vitest run test/unit/reseau.test.ts && npx tsc --noEmit && npm run build
npm run verify:routes && npm run verify:bundle
```
Et la mesure qui a motivé l'étape, rejouée : sur cette machine, l'algorithme
actuel annonce `172.17.0.1` (docker0) ; après P4a il doit rendre `null` ou une
IP de LAN réelle, jamais une IP de pont docker.

---

## P4b — l'accès smartphone : **décision du maitre requise avant code**

Aujourd'hui le panneau « Accès Smartphone Wi-Fi » (`SettingsView.tsx:628-687`)
**promet** un accès que le serveur refuse par construction (`HOST` loopback,
mesuré ci-dessus). Deux issues honnêtes, **exclusives** :

**Option A (recommandée) — opt-in explicite.** Une clé `lan_acces` (défaut
`false`) ; quand elle est `true`, le serveur binde `0.0.0.0` et le panneau
affiche : l'URL, le rappel « même Wi-Fi », la commande de pare-feu Windows
(profil **Privé** seulement) et un avertissement « votre inventaire est visible
sur le réseau local ». La fenêtre Electron reste sur `127.0.0.1`
(`electron/ready-parity.cjs:29,83`, déjà mesuré). L'authentification (chantier 1)
reste **active** et le rate-limit auth **inchangé**.

**Option B — la vérité sans exposition.** Le panneau cesse d'afficher une URL/QR
LAN ; il explique que l'accès smartphone n'est pas encore activé et renvoie vers
une note de version. Zéro surface réseau nouvelle.

Ce qui est **interdit dans les deux cas** : binder `0.0.0.0` par défaut,
désactiver l'auth ou le rate-limit « pour que ça marche », changer `HOST` dans
les tests/CI, ou laisser le QR menteur en place.

Preuves exigées (option A) : `curl` depuis une **autre** machine du LAN rend le
HTML de connexion (302/200 attendu) et **jamais** l'app sans session ;
`verify:auth` vert **sans** les envs de harnais ; `verify:ratelimit` vert ;
smoke AppImage toujours vert (il tape `127.0.0.1`, insensible au bind).

---

## P5 — journal et clôture

1. Entrée datée dans `PHASES.md` : les trois défauts, leurs **causes mesurées**
   (les chiffres ci-dessus), ce qui a été corrigé, ce qui a été **refusé** et
   pourquoi (P4b si option B).
2. `docs/` : compléter `docs/audit-2026-11-02.md` ou une note dédiée pour la
   décision P4b (l'exposition LAN est une décision d'exploitation, elle se
   consigne).
3. Ré-ancrage **conforme à la recette** : `npm run verify:split` rend `rc=4` +
   `recolle <sha>` ; reporter CE sha dans `phases/manifest.json`
   (`original_sha256`) ; `sha256_original_avant_reancrage` et le `.orig` **ne
   bougent pas** ; rejouer `verify:split` **avant** de committer.

## 3. Interdits du chantier (transverses)

- Toucher `pdf-parse` (4 routes métier l'importent : `documents.ts:8`,
  `haccp.ts:6`, `menu.ts:6`, `recipes.ts:27`).
- Ajouter une dépendance npm pour ces quatre corrections (datalist, store de
  module, fonction pure : zéro dépendance).
- Ajouter un `:any` dans `src/` (`verify:types` juge zéro).
- Modifier la fenêtre d'historique du chat, la sonde fournisseur, ou la
  sémantique de `historiqueSur`.
- Poser une porte `verify:` nouvelle sans l'inscrire **aussi** dans `DEFAUT`
  de `scripts/run-all-gates.py` (règle 6 : une porte que personne n'appelle
  n'est pas une porte).
- Committer sans avoir rejoué la porte concernée (jamais de `--no-verify`).

## 4. Preuve de sortie (à produire à CHAQUE étape)

```
npx tsc --noEmit                     # rc=0
npx vitest run                       # 188 + les nouveaux, 0 échec
npm run build                        # rc=0, bundle sous seuil
npm run verify:reglage-llm           # P1
npm run verify:llm-fournisseur       # P1/P2
npm run verify:ui-tabs               # P2/P3
npm run verify:types                 # toutes
npm run verify:auth                  # toutes (P4b : sans envs de harnais)
npm run verify:routes                # toutes
npm run verify:bundle                # toutes
npm run verify:split                 # P5 (rc=0 avant commit)
```
Plus : **run CI vert 7/7** du commit poussé (lien du run dans le commit ou le
rapport), et pour P1 la preuve `GET /api/llm/tester → vivant:true` sur un vrai
Ollama.

## 5. Ce que ce chantier ne fait pas (à dire, pas à taire)

- Il ne rend pas le `.exe` Windows fumé automatiquement : c'est la limite P3 du
  plan `013` (le smoke ne couvre que l'AppImage Linux). Une machine Windows reste
  nécessaire pour cette preuve.
- Il ne rend pas les e2e locaux fiables sur le poste de dev
  (`requestAnimationFrame` = 0) : la CI reste la source de vérité.
- Il ne « répare » pas le moteur IA du maitre : Ollama était **déjà** vivant
  (`/api/tags` = 200, mesuré). Seul le **chemin** testé était faux.
