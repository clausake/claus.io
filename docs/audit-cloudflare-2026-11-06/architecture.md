# claus.io — architecture auditée (run clausio-cf-quick-1, commit 7e66d4e)

## 1. Produit, auteurs, actifs protégés
Claus.io est l'app d'aide culinaire (cuisine pro/HACCP) pour un **établissement unique** :
Operators = `maitre` (gestion comptes, base, reglages), `staff` (ecriture metier), `agent`
(lecture seule §8, propose des suggestions), et **anonyme** (lecture HTTP libre — contrat A1).
Actifs protégés : la base `agent_culinaire.db` (hachages argon2 users, hachages des
56 sessions, audit_log 141 lignes, `iot_sensors.webhook_token`), `settings.json`
(llm_clef/ollama_url...), les uploads (factures/scans), les relevés de température HACCP
(jeton de webhook = la preuve d'authenticité de l'ingestion), la clés du coffre système.

## 2. Stack, frontières, déploiement
Node 22 + Express (server.ts), SQLite, React (vite), Electron (electron/main.cjs :
`nodeIntegration:false`, `contextIsolation:true`, **aucun** `ipcMain`, **aucun** preload —
electron/main.cjs:25-27). Maven : helmet (CSP stricte, hash inline), multer (25 Mo×5,
mémoire), express-rate-limit (BUDGETS par bucket : read 600/5 min, mutate 150, delete 40,
ai 60 ; clé = req.ip sans `trust proxy` ⇒ XFF ignoré) ; session cookie
`HttpOnly; SameSite=Strict` (auth.ts:136) ; session en base, token `randomBytes(32)`
haché sha256 (auth.ts:125). Sortie réseau sortante pilotée par settings :
`ollama_url` (util.ts:213, ollama.ts:40/65) et `llm_url` (llm.ts:131, sonde
`scripts/sonde-fournisseur.mjs` lancée par `spawn` SANS shell, timeout 20 s,
settings.ts:52-65). PORT bind par défaut `127.0.0.1`, `0.0.0.0` seulement si `HOST`
ou `lan_acces=true` (server.ts:42). 112 routes (46 GET, 66 mutables), gate de session
(`sessionGate`) : GET/HEAD/OPTIONS **exemptés** (lecture libre), mutations exigent une
session, agent refusé sauf `ECRITURES_AGENT.has(req.path)` match **EXACT**
(auth.ts:97-107). `COOKDRIVE_AUTH_OFF=1` : harnais (renvoie un user maitre fictif à
`/api/auth/me`, auth.ts:106 ; désactive la gate). Deux modes: 63 routes mutables ont un
motif identité suivi.

## 3. Surfaces → sinks (périmètre scoped)
- **HTTP**(112) : `res.download` admin/backup ; multer memory→OCR→document_items ;
  spawn de sonde LLM ; CONSOMMATEUR ollama.list() (ollama status) ; fetch interne
  suggestions appliquer (127.0.0.1:port + route allowlistée, suggestions.ts:169).
- **Fichiers** : `storageDir` fixe (env USER_DATA_PATH) ; archive.zip backup
  (backup.ts:15-31) ATTENTION : `res.download` dans la RÉPONSE d'un POST.
- **Blob LLM** (`/api/ai/chat`, `/api/voice`) : texte seul, écriture DB **aucune** (ai.ts:108+),
  POST → session requise.
- **Electron** : pas de bridge.

## 4. Frontières et plus fort contrôle source-visible
1. anonyme → mutations : `sessionGate` (401 AUTH_REQUISE) ✓
2. agent → mutations : refus + exemption exacte ✓ (mais le corps des routes传言 re-juge)
3. staff → *re* jugement interne : **pas de rere jugement par défaut** — staff peut
   POST /api/backup, cabinet faille (candidate).
4. anonyme → serveur outgoing : probes GET sur cibles staff-configurables (candidate NV).
5. serveur → fichiers : chemins fixes, pas de valeur Utilisateur dans path.join.

## 5. Chemins de départ
src/middleware/{auth,api-rate-limiter,validate,error-logger,http-logger}.ts,
src/routes/*.ts, electron/main.cjs.
## 6. Hors scope déclaré (units out_of_scope consignées pour un run full)
server.ts (helmet/CSP/order), src/services/** (audit.ts, settings.ts sous-jacent),
scripts/** , package.json/CI — écrits comme unités `out_of_scope` dans le ledger.

## 7. Choix des companions (liés à une frontière VU)
- WEB-PROTOCOL-AND-AUTH → les 112 routes HTTP + gate session.
- DATA-ISOLATION-AND-LIFECYCLE → base zip/secrets/cycle de vie données.
- DESKTOP-MOBILE-AND-LOCAL-IPC → Electron
- exclusions : MEMORY-SAFETY (pas de C/C++), PROTOCOLS-RPC (pas de léger
  daemon interne), AI-AND-LLM (léger : pas d'extraction tool-exec à cette surface ; keep
  as exclusion nommée), CLOUD-AND-DEPLOYMENT (déploiement hors source).
