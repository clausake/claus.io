# Plan d'attaque — Qwen — chantier Shannon : pentest offensif sans risque pour les données (03/11/2026)

**À exécuter APRÈS le chantier `014` (P1→P6, release 0.1.4 incluse).** Un pentest
lancé contre une cible qui bouge se jette : la cible doit être l'arbre publié.

Origine de la demande : le maitre d'ouvrage a soumis `github.com/KeygraphHQ/shannon`
à un agent. Question posée : « il est déjà implanté, ou c'est une bonne idée ? »

## 0. Ce que Shannon est, et ce qu'il n'est pas

Mesuré dans le dépôt amont (README lu le 03/11) :

- **Un pentester autonome** : il analyse le code source, en déduit des chemins
  d'attaque, puis **exécute de vrais exploits** contre l'application en marche.
  Devise : « no exploit, no report » — seules les failles prouvées entrent au
  rapport.
- Il tourne dans un **conteneur Docker éphémère**, monte le dépôt **en lecture
  seule** et écrit ses rapports dans un workspace local.
- Il **mute la cible** : « can create users, submit forms, mutate application
  state, trigger outbound requests ».
- 1 à 1,5 h par scan ; **BYOK** (le modèle est à ta charge) ; accepte Ollama/vLLM
  en local ; sortie PDF + Markdown + **SARIF 2.1.0** ; Action GitHub (dépôt
  **privé** + runner avec Docker exigés).
- Licence **AGPL-3.0**.

**Ce n'est donc pas une bibliothèque à « implanter »** : c'est un outil externe
qu'on **exécute** contre une cible.

### Etat mesuré dans claus.io (03/11)

```
shannon  dans le dépôt (code, docs, deps)      : 0 hit
keygraph dans le dépôt                         : 0 hit
commits mentionnant shannon (toutes branches)   : 0
controle positif (ollama, meme capteur)        : 1093 hits  -> le capteur voit
```
Donc : **rien n'est implanté**, et il n'y a rien à « désinstaller ».

### Licence : la règle qui protège le produit

Le produit est **EUPL-1.2** (`package.json`), Shannon est **AGPL-3.0**.
**Exécuter** un outil externe ne contamine pas le produit. **Copier** du code de
Shannon dans `claus.io` forcerait la distribution combinée sous AGPL.
Règle non négociable : **on l'exécute, on ne le vendore pas** (aucun fichier de
Shannon dans l'arbre, aucun `git submodule`, aucun copier-coller de source).

## 1. Pourquoi ça vaut le coup (et où ça ne remplace rien)

Les 98 portes `verify:` testent des **contrats fonctionnels** : « la route répond
ce qu'elle promet ». Elles ne cherchent **pas** l'injection SQL, le SSRF, le
contournement d'autorisation, le XSS ou l'abus de session. Shannon, si — c'est
exactement sa liste : `injection`, `xss`, `auth`, `authz`, `ssrf` (les cinq
classes du schéma amont, non configurables).

Surface réelle chez nous, mesurée : **112 routes déclarées** dont **66 mutables**
(`router.(post|put|patch|delete)` sur `src/routes/*.ts`), une gate de session
(`src/middleware/auth.ts`), un compte agent refusé en 403 sur toute écriture
(`AGENT_LECTURE_SEULE`, `src/middleware/auth.ts:94`), et bientôt une exposition
LAN (P4b du plan `014`).
**C'est cette dernière qui rend le pentest urgent** : exposer l'inventaire à un
réseau, même domestique, change le modèle de menace.

## 2. Deux décisions à prendre AVANT de lancer (sinon l'agent tranche seul)

**D1 — le modèle.** Shannon exige un modèle qui suit ses consignes et l'usage
d'outils. Le README amont prévient qu'avec un modèle local les résultats sont plus
faibles ; ses benchmarks publiés utilisent DeepSeek v4 Flash, Grok 4.6, Opus 5.
Options : (a) modèle local du cluster (Ollama 11434 / vLLM, coût ≈ 0, qualité à
prouver) ; (b) fournisseur cloud BYOK (coût réel, qualité de référence).
**Consigne par défaut : commencer en (a) sur une passe unique**, et ne payer (b)
que si le rapport local est vide **alors que** les portes e2e prouvent que les
routes répondent.

