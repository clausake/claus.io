# Regles communes aux deux cerveaux (pilote qui ecrit, relanceur qui juge)

Ce fichier est charge par le PILOTE a sa naissance **et** par chaque enfant `/review`
(`build_context_files_prompt(cwd=workspace, skip_soul=True)`,
`tools/delegate_tool_progress.py:174`). C'est le seul texte que les deux cerveaux
partagent vraiment ici : SOUL.md est reserve au parent (`skip_soul=True` sur les
enfants, commentaire du code : « identity belongs to the parent »), et un skill n'est
lu que par celui qui le charge. Donc une regle ici s'impose aux deux ; une regle
placee ailleurs n'en astreint qu'un.

## 1. Toute citation se paie par la commande qui la produit

Un chiffre, un numero de ligne, un `rc`, un compte de portes, un « la porte X est
appelee par Y » n'a pas le droit d'etre enonce si la commande qui le genere n'a pas
tourne **dans ce tour**. Un « c'est a `run-all-gates.py:233` » rendu sans le grep qui
vient de le produire est une fabrication, meme quand il tombe juste.

Fautes reellement commises le 17/09, par les DEUX cerveaux : numeros de ligne inventes
sans grep ; une porte annoncee « jamais appelee » par un grep qui visait les mauvais
fichiers (elle etait absente, le constat etait vrai) ; et l'inverse — un defaut reel
classe « faux positif » sans le mesurer. Un seul cerveau ne prend aucun de ces
erreurs en flagrant : c'est la raison d'etre du second, pas la redondance.

## 2. Une sortie vide n'est pas une reponse

`test/gates.out` contient des **octets nuls** : `grep` y rend **0 octet sur stdout avec
exit 0** (`fichiers binaires correspondent`). Le lecteur qui ne regarde pas le code de
sortie en conclut « il n'y a rien la ». Mesure du 17/09 : un pilote a brule **12**
appels identiques sur cette grepe avant la coupure du garde-fou, et l'autre a rendu
« AUCUN verdict » sur le meme fichier pour la meme raison.

- ne **jamais** grepper `test/gates.out` directement → `python3 scripts/lire-gates.py`
  (concu pour ne pas pouvoir rendre du vide en silence : il nomme l'absence et donne
  les commandes qui, elles, rendent quelque chose) ;
- avant toute conclusion d'absence, une sonde prouve le capteur vivant : `wc -c`,
  `grep -c` sur un motif qu'on sait matcher, ou `grep -a`.

## 7. Une sortie stable est un fait acquis: la repollee ne produit rien

- `npm run verify:sse` qui a rendu `RC=0` cinq fois de suite rend `RC=0` pour
  toujours: le sixieme appel n'apprend rien. Mesure le 18/09, un pilote a brule
  5 appels sur ce verbe (sortie identique `RC=0`) et 7 sur
  `_tests/run_all.py offline` (sortie identique) avant la coupure du garde.
  Un halt sur un verbe de POLL (`grep`, `wc -c`, `git diff`, `echo RC`) est un
  blocage de GESTE, pas du systeme: le fait est acquis, passe a l'ecriture.
- `git diff HEAD -- scripts/…` rendu VIDE pendant que ton patch n'est pas encore
  ecrit ne veut pas dire « en attente », ca veut dire « tu n'as rien ecrit ».
  Le regarder quinze fois ne remplit pas le fichier.
- Deux courses SIMULTANEES ne se demandent pas avec `&` dans une commande
  terminal: le harnais refuse (`Foreground command uses '&' backgrounding`,
  exit -1) et tu te retrouves a polluer l'autre en sequence. Ecris un `.py` avec
  `subprocess.Popen([...])` par enfant puis `communicate()`: c'est exactement
  comme ca que les deux courses jumelles `gates-…-670137` / `670138` ont existe.

## 3. Une relire par commit, pas par tour

Le pilote appelle `/review` quand un livrable est committe. Jamais entre deux tours
d'outils : la revue par tour double le cout sans rien de plus a dire.

