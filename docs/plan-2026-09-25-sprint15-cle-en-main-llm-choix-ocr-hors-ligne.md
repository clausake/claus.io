# Sprint 15 - Livraison « clé en main » : LLM au choix + OCR hors connexion

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** A l'installation sur Windows (`.exe` NSIS), macOS (`.dmg`) ou Linux (AppImage/deb), CookDrive fonctionne sans aucune installation annexe, et l'utilisateur y choisit son intelligence : un moteur local (llama.cpp ou Ollama) ou un service en ligne.

**Architecture:** Trois surfaces distinctes, une seule porte d'entrée chacune. (1) Une couche fournisseur de LLM (`src/shared/fournisseur/`) qui parle l'API OpenAI sur n'importe quel serveur (llama.cpp, Ollama en mode `/v1`, vLLM, SGLang, prestataire en ligne) et l'API native d'Ollama pour la vision. (2) Un moteur OCR local (PaddleOCR PP-OCR v5, poids léger : 12,8 Mo au total) avec repli sur Tesseract. (3) Un assistant de premier demarrage qui juge chaque choix par une generation REELLE, non par un `200`.

**Tech Stack:** React 19 · Express + SQLite (`sqlite3`) · Electron 41 + electron-builder 26 (`nsis`/`dmg`/`AppImage`+`deb`) · `ppu-paddle-ocr` 6.6.0 + `ppu-ocv` 4.0.0 + `onnxruntime-node` 1.30.0 (tous MIT) · `tesseract.js` 7.0.0 (repli).

---

## 1. Ce qui est mesuré, pas presume

Chaque ligne ci-dessous porte la commande qui l'a produite. Rien n'y figure qui n'ait été joué.

| Fait | Comment il a été mesuré |
|---|---|
| Le livrable cible les trois systèmes | `package.json` → `build.win.target = nsis`, `build.mac.target = dmg`, `build.linux.target = [AppImage, deb]` |
| Le livrable **n'embarque aucune ressource** | `build.files = ["dist-server/**/*", "dist/**/*", "electron/**/*", "package.json"]` — aucun `extraResources` |
| Ollama est instauré sur ce poste, **sans aucun modèle** | `curl http://localhost:11434/api/tags` → liste vuide. Le chef ne peut donc s'en servir tel quel |
| `tesseract.js` n'embarque **aucun** traineddata | `du -sh node_modules/tesseract.js` = 1 411 341 octets ; `find … -size +100k -name 'fra*'` = 0 |
| La voie OCR du produit est un **repli**, pas la voie principale | `src/shared/ollama.ts:87` : Tesseract ne s'active que si `Failed to load image` |
| Aucune image du dépôt n'est exploitable | 5 PNG de `test/tmp-data/uploads/` = 72 octets, `IHDR: CRC error` ; `public/screenshot.png` = `cannot identify image file` |
| Le serveur du poste sert deux cerveaux par l'API OpenAI | `curl :8888/v1/models` → `qwen3.8-flash-next` ; `curl 192.168.99.1:18080/v1/models` → `GLM-5.3-Flash-EXL3-2.05` |

### ⚠ RETRACTATION (à lire avant toute implémentation)

Deux verdicts de la séance du 25/09 ont été rétractés, et ils portaient sur ce plan :