**D2 — la portée.** Instance **fraîche** (base jetable, données créées par
l'API) ou **copie** de la base du maitre (meilleure surface, mais données réelles
sur disque). Par défaut : **instance fraîche** (S1). La copie est une **seconde**
passe, optionnelle, avec les précautions de S1-bis.

## 3. S0 — prérequis, mesurés avant de commencer

```
docker version --format '{{.Server.Version}}'   # exige un demon ACTIF (29.1.3 mesure ici)
node -v                                         # >= 18 (v26.12.1 mesure ici)
df -h /tmp                                      # le workspace Docker grossit
npx @keygraph/shannon@latest --version           # NOTER la version exacte, la figer dans ce doc
```
Si le démon Docker est arrêté (`systemctl is-active docker`), le redémarrer **et
le consigner** : sur cette machine il a déjà été `inactive` une partie de la
journée. Ne pas conclure « Shannon ne marche pas » d'un Docker éteint.

**Consigne** : remplacer `@latest` par la version notée dès que S0 a parlé
(reproductibilité). Ne pas inventer de numéro de version dans ce document.

## 4. S1 — l'instance de pentest isolée (le cœur du chantier)

### Le mécanisme d'isolation existe déjà, mesuré

`src/db/init.ts:20-33` : `resolveStorageDir()` lit **`USER_DATA_PATH`** et y pose
`agent_culinaire.db` ; sans elle, il retombe sur `~/.clausio`. Donc **changer
`USER_DATA_PATH` suffit à changer de base** — c'est le levier d'isolation.
Le motif de lancement prouvé est dans `scripts/verify-http.mjs:44-63` :
`spawn(process.execPath, [tsx, "server.ts"], { env: { ...process.env, PORT,
USER_DATA_PATH, NODE_ENV: "production", COOKDRIVE_INSTANCE_TOKEN } })`.

### Consigne

Créer `scripts/instance-pentest.sh` (+ `scripts/instance-pentest.py` si le bash
devient illisible) qui, dans cet ordre :

1. **Répertoire jetable** : `DONNEES=$(mktemp -d /tmp/clausio-pentest.XXXXXX)`,
   `chmod 700`.
2. **Port dédié** : `PORT=4310` (vérifier qu'il est libre **avant**, par bind de
   test ; ne jamais réutiliser un port de harnais existant : 3999 e2e, 371x/41xx
   des sondes).
3. **Bind LAN volontaire, pour cette instance seulement** : `HOST=0.0.0.0`.
   C'est la **seule** exception autorisée à la règle « loopback par défaut » :
   le conteneur Shannon doit joindre la cible (`host.docker.internal`, doc amont
   `docs/platforms.md`). Cette variable vit dans le script, **jamais** dans le
   produit, **jamais** dans `electron/`, **jamais** dans un test de CI.
4. **Auth ACTIVE** : ne **pas** poser `COOKDRIVE_AUTH_OFF`. Un pentest avec
   l'identité désactivée ne teste pas l'autorisation — c'est-à-dire la moitié de
   la valeur. **Rate-limit ACTIF** aussi : ne pas poser `COOKDRIVE_RATELIMIT_OFF`.
5. **Compte maitre jetable** : la base étant neuve, l'app est en « Premier
   démarrage » ; créer le compte par `POST /api/auth/setup` (mot de passe ≥ 8
   caractères, mesuré `EcranIdentite.tsx:82`) avec un mot de passe **généré** et
   **jamais committé**.
6. **Jeu de données minimal mais réaliste** : créer par l'API quelques
   fournisseurs, articles d'inventaire, une recette et un document — s'inspirer
   des créations déjà écrites dans `test/e2e/*.spec.ts` (elles passent toutes par
   HTTP, donc réutilisables telles quelles).
7. **Preuve d'isolation, exigée à chaque lancement** :
   ```
   AVANT=$(stat -c %Y "$HOME/.clausio/agent_culinaire.db" 2>/dev/null || echo absent)
   ... lancement + semis ...
   APRES=$(stat -c %Y "$HOME/.clausio/agent_culinaire.db" 2>/dev/null || echo absent)
   [ "$AVANT" = "$APRES" ] || { echo "ECHEC: la base reelle a bouge"; exit 1; }
   ```
   Plus : `test "$DONNEES" != "$HOME/.clausio"` et `ls -l "$DONNEES/agent_culinaire.db"`.