## 4. Le relanceur rejoue, le pilote re-mesure

- Le relanceur **execute** la commande derriere chaque citation du rapport qu'il recoit
  et derriere chaque conseil qu'il rend, avant tout verdict. Chaque constat sort
  `VRAI (mesure)` ou `FAUX POSITIF (mesure)`. Un constat non rejoue n'est pas rendu au
  pilote : il est garde pour soi.
- Le pilote ne corrige pas un constat avant de l'avoir re-mesure lui-meme par commande
  executee. Un `FAUX POSITIF` mesure se consigne et se renomme ; il ne reste pas dans
  une liste a re-traiter.

## 5. Un halt `identical_call_streak_halt` se lit par la COMMANDE, pas par l'evenement

Sortir l'appel rejoue et demander a qui il appartient : le harnais (`decouper-phases`,
`PHASES.md`, gates) ou le domaine (`git diff`, `read_file`). Les trois halts du 17/09
etaient tous du domaine — reparer le harnais ce soir-la etait un faux combat. Et un
halt `terminal` en sortie vide est un angle mort du capteur (regle 2), pas de
l'entetement : la reparation est dans le capteur, pas dans le cerveau.

## 6. Les portes

```bash
npm run verify:all                      # le lot complet (liste DEFAUT de run-all-gates.py)
npm run verify:split                    # le journal se recolle a l'original consigne (sha256)
python3 scripts/lire-gates.py           # qui sont les rouges, sans grep sur un binaire
python3 scripts/lire-gates.py --rouges  # seulement ce qui coince
```

Une porte que personne n'appelle n'est pas une porte : une nouvelle entre `verify:`
doit etre **a la fois** dans `package.json` **et** dans `DEFAUT` de
`scripts/run-all-gates.py` (sinon `PORTES_INCONNUES rc=2`).

Le hash consigne du journal bouge uniquement dans le commit qui re-ancre la porte :
`--verify` execute **avant** de commiter, jamais l'inverse (une ancre bougee sans sa
porte = porte rouge pour toujours, ou mensonge fige). Le `.orig` est juge contre le
**blob git commite**, pas contre un hash ecrit dans le meme dossier que lui.

## 7. Memo audit 2026-10-02 (OpenHands)

- Chemins en dur INTERDITS dans scripts/ : deriver de `os.path.dirname(os.path.abspath(__file__))` ou lire `COOKDRIVE_*`. Restent a corriger : `brancher-journal-sprint9.py:17`, `carte-ports-document-items.py:27`, `falsifier-garde-fixture.py:38`, `figer-reference-prevision.py:47`, `negative-test-forecast-graine.py:39` ; et `test/banc/sonde-11..17` (`/home/clausake/.hermes/...` → `test/banc/`).
- `verify:forecast` / `verify:labor-cost-zero` ont besoin d'une base client (`var/agent_culinaire.db`) absente des machines d'audit — « sonde sans terrain » est un RC=0 degrade propre.
- Les gates `-mord` testent la degradation gracieuse : ECONNREFUSED / ollama-absent dans les logs est NORMAL (contrat « jamais 500 nu »), verify:routes 46/46 sans Ollama.
- Poids OCR absents de git (registre GitLab `ocr-modeles/v2`) : remplir `resources/ocr/modeles/` avant tout test OCR ; juge = `scripts/verif-modeles-ocr.py`.
- Defaut OCR produit constate : pleine page perd la row « Total HT 419,60 » ; en bandes de ~20 px + pad 13 elle est rendue (sonde-18, 7/7 attendus). Remede : pre-decoupage en bandes cote `src/shared/ocr.ts`. Details : `docs/audit-2026-10-02.md`.
- **multer EST utilise** (src/shared/upload.ts, recipes:396, documents:478) — ne PAS le retirer (l'audit initial s'etait trompe ; corrige le 03/10). Le 03/10 : @xenova/transformers RETIRE (aucun import, tirait protobufjs critique), tar ^7.5.22 + node-gyp ^11.3.0 par overrides, multer ^2.4.0. Restantes : 15 high dev-only (electron-builder, sqlite3, pdf-to-img, xlsx sans fix) — zero critical, zero runtime produit.