1. **Moteur local par defaut: OLLAMA** (decide par le maitre d'ouvrage, 25/09). Le code du produit le confirm: `getModel` (`src/shared/ollama.ts:30-34`, lu aux octets) rend deja un nom de modele Ollama quand les Reglages sont vuodes — le defaut y est donc naturel, pas impose. La voie llama.cpp reste ecrite et reglable (Taches 2 et 3): un choix de l'utilisateur, pas un defaut. ⚠ **CONDITION DE VALIDITE**: mesure du 25/09 sur ce poste, `command -v ollama` le trouve et le port 11434 ecoute, mais `GET /api/tags` rend une liste de modeles **VIDE**. Un defaut sans modele installe est un « pret » mensonger: l'assistant de la Tache 10 doit rendre `AUCUN_MODELE_INSTALLE` et conduire l'utilisateur a l'installlation d'un modele, et le bouton « Enregistrer » reste desarme jusqu'a ce qu'une GENERATION REELLE ait eu lieu (la sonde de la Tache 5 en est l'arbitre).
2. **Fournisseurs en ligne: LISTE BLANCHE** (decide par le maitre d'ouvrage, 25/09). Cinq noms, et cinq seuls, sont admis; une URL hors liste est refusee a l'enregistrement des Reglages (`400` + raison nommee). Epreuve de recevabilite jouee le 25/09 (`GET <base>/v1/models` sans clef): `openai.com` 401, `mistral.ai` 401, `anthropic.com` 401, `groq.com` **404**, `cohere.com` 401, `deepseek.com` 401. Le `401` est l'etat ATTENDU d'un endpoint sans clef: il dit « routeur vivant ». Le `404` de Groq dit « routeur vivant, inventaire des modeles non publie »: si la sonde de la Tache 5 jugeoit sur `/v1/models`, elle feroit rougir un fournisseur SAINT. Donc la vie d'un fournisseur se juge par une GENERATION REELLE (ce que la Tache 5 fait deja) et un `404` sur l'inventaire est un etat licite, pas une panne. Retenus (cinq): `openai.com`, `mistral.ai`, `anthropic.com`, `cohere.com`, `deepseek.com`. Retire (un): `groq.com`, faute d'un contrat d'inventaire verifiable. Chaque nom retenu a rendu `401` a l'epreuve du 25/09; aucun nom verifie ne reste sans sort.


---

## 2. Ce que dit le cahier des charges fonctionnelles

- **Logiciel livré** : installeur complet pour les trois systèmes. « Prêt clé en main » = après l'installation, sans réseau et sans rien télécharger de plus, le chef peut saisir ses factures et lire ses plats.
- **Au choix de l'utilisateur** : il installe **à son choix** un moteur **local**, ou il connecte une intelligence **en ligne**. Ce n'est pas une dégradation, c'est une option. Les deux doivent être déclarés dans les Réglages, et jugés par une épreuve réelle avant d'être acceptés.
- **Hors connexion** : le poste du chef est réputé hors connexion (réponse à la question posée le 25/09 : « REELLEMENT : local d'abord, distant en secours »). Le secours en ligne ne peut donc être qu'un **repli** explicite, jamais une dépendance.

---

## 3. Taches

### Tache 1 : La couche fournisseur — les types

**Objectif :** Déclarer la surface de commande unique des fournisseurs de LLM.

**Fichiers :**
- Créer : `src/shared/fournisseur/types.ts`
- Modifier : `src/services/settings.ts` (les clefs de réglage)

**Étapes.**

1. Écrire `FournisseurLLM`, l'interface unique :

```ts
export interface FournisseurLLM {
  readonly nom: string;
  generer(requete: RequeteGeneration): Promise<ReponseGeneration>;
  listerModeles(): Promise<Modele[]>;
  sonde(): Promise<Sonde>;            // generation de 8 tokens, pas un ping
}
```

2. Déclarer les clefs de réglage (`llm_four` = fournisseur par défaut, `llm_alt` = fournisseur de secours) : `llm_choix` (`"llamacpp" | "ollama" | "openai"`), `llm_url`, `llm_modele`, `llm_cle`, `llm_secours_url`, `ocr_moteur` (`"paddle" | "tesseract"`).
3. Vérifier qu'aucune clef ne porte un secret en clair (voir Tache 12).
4. `npx tsc --noEmit` — attendu : 0 erreur. *Le collecteur ne joue pas le lint : le jouer à la main.*
5. Committer, fichier par fichier (`git add` chemin par chemin, **jamais** `-A`).

---

### Tache 2 : L'adaptateur OpenAI (le point commun des serveurs)

**Objectif :** Un seul adaptateur pour llama.cpp, Ollama-`/v1`, vLLM, SGLang, LM Studio et les prestataires en ligne.

**Fichiers :**
- Créer : `src/shared/fournisseur/openai.ts`
- Tester : `test/unit/fournisseur-openai.spec.ts`

**Étapes.**

1. Écrire le test **qui echoue** : une requete de generation doit produire `reponse.texte`, et une erreur de transport doit lever `FournisseurAbsent`, jamais rendre un texte vu.
2. Jouer le test — attendu : FAIL, `generer is not a function`.
3. Écrire `openai.ts` : `POST {url}/v1/chat/completions`, corps `{model, messages, temperature, max_tokens, stream:false}`. Le texte est rendu par `choix[0].message.content`. **Ne pas présumer** du champ : le lire, et s'il manque, lever une exception nommée `ReponseInvalide`.
4. Jouer le test — attendu : PASS.
5. Committer.

> **Patron vérifié :** `src/shared/util.ts:71` (`getOllamaHost`) et `src/shared/ollama.ts:37` (`ollama.client`) sont les deux seuls endroits où le dépôt parle d'un hôte. La nouvelle voie les remplace, elle ne les double pas : voir la regle de la source unique (Sprint 7, `src/shared/util.ts`).

---

### Tache 3 : L'adaptateur Ollama natif (pour la vision des factures)

**Objectif :** Conserver la voie `images` du paquet `ollama`, que l'API OpenAI ne porte pas de façon uniforme.

**Fichiers :** Créer `src/shared/fournisseur/ollama-natif.ts` ; réutiliser `src/shared/ollama.ts`.

**Étapes :** 1. test qui échoue (une image en base64 doit être reçue) ; 2. FAIL ; 3. écrire `POST {url}/api/generate` avec `payload.images` ; 4. PASS ; 5. commit.

---

### Tache 4 : Le routage des fournisseurs (le choix de l'utilisateur)

**Objectif :** Résoudre le fournisseur réglé, avec le secours en ligne en dernier recours.

**Fichiers :** Créer `src/shared/fournisseur/index.ts`.

**Étapes.**

1. Test qui échoue, **à trois voies distinctes, à trois attentes distinctes** (la regle du harnais de morsure du dépôt) :

| Voie | Réglage | Attendu |
|---|---|---|
| A | `llm_choix = "llamacpp"`, serveur vivant | rc 0, `source = "llamacpp"` |
| B | `llm_choix = "llamacpp"`, serveur **mort** | rc ≠ 0 et le nom du defaut est rendu |
| C | `llm_choix = "openai"` (secours), sans serveur local | rc 0, `source = "openai"` |

2. FAIL ; 3. Écrire `resoudreFournisseur(settings)` : la chaîne est `local → local → secours`. Le repli est **explicite** : il rend `source` et `repli = true`, jamais un `source` muet.
4. PASS aux trois voies ; 5. commit.

---

### Tache 5 : La sonde qui juge (défendre les faux `200`)

**Objectif :** Nul ne peut juger d'un serveur sur ses `GET /v1/models` : `200` ne prouve l'inférence de rien.

**Fichiers :** Créer `scripts/sonde-fournisseur.mjs`.

**Étapes.**

1. La sonde, logée dans un **fichier** (`.mjs` joué par `node`), jamais en `node -e` inline — le harnais de sécurité du poste bloque l'inline, et un inline ne se relit pas.
2. Elle tend un per, lit trois choses : `listerModeles()` rend au moins un modèle ; `generer()` rend une chaine non vide de ≥ 4 caractères ; le tout en dessous de 20 secondes.
3. Elle rend `SONDE_FOURNISSEUR: VERT` ou nomme le defaut (`MODELES_ABSENTS`, `GENERATION_MUETTE`, `DELAI_DEPASSE`).
4. Jouée seule, sur les deux serveurs réels du poste (:8888 et :18080) — attendu : `VERT` deux fois.

---

### Tache 6 : Le moteur OCR local (la part du principal)

**Objectif :** Lire le texte et les nombres d'une facture **sans réseau**, à la façon de PaddleOCR.

**Fichiers :**
- Créer : `src/shared/ocr.ts`, `src/shared/ocr-moteurs/paddle.ts`, `src/shared/ocr-moteurs/tesseract.ts`
- Ajouter à `package.json` : `ppu-paddle-ocr`, `ppu-ocv`, `onnxruntime-node`

**Étapes.**

1. Mesurer avant de prescrire : la voie `engine: "canvas-native"` du paquet est **sans dependance OpenCV** (donc sans binaire natif à porter sur trois systèmes) ; la voie `engine: "opencv"` (WASM) fonctionne aussi. Les deux sont jouées dans le spike ; la seconde est la plus legere, la première donne plus de garanties.
2. **Contournement du defaut mesuré** : `loadImage()` rend un `Image` **sans** `getContext`, et le paquet passe ce dernier à `canvasWithCtx.getContext("2d")` → `TypeError`. La voie qui marche : passer le **chemin du fichié** au lieu du tampon (`sonde-5`, voie B : `OK, 725 caracteres`) ; ou fabriquer une vraie toile (`createCanvas` → `getContext("2d")` → `drawImage`, voie C : `OK, 725 caracteres`). **Ne pas** passer le tampon nu.
3. Écrire le juge des champs : pour chaque champ attendu (`raison_sociale`, `date`, `numero`, `siret`, `total_ht`, `tva`, `total_ttc`), séparer les lignes **avant** de comparer (voir la retractation 1).
4. TDD : le test de la facture synthétique doit d'abord échouer (moteur absent), puis passer après l'installation du moteur.
5. `npx tsc --noEmit` ; commit.

---

### Tache 7 : Embarquer les modèles (la ressource du livrable)

**Objectif :** Sans reseau, rien télécharger : les poids et mesures des modèles sont ci-dessous.

| Fichier | Rôle | Taille mesurée |
|---|---|---|
| `det.onnx` (PP-OCR v5 mobile) | détection des zones de texte | 4 748 769 |
| `rec.onnx` (PP-OCR v5 latin) | reconnaissance, 32 langues dont le françois | 8 066 518 |
| `dict.txt` | les caractères (1 673, dont `é è à ç û ô î œ`) | 2 617 |
| **Total** | | **12 817 904 ≈ 12,8 Mo** |

**Étapes.**

1. Ajouter `build.extraResources` : `[{ from: "modeles-ocr", to: "modeles-ocr", filter: ["**/*.onnx", "**/*.txt"] }]`.
2. Écrire `scripts/verif-modeles-ocr.py` : controler par empreinte, `sha256sum` de chaque fichier contre un manifeste **hors du livrable** (l'ancre extérieure, la regle des trois conditions du journal scellé).
3. Les télécharger une fois, hors du dépôt, et les consigner (`git` ? **non** : 12,8 Mo dans Git est une lourdeur ; voir les risques, tâche 14, question du dépôt).
4. Jouer la vérification — attendu : `MODELES: 3/3 CONFORMES`.

---

### Tache 8 : Le serveur LLM local, livré avec l'application

**Objectif :** Que le chef ait, sans rien installer de sa main, un moteur qui tourne.

**Étapes.**

1. Mesurer l'existant : `llama-server`, `llama-cli`, `llama-bench`, `exllama-server`, `vllm-serv` sont **absents** de ce poste (`command -v`). Ollama est présent (`/usr/local/bin/ollama`) mais **ses modèles sont vuid**.
2. Déclarer le parti : **ne pas** embarquer un binaire de 100 Mo dans l'installeur. Le livrable livre le *moteur de recherche* de l'IA locale : il détecte les serveurs sur les ports d'usage (11434 Ollama, 8080 llama.cpp, 1234 llama.cpp) par `GET /v1/models`, et les met dans le menu des Réglages.
3. L'utilisateur installe **à son choix** le moteur de son choix ; l'assistant (Tache 10) l'y conduit et l'y aide par une épreuve jugée.
4. Si aucun serveur n'est trouvé : rendre un **message clair** (`AUCUN_MOTEUR_TROUVE`) avec les trois voies de recours (llama.cpp, Ollama, service en ligne), jamais un tableau de bord muet.

---

### Tache 9 : Les Reglages (la partie visible de l'utilisateur)

**Objectif :** Faire en sorte que le choix de l'IA se lise et s'écrive dans la langue du chef.

**Étapes.**

1. Dans `src/components/SettingsPanel.tsx` (la vue qui règle), ajouter le panneau « Intelligence » : trois boutons — *Local (détecté)*, *Ollama*, *En ligne* — et deux champs (URL, nom du modèle).
2. Les textes passent par `TRANSLATIONS` (`src/data/translations.ts`), **cinq** langues, alignées sur le référentiel : le français est la langue de l'ouvrage.
3. Le bouton « Tester » joue la sonde (Tache 5) et rend le verdict ; tant que le verdict est rouge, le bouton « Enregistrer » reste désarmé.

---

### Tache 10 : L'assistant de premier demarrage (la clé en main)

**Objectif :** A la premiere ouverture, sans réseau et sans manuel, conduire l'utilisateur aux trois choix de l'IA.

**Étapes.**

1. **Écran 1 — Le moteur** : rendre les serveurs detectes ; en choisir un, ou « Je n'ai rien : installez un moteur » (les trois voies de la Tache 8).
2. **Écran 2 — La clé** : si « en ligne » est choisi, demander la clé du portafeuil **et la stocker dans le trousseau de clés du systeme d'exploitation**, jamais dans la base SQLite.
3. **Écran 3 — L'épreuve** : faire une saisie de test (une facture synthétique, Tache 11) et rendre le résultat. Sans épreuve réussie, le demarrage n'est pas acquis.
4. Consigner le demarrage dans `settings` (`install_termine_le`, `fourisseur_choisi`).

---

### Tache 11 : La banque de factures de référence (le juge des moteurs)

**Objectif :** Juger les impressions, juger les moteurs de l'OCR, sur pièces.

**Étapes.**

1. La piece d'essai — **la source de verite de toutes les gardes** — vit sous `test/banc/facture-synthetique.png` (104 159 octets, scelle `876842cba13f`) avec ses attendus en `..json`. Elle est GENREe par `test/banc/fab-facture.py`, qui ecrit CHEZ LUI et rend le meme scelle a chaque course (verifie le 25/09 par deux courses). Elle ne doit JAMAIS etre deposee dans un dossier de traval: le scratch est purge a 24 heures et une porte sans piece ne mord rien. Les lignes de lecture de la piece (SIRET, TVA, DLC, montants) sont celles que la garde de la tache 15 verifie.
2. Attendre du chef : **10 à 20 factures réelles** de ses fournisseurs, versées dans `test/fixtures/factures/` (le dépôt de l'épreuve, `.gitignoré` si personnelles et confidentielles : **elles portent des prix et des noms de fournisseurs**).
3. Le juge (`scripts/juge-ocr.py`) rend, par moteur et par piece : le taux d'erreur de caractère, le nombre de champs atteints, et le **temps** (p50/p95). Attendu pour la mise à jour du tableau : aucun moteur ne peut être déclaré « prêt » sur la seule facture synthétique.

---

### Tache 12 : La clé du prestataire (sécuriser les accès)

**Objectif :** Ni clé, ni mot de passe ne doit figurer dans le code source ni dans la base.

**Étapes.**

1. La clé d'API du service en ligne est consignée dans le trousseau du système : `safeStorage` d'Electron (`main.cjs`, la zone **sans porte de gates du harnais** — `tsconfig.json` exclut `electron/`, donc seule une voie vit : la juger par `npx vitest run`, voir la regle du Sprint 6).
2. **Jamais** dans `settings` en clair (la table est lisible par tout fichier de la sauvegarde), **jamais** dans le code d'un appel d'outil (les arguments sont journalisés : `agent.log`, `gateway.log`).
3. En cas de fuite, seule la **révocation** répare.

---

### Tache 13 : Les portes (le harnais du sprint)

**Objectif :** Une porte que personne n'appelle n'est pas une porte (regle 6 : `package.json` **et** `DEFAUT` de `scripts/run-all-gates.py`, les deux à la fois).

**Étapes.**

1. Quatre portes nouvelles, toutes jugées par des **instants fabriqués** (la leçon du Sprint 14.f : une porte qui lit l'horloge rougit la nuit) :

| Porte | Ce qu'elle juge | Morsure |
|---|---|---|
| `verify:llm-fournisseur` | les trois voies de la Tache 4 | `verify:llm-fournisseur-mord` |
| `verify:llm-sonde` | une génération réelle, pas un `200` | idem |
| `verify:ocr-moteur` | les 7 champs sur les pièces | `verify:ocr-moteur-mord` |
| `verify:modeles-ocr` | l'empreinte des 3 modèles | retirer un modèle → doit rougir |

2. Chaque morsure est jouée à la main **avant** d'être branchée, et doit rougir par une faute **injectée et vérifiée présente** (la leçon des ancres de mutation mortes).
3. Brancher aux deux endroits ; jouer le lot complet — attendu : `ROUGES=0`, `ALLRC=0`, et le compte des portes **lu aux octets** (`grep -c '^RC ' test/gates-run.txt`), non compté de mémoire.

---

### Tache 14 : L'installeur des trois systèmes (la livraison)

**Objectif :** Publier le livrable clé en main sur les trois marchés.

**Étapes.**

1. Vérifier sur place la distribution des binaires natifs, à la façon des cinq (les familles déjà en place dans `optionalDependencies` : `@esbuild`, `@rollup/rollup`, `@tailwindcss/oxide`, `@napi-rs/canvas`, `lightningcss` — chacune avec ses entées `linux`/`x64`, `darwin`, `win32`). Ajouter `onnxruntime-node` et ses entrées, **sinon** `vite build` casse en CI avec `MODULE_NOT_FOUND` (la regle des binaires du dépôt).
2. `npm run build` puis `npx electron-builder --linux`, puis `--win --x64` (deux **mots**, un seul trait d'union : les traits longs du CLI sont corrompus par le rendu du poste).
3. **Ce que la reproduction locale ne peut pas juger** (consigné, non caché) : `docker` tourne en natif `arm64` et `binfmt`/`qemu` n'est pas enregistre (`/proc/sys/fs/binfmt_misc` sans entée `qemu`) — un conteneur `--platform linux/amd64` rend `exec format error`. Le Windows et le macOS **ne sont pas testables ici** : les faire tester par le chef, ou par la CI.
4. Vérifier sur pièce, sur chaque échantillon : l'installeur livré contient bien les 3 modèles (`12,8 Mo`), et l'application installée démarre **sans réseau** (faire : couper le réseau, ouvrir l'application, juger : la sonde de la Tache 5 doit rendre `AUCUN_MOTEUR_TROUVE` et non une exception).

---

### Tache 15 : Le contrat d'extraction — ce qui tue l'hallucination

**Objectif :** Qu'AUCUN nombre ni aucun identifiant n'entre dans la base sans preuve
matérielle. La règlecardinale, seule voie qui ne peut pas mentir: **le moteur OCR
détermine, le cerveau LLM ne fait que ranger.** Il ne calcule jamais un montant, il
ne "complet" jamais un champ, il ne "corrige" jamais un caractère.

**Fichiers :** Créer `src/shared/extraction/` (`garde-arithmetique.ts`,
`garde-identifiants.ts`, `garde-dlc.ts`, `preuve-ancre.ts`) + la porte
`scripts/negative-test-extraction.py`.

**Les quatres gardes, toutes mesurées le 25/09 (`juge-gardes-extraction-b.py`) :**

| Garde | Regle | Mesure du 25/09 |
|---|---|---|
| **Arithmétique** | `round(qte × pu, 2) == montant` par ligne ; `Σ montants == total HT` ; `HT × taux == TVA` ; `HT + TVA == TTC` | **4/4 mutations rougies** (confusion `0→O`, `5→S`, transposition `71→17`, glissement decimal `112,50→11,25`), temoin sans mutation **VERT** |
| **SIRET** | clef de l'INSEE: les 3 derniers chiffres de l'identifiant sont le reste de la division des 11 premiers par quatre-vingt-dix-sept | mesure du 25/09: **le banc portoit un SIRET INVALIDE** (`00027`, la clef vraie est `066`) → banc corrigé. Une piece à identifiant fautif ne peut pas juger la voie « accepte » |
| **Numeró TVA** | `clef = (12 + 3 × (SIREN % 97)) % 97` | calculee: `78` → `FR78412857339` |
| **DLC / DDM** | **deux regles distinctes**: DLC (« a consommer jusqu'au ») passee = REFUSEE ; DDM (« de preference ») passee = LICITE | **6/6** verdicts justes, dont `31/02`, `13/13` refusés (date inexistante) et `05/l0` refusé (caracteres ambigus) |

**Le contrat de la preuve ancrée (la part qui tue l'hallucination):**

1. Pour CHAQUE champ rendu, exiger une `preuve`: `{texte_ocr, ligne, debyte, findebyte}`.
   La chaîne de `texte_ocr.slice(debut, findebyte)` doit etre **egale** à la valeur
   rendue. Un champ sans preuve = refus `CHAMP_SANS_PREUVE`, rendu `null`, jamais
   comblé. (Mesure du 25/09: `0` refus sur une piece propre — au-dessus de `0`, c'est
   l'OCR qui n'a pas lu, et le LLM n'a pas le droit de completer.)
2. Un nombre **non fini** (`NaN`/`Infinity`) est refusé à la porte (la leçon du dépôt:
   `JSON.stringify(Infinity)` rend `null` — la saisie ne peut jamais devenir un nombre).
3. Les caractères ambigus (`0/O/o`, `1/l/I`, `5/S`, `6/G`, `8/B`, `9/q`) ne sont JAMAIS
   « corrígés » par le LLM : ils rendent une alerte `AMBIGU` avec les **deux lectures**,
   et la ligne attend le chef. Un `34,90` cru en `34,98` sans alerte est une carte d'achat
   fausse sans limite.
4. La saisie est **confirmée par le chef** avant d'écrire la colonne qui désigne le
   fournisseur (`src/shared/util.ts`, la colonne à trois portes): la voie facture →
   prix fournisseur est la classe de faute la plus chère du dépôt (Sprint 7).

**TDD:** chaque garde a son test qui échoue d'abord; la porte de morsure injecte les
quatres mutations ci-dessus et **rougit** si une seule ne mord pas (`rc=1` + le check
nomé). Brancher aux DEUX endroits (regle 6).

### Tache 16 : Formats selon la langue — la locale est DECLAREE, jamais inférée

**Le fait qui décide de tout :** la langue de l'INTERFACE n'est pas la langue de la
PIECE. Le chef change l'interface en anglais et recoit une facture allemande : si le
changement d'interface changeait aussi la lecture des nombres, le prix change de
mille fois sans qu'aucun code ne crashe.

**Fichiers :** Créer `src/shared/i18n/` (`locales.ts`, `nombre.ts`, `date.ts`,
`mots-cles.ts`) + la porte `scripts/mesurer-langues-formats.py`.

**Ce que la langue change (mesuré le 25/09), et ce que chacun coûte si on le devine :**

1. **Les nombres — le séparateur est le multiplicateur du prix.** Lu avec la mauvaise
   règle, `419,60` devient `41960.00` (**x100**) et `1.234,56` devient `1.23456`
   (**x1000**), sans exception, sans crash : rien ne révèle la faute. La règle du dépôt
   est déjá là (`src/shared/document-items.ts:156-170`) : « on ne DEVINE pas le
   séparateur décimale ». Elle devient règlecardinale d'importation.
2. **Les dates — 39 % sont structurellement ambiguës.** Sur les 365 dates licites en
   `[jj/mm]`, **144 sont licites aussi en `[mm/jj]`** (mesuré). Pour ces 144, aucune
   vérification ne peut dire la bonne lecture : un `5/9` est licite deux fois. C'est
   la classe de faute la plus dangereuse du lot, parce qu'elle est **invisible à
   toute garde** — `05/09/2026` est une date valide. Seule une locale DECLAREE tranche.
3. **Les libellés de péremption sont propres à chaque langue** (fr
   « à consommer jusqu'au / de préférence avant le », de « Mindestens haltbar bis /
   Verbrauchen bis », es « Consumir preferentemente antes de », it « Da consumarsi
   entro », nl « Te gebruiken tot »). La garde DLC de la tache 15 est donc
   **multilingue par construction**, sinon elle refuse en bloc ce qu'elle lit mal.
4. **Le dictionnaire de l'OCR est fermé** (mesure du 25/09 : 774 signes; fr, de, it,
   pt, nl, pl, tr COUVERTS, `¡` ABSENT en espagnol). Un signe hors du dictionnaire
   rend un voisin : le mot se lit, personne ne doute. Le nom de langue pilote donc le
   MODELE et les mots-cles, pas seulement une étiquette d'affichage.

**La réglecardinale de la tache :** `locale_depuis = DECLARE` — un choix du chef,
par piece ou par fournisseur, **jamais une inférence du contenu**. Une valeur dont
la lecture dépend de la locale non declaree rend `null` + alerte `LOCALE_REQUISE`
et attend le chef, exactement comme `CHAMP_SANS_PREUVE` de la tache 15. Le
détecteur structurel (`virgule + 2 decimales` = décimal ; `point + 3` = milliers) est
autorisé UNIQUEMENT comme assistant qui pré-coche un champ, jamais comme source de
la valeur : il tranche souvent, mais `1.234` est licite en allemand (1234) ET en
anglais (1.234) — mesure du 25/09, c'est le cas `AMBIGU`.

**Tâches de la tache :** (a) la matrice `locale → (regex nombre, ordre de date,
libellés DLC, modele OCR)` ; (b) une porte qui, pour CHAQUE locale, relance le
banc de la tache 15 dans SA langue et exige le meme verdict (les totaux, les dates,
le SIRET) ; (c) un test qui **rougit si une valeur ambiguë sort une valeur** au lieu
de `null` (la porte de morsure de la classe : retirer la garde DOIT faire rougir).

#### Tache 16 (suite) — Couverture des scripts : on ne promet que ce qui est prouvé

Relevé du 25/09, dépot des modèles `ppu-paddle-ocr-models` (branche `main`, voie
`resolve`), mesuré par `curl -sSL` **avec suivi des redirections** — la première
tentative sans le suivi a rendu quatres `302` et n'a rien appris : un `302` ne dit
rien de l'existence du modèle.

| Script | HTTP | Poids (octets) | Estimation |
|---|---|---|---|
| latin | 200 | 8 066 518 | **PROUVÉ présent** — égal au `rec.onnx` du spike, les deux mesures concordent |
| cyrillic | 200 | 8 073 294 | **PROUVÉ présent** |
| arabic | 200 | 8 023 442 | **PROUVÉ présent** |
| devanagari | 200 | 7 936 806 | **PROUVÉ présent** |
| les autres scripts non latins | 404 | 15 | **UNKNOWN** — la nomination réelle de ces modèles n'a pas été établie |

Les `404` ci-dessus **ne sont pas une preuve d'absence**. La sonde qui eut voulu les
énumérer par l'API du dépôt (`/api/repos/…/tree/main/…`) a rendu une page d'erreur
au lieu d'une liste : le capteur était mort sur cette voie, son silence ne compte
pas. La vérification est reportée (consigner la vraie liste des scripts publiés, ou
télécharger le pack multilingue complet et lever l'ambigüité des nominations).

**Ce qui en suit la règle pour le produit :**

1. **Quatre scripts sont garantis hors du doute** (latin, cyrillic, arabic,
   devanagari) : les langues qui les écrivent peuvent être importées sans risque.
   Le tâche 16 (a) ne doit donc promettre que ces quatres-là dans la matrice
   `locale → modèle`.
2. **Interdiction formelle du remplacement silencieux** : pour une locale dont le
   script n'est pas prouvé présent, l'importation **refuse** (`SCRIPT_NON_GARANTI`
   + `null`), elle ne substitue pas le script latin au script inconnu. Un texte en
   écriture non latine rendu par le modèle latin sort en glyphes sans valeur, sans
   exception et sans signe : c'est le pire genre de faute, parce que la pièce
   importée a l'air lisible et qu'aucune garde ne la devine.
3. Le poids est proportionné : ~8 Mio par script. Une case « langue du fournisseur »
   qui cocherait dix scripts coûterait ~80 Mio — la matrice est donc **à la
   demande** (téléchargement paresseux au premier usage, à la première saisie de la
   locale), jamais en bloc.

## 4. Questions ouvertes (les décisions du chef)

1. **Le moteur local par défaut** : llama.cpp (léger, API OpenAI, sert bien les cartes GPU — le chef a déjà un `GLM-5.3-Flash-EXL3` en EXL3) ou Ollama (déjà instauré sur ce poste, écouté sur 11434, mais ses modèles sont vuid) ? **Le plan écrit pour les deux** (Taches 2, 3, 8) : le choix n'est pas un bloqueur, c'est un réglage.
2. **Les services en ligne admis** : faut-il une **liste blanche** des prestataires (3 ou 4 noms d'hôtes connus, audités), ou la liberté du champ des URL ? Le conseil est pour la liste blanche : une URL quelconque + une clé volée dans les nuages du portail, c'est un droit de l'utilisateur ; un risque de fuite des données client, c'est le notre.
3. **La vision des factures** : un seul modèle pour la lecture et l'écriture, ou deux (un OCR, un LLM) ? Le plan tient les deux (Taches 3 et 6) et laisse le réglage au chef.

---

## 5. Risques et pieges (à conserver, non à oublier)

| Risque | Portée | Parade mesurée |
|---|---|---|
| **Tesseract hors connexion : non prouvé** | La voie de repli peut être morte sur un poste neuf | Le paquet tire ses langues d'un CDN (`cdn.jsdelivr.net`), `cachePath` par défaut = `'.'`. Mesuré : avec `cacheMethod: "none"` et `langPath` sur un port mort (127.0.0.1:9), l'appel **aboutit** — mais le dépôt portoit un `fra.traineddata` à la racine qui l'a leu. **Re-mesurer sur un poste neuf.** |
| `ppu-paddle-ocr` est un portage **tiers**, non l'éditeur officiel PaddlePaddle | Licence MIT, 6.6.0, publié le 13/09/2026 — mais tiers | Le figer par sa version et son empreinte (`package-lock.json`), et ne juger que sur les mesures du banc d'essai (Tache 11) |
| Le defaut `loadImage()` sans `getContext` | Peut corrompre les mesures (le `TypeError` se lit « moteur cassé ») | Ne pas passer le tampon : passer le **chemin** (voie B, mesurée `OK`) ou une vraie toile (voie C, mesurée `OK`) |
| Un `200` de `/v1/models` | Faux positif le plus cher : `200` ne prouve l'inférence de rien | Juger par une **génération réelle** (Tache 5), avec persistance sur deux battements |
| 12,8 Mo de modèles dans le livrable | Poids du livrable ; et dans Git, une lourdeur | Hors Git (un dépôt d'artefacts, ou `extraResources` téléchargés à la construction), avec un manifeste d'empreintes **hors** du livrable |
| `electron/` et `*.cjs` hors du `tsconfig.json` | Une zone **sans porte de gates** : `npx tsc --noEmit` ne voit jamais ce qui tourne dans `main.cjs` | Loger la logique dans un module jugé par `npx vitest run` (le patrone du Sprint 6, `electron/ready-parity.cjs`) |
| Deux cerveaux dans le même arbre de travail | Un `git add -A` balayé le travail d'autrui | `git add` chemin par chemin, jamais `-A` ; `git diff --cached --name-only` avant le commit |

---

## 6. avant-propos de la validation

- [ ] Les quatre portes nouvelles (Tache 13) sont jouées par `scripts/run-all-gates.py` et citées aux **deux** endroits (regle 6).
- [ ] Le lot complet rend `ROUGES=0 ALLRC=0` et le compte est **lu aux octets**.
- [ ] `npx tsc --noEmit` est joué **dans le tour de l'édition** de tout `.ts`/`.tsx` (le collecteur ne le joue pas).
- [ ] Le journal `PHASES.md` est scellé dans le **même** commit (ancre re-calculée par le code du juge, `scripts/decouper-phases.py`).
- [ ] L'installeur est vérifié **hors connexion** sur les trois systèmes (ou la preuve du contraire, consigné : non testable ici).