8. **Arrêt propre** : le script tue **son** enfant (jamais `pkill -f server.ts`,
   qui tuerait les serveurs de harnais et d'autres projets du poste).

### Porte nouvelle (règle 6 du dépôt)

Ajouter `verify:pentest-isolation` = `python3 scripts/probe-pentest-isolation.py`
qui prouve, **sans Docker et sans réseau** : (a) le répertoire de données est
distinct de `~/.clausio` ; (b) la base réelle n'est pas modifiée ; (c) le script
refuse de démarrer si `USER_DATA_PATH` est absent.
**Cette porte doit être inscrite dans `package.json` ET dans `DEFAUT` de
`scripts/run-all-gates.py`** — une porte que le lot n'appelle pas n'est pas une
porte.

### S1-bis (optionnel) — copie de la base réelle

Seulement si D2 le demande : `GET /api/admin/db-download` (`src/routes/admin.ts:24`)
sur une instance locale, fichier posé dans `$DONNEES` (700), **jamais** committé,
**jamais** copié ailleurs, effacé à la fin (`shred -u`). Le rapport ne doit
contenir **aucune** valeur réelle (règle de engagement ci-dessous).

## 5. S2 — le scan, et le rapport

### 5.1 Config (fichier `docs/pentest/shannon-clausio.yaml`, committé)

Les libellés ci-dessous sont **mesurés** dans l'UI : champ utilisateur
`placeholder="ex: clausake"` (`src/components/EcranIdentite.tsx:68`), champ mot de
passe (`:77-82`), bouton **« Se connecter »** (`:120`), et après connexion l'app
affiche **« Tableau de bord »** (`src/data/translations/fr.ts:112`, `dashboard`).

```yaml
description: >
  claus.io — application Electron + Express + SQLite (gestion de cuisine
  professionnelle). Instance de PENTEST LOCALE, base jetable, aucune donnee
  reelle, aucune exposition publique.

rules_of_engagement: |
  - Aucune force brute : maximum 5 tentatives par compte.
  - Le rate-limit du produit est ACTIF : un 429 est le comportement ATTENDU,
    pas un blocage a contourner. Respecter et consigner.
  - Aucune valeur reelle dans les livrables : placeholders [id], [nom].
  - Ne pas supprimer de donnees metier ; ne pas tester /api/admin/*.

authentication:
  login_type: form
  login_url: "http://host.docker.internal:4310/"
  credentials:
    username: "pentest-maitre"
    password: "<mot de passe genere par le script, jamais committe>"
  login_flow:
    - "Type $username in the field whose placeholder is 'ex: clausake'"
    - "Type $password in the password field"
    - "Click the button 'Se connecter'"
  success_condition:
    type: text_contains        # options du schema amont : url_contains |
    value: "Tableau de bord"   # element_present | url_equals_exactly | text_contains
                               # (l'app est une SPA : l'URL ne change PAS apres login)

rules:
  avoid:
    - description: "Ne pas toucher l'export de base ni les sauvegardes"
      type: url_path
      value: "/api/admin"
  focus:
    - description: "L'API metier et le controle d'acces"
      type: url_path
      value: "/api"

agentic_sast:
  enabled: "true"

report:
  sarif: "true"
```

**À re-vérifier au moment du chantier** : les quatre valeurs de
`success_condition` et les quatre de `login_type` proviennent du schéma amont
(`apps/worker/configs/config-schema.json`, relevé le 03/11). Si la version S0
diverge, **c'est le schéma de la version installée qui fait foi** — pas ce
document.

### 5.2 Consigne

1. **D'abord prouver le login, pas scanner** :
   `npx @keygraph/shannon start -u http://host.docker.internal:4310 -r "$PWD" -c docs/pentest/shannon-clausio.yaml --validate-auth`
   → doit rendre un login réussi, **sans** pentest ni rapport. Si ça échoue, le
   problème est la config d'authentification, pas l'application : corriger la
   config avant tout scan.
2. **Puis le scan complet** (même commande sans `--validate-auth`). Durée
   annoncée : 1 à 1,5 h. Ne pas interrompre ; les workspaces sont reprenables
   (doc amont `docs/workspaces.md`).
3. **Consigner** dans `docs/pentest-2026-11-XX.md`, avec pour chaque faille :
   la **preuve** (requête + réponse observées), la classe OWASP, la sévérité, et
   **le verdict de triage** : `VRAI` (exploit reproductible), `FAUX POSITIF`
   (prouvé par re-mesure), ou `HORS PERIMETRE`.
4. **Chaque faille retenue devient une entrée de chantier** avec sa correction et
   sa porte de non-régression — une faille sans porte revient toujours.
5. **Nettoyage** : `$DONNEES` supprimé, conteneurs et volumes Shannon arrêtés
   (`docker ps` doit le prouver), aucun secret dans le dépôt
   (`git status` propre, `docs/pentest/` ne contient que la config et le rapport).

## 6. S3 (optionnel) — CI : jamais bloquant

Une Action Shannon exige un dépôt **privé**, un runner avec Docker, et un secret
de modèle. Si le maitre le veut :

- `on: workflow_dispatch` **uniquement** (pas de `push`, pas de `pull_request`) ;
- **jamais** dans les checks requis : un scan coûte de l'argent et n'est pas
  déterministe ; le rendre bloquant rendrait la CI rançonnable ;
- artefacts : rapport + SARIF + logs ;
- **pas** de `-u` vers autre chose que l'instance jetable de S1.

Interdit explicite : `continue-on-error` sur un scan de sécurité (ce serait un
faux vert), et `fail-on-severity` dès la première mise en service (on veut
d'abord lire le bruit).

## 7. Interdits du chantier

- **Jamais** contre l'app installée du maitre, ni contre `~/.clausio/agent_culinaire.db`,
  ni contre une instance qui sert de vraies données de production.
- **Jamais** `COOKDRIVE_AUTH_OFF=1` ni `COOKDRIVE_RATELIMIT_OFF=1` sur l'instance
  de pentest (ça annule la moitié de la valeur du test).
- **Jamais** `HOST=0.0.0.0` ailleurs que dans `scripts/instance-pentest.sh` et sur
  le port dédié — le produit reste loopback par défaut (plan `014`, P4b).
- **Jamais** vendorer du code Shannon (AGPL) : ni copie, ni submodule, ni
  adaptation. Outil externe, exécuté.
- **Jamais** committer : clé d'API, mot de passe, base copiée, workspace Docker.
- **Jamais** `pkill -f server.ts` (tuerait les harnais et d'autres projets).
- **Jamais** de porte `verify:` hors de `DEFAUT` (règle 6).
- **Jamais** présenter un rapport de scan comme une preuve de sûreté : un scan
  sans faille ne prouve pas l'absence de faille.

## 8. Preuves de sortie

```
# S0
docker version --format '{{.Server.Version}}'     # demon ACTIF
npx @keygraph/shannon@latest --version            # version notee et figee

# S1
bash scripts/instance-pentest.sh                  # rc=0 + "base reelle intacte"
npm run verify:pentest-isolation                  # rc=0
python3 scripts/lire-gates.py | head              # la nouvelle porte est comptee
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4310/api/settings   # 401 attendu (auth ACTIVE)

# S1-bis (si retenu)
ls -l /tmp/clausio-pentest.*/agent_culinaire.db    # present, 700, hors depot

# S2
npx @keygraph/shannon ... --validate-auth          # login prouve
npx @keygraph/shannon ...                          # scan complet, rc consigne
ls -l <workspace>/Security-Assessment-Report.pdf <workspace>/report.sarif

# cloture
npx tsc --noEmit && npx vitest run && npm run build
npm run verify:all                                 # 0 rouge
npm run verify:split                               # rc=0 (si le journal a bouge)
```
Plus : **run CI vert 7/7** du commit de chaque étape.

## 9. Ce que ce chantier ne prouve pas (à dire, pas à taire)

- Un scan sans faille **ne prouve pas** l'absence de faille : couverture limitée
  aux cinq classes, au modèle choisi et au temps de scan.
- Les findings LLM demandent une relecture humaine : le README amont l'écrit
  noir sur blanc (« reports can contain weakly supported or incorrect details »).
- Le `.exe` Windows reste non fumé par la CI (limite P3 du plan `013`) : un
  pentest sur l'instance Linux ne dit rien des spécificités Windows.
- Shannon ne remplace pas les 98 portes : il cherche l'exploitable, elles
  gardent le contrat.