## 8. Vision produit et feuille de route (03/10 — LA reference avant tout travail)

**Le produit a DEUX modes prevus des l'origine** (§8 de docs/audit-2026-10-02.md) :
1. **Avec agent Hermes** : cerveau local (Ollama) ou cloud (Gemini, optionnel). Hermes LIT tout, SURVEILLE (anomalies stock, DLC, temperatures), ANALYSE (OCR), CONSEILLE (menus, anti-gaspillage) et **INFORME**.
2. **Sans agent** : saisie et gestion manuelles completes.

**Regle d'or (durcie, non negociable) : L'AGENT N'ECRIT JAMAIS. L'humain clique et execute.** Toute ecriture des 57 routes mutables porte la signature d'un humain. Le compte agent est refuse (403 AGENT_LECTURE_SEULE) sur TOUTE route mutable — sa seule ecriture future sera sa table `suggestions` (chantier 3).

**Decision tranchee : une installation = un etablissement** (pas de multi-site dans le schema users).

### Etat des chantiers (feuille de route completee, ordre : 1 -> 2 -> 3 -> 6 -> 4 -> 5)

- **Chantier 1 — Auth & identite** : **FAIT (backend + UI), 04/10** — BACKEND : tables users/sessions (argon2), setup/login/logout/me, gestion comptes maitre-only, gate session (401 AUTH_REQUISE / 403 AGENT_LECTURE_SEULE), porte `verify:auth` (14 regles A/B/C, 14/14 x3), commits 9313f23 + 09d836f + f1a4f7d + c000e92 + e6c4482. **UI React** : `AuthGate.tsx` (garde de session : 401 -> /api/auth/etat pour distinguer setup vs login), `EcranIdentite.tsx` (setup/login, lazy chunk dedie), `AccountsView.tsx` (page comptes du maitre, CRUD via `lib/cdFetch.ts`), App.tsx:390 enveloppe TOUT l'app dans AuthGate. Contrat harnais : `/api/auth/me` rend un user harnais (role maitre) sous `COOKDRIVE_AUTH_OFF=1` uniquement (f1a4f7d) ; les 15 specs e2e metier bootent avec l'env posee, verify:auth la juge ABSENTE. Verifie le 04/10 : tsc 0, vitest 158/158, build 492.7 ko < 620, verify:auth 14/14, verify:routes 46/46, verify:reception vert (fix : chromium playwright absent du conteneur, `npx playwright install chromium` — cause reelle de l'echec precedent, PAS un regress d'auth).
- **Chantier 2 — Audit trail** (SUIVANT) : table `audit_log` (actor_id, actor_kind humain/agent, route, action, entite) + helper `logAudit()` central sur les 57 routes mutables. HACCP obligatoirement trace. Effort 1-2 j.
- **Chantier 3 — Boite de reception de suggestions** (a faire) : table `suggestions` {type, priorite, titre, explication, action pre-remplie (route+payload), statut nouveau/applique/rejete}. SEULE ecriture de l'agent. L'humain applique (formulaire pre-rempli a SA signature) ou rejette avec motif. Effort 2-3 j.
- **Chantier 6 — Portes des deux modes** (a faire) : `verify:mode-manuel` (CRUD complet agent coupe) + `verify:mode-agent` (suggestion de bout en bout avec cerveau factice deterministe — JAMAIS de LLM reel en CI). Effort 1 j.
- **Chantier 4 — Moteur de surveillance** (a faire) : regles -> suggestions : rupture imminente, stock mort, ecart inventaire, DLC proche, temperatures hors bornes HACCP, menus/anti-gaspillage (brancher epicure + antiwaste existants). Seuils configurables par le maitre. Effort ~1 sem.
- **Chantier 5 — Hermes cerveau outille** (a faire) : contexte = schema + resume dashboard, interroge par API, produit des suggestions. Ollama local par defaut, Gemini optionnel. ai.ts voice/chat = portes d'entree. Effort 1-2 sem.
- Fond de liste (non bloquant) : FichesTechniques.tsx 2425 lignes, App.tsx 985, 186 :any, bundle 618 kB.

### Envs de harnais (institution, a reutiliser)
- `COOKDRIVE_AUTH_OFF=1` : desactive la gate session (routes.spec.ts juge le metier anonyme).
- `COOKDRIVE_RATELIMIT_OFF=1` : desactive le rate-limit (verify:auth sature sinon le bucket auth 20/15min).
- La porte `verify:auth` juge SANS ces envs (gate active). Ne jamais les poser en production.

### Pieges verify:auth (03/10, 3 runs 14/14 apres fix)
- **Fantome** : un fils tsx survive a un run interrompu et tient le port 4171 avec une VIEILLE base (409 SETUP_DEJA_FAIT). fuser/lsof ABSENTS du conteneur et la cmdline du fils est « node --require .../tsx/dist/preflight.cjs ... server.ts » (ni pkill -f « tsx server.ts » ni fuser ne l'attrapent) → la sonde parse /proc/*/cmdline et tue les process server.ts de ce depot.
- 429 « Trop de requetes (auth) » = bucket auth sature par les runs repetes → env COOKDRIVE_RATELIMIT_OFF ci-dessus.

### Limites de l'agent (signalees par le client, 04/10)
- Timeout LLM GLM : ~146k tokens de contexte utile — eviter les gros dumps (journal gates, logs e2e) : passer par scripts/lire-gates.py, greps cibles.
- Limite ~100 iterations/conversation : viser les livrables par petits commits ; l'etat complet vit ICI (AGENTS.md) pour que la conversation suivante reparte.

### Verifier avant de se dire « fini » (le contrat de sortie d'un chantier)
```
npx tsc --noEmit                        # types
npx vitest run                          # 158 tests
npm run build                           # bundle
npm run verify:auth                     # 14/14 contrat identite (3x consecutifs)
npm run verify:routes                   # 46/46 metier (COOKDRIVE_AUTH_OFF pose par le spec)
python3 scripts/lire-gates.py           # qui est rouge (jamais grepper test/gates.out)
```

### CI (04/10 — pipeline VERTE 2910855321, sha 940b8d4)
- Le stage security passe par les TEMPLATES officiels (Jobs/SAST, Jobs/Dependency-Scanning, Jobs/Secret-Detection) : un job avec artifacts.reports mais SANS script est invalide pour GitLab (pipeline failed 0 jobs — lecon 2910697922).
- `ONNXRUNTIME_NODE_INSTALL=skip` en variable globale : le postinstall de onnxruntime-node telecharge les providers CUDA/TensorRT depuis un CDN Microsoft BLOQUE depuis le runner (ETIMEDOUT) ; les binaires CPU linux/x64 sont deja bundles (install-metadata.js : linux/x64 = [cuda12] seulement).
- Barriere npm-audit au seuil CRITICAL (un rouge high permanent n'est plus un signal) + job npm-audit-report (allow_failure, artefact JSON 1 mois). 3 high dev-only acceptees : pdf-to-img/pdfjs-dist (fix = montee majeure 7), xlsx (pas de fix).
- TOUTES les sondes metier (18 .mjs + 5 .py) et les 15 specs e2e bootent le serveur avec COOKDRIVE_AUTH_OFF=1 ; verify:auth seul la juge active.
- test reception-view : ouvrirAchats attend le bouton 30 s et re-essaie tant que le PREMIER bouton est « Acceder » (hydratation lente en CI, 2 lecons 2910822108/2910844482 — ne PAS detecter la landing par le body : « Restauration IO » est aussi dans l'app).
