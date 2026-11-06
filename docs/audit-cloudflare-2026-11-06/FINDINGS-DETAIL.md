# Détail des candidats — run clausio-cf-quick-1 (commit 7e66d4e)

Le run est **source-only** (sandbox NONE) : chaque citation (fichier:ligne) a été posée
par une commande (grep/sed/lecture) exécutée pendant le run. Reproduction dynamique =
plans du document NEEDS-VALIDATION.md (réservés au propriétaire, instance jetable).

## Confirmés (3)

### C-1 `cd-backup-zip-staff-access` — medium
`POST /api/backup` (src/routes/backup.ts:15-31) archive TOUT le dossier de données
(archive.directory(storageDir) :21 → `agent_culinaire.db` + `settings.json`) puis rend le
zip dans la RÉPONSE du POST (res.download :22). La gate de mutation (src/middleware/auth.ts:91)
bloque anonymes et agent mais PAS staff : une session staff emporte la base complète
(hachages argon2 des users, hachages des sessions actives, audit_log, tokens de capteurs).
**Incohérence directe** : le correctif F1 du matin a mis GET /api/admin/db-download sous
garde maître (src/routes/admin.ts:24) pour la MÊME pièce de données ; backup.ts n'a aucune
garde. En plus, une route POST /api/backup DUALE (santé seule) existe dans admin.ts:48-57
mais est Morte : backupRouter est monté AVANT adminRouter (server.ts:216/228).
**Remède** : même garde que admin (rôle maître + logAudit) sur backup.ts ; retirer ou
renommer la route morte d'admin.ts.

### C-2 `cd-iot-webhook-token-disclosure` — high
`GET /api/haccp/iot-sensors` (src/routes/haccp.ts:226) est exempté de session (lecture
libre A1, auth.ts:85) et recopie `webhook_token: s.webhook_token` (:240) dans `res.json`
(:241). Le MÊME token est le SEUL secret qui authentifie l'ingestion des relevés
(POST /api/haccp/webhook/iot-report, :334 : `sensor.webhook_token !== token.trim()` → 403).
Le commentaire de sprint (h1, :236-238) nomme la menace exacte — « une relevée … est une
pièce d'audit fausse » — mais la vue GET fournit le secret à tout lecteur anonyme :
falsification du registre HACCP (integrité), depuis la boucle locale ou le LAN si
`lan_acces=true`.
**Remède** : retirer `webhook_token` du mapping du GET ; le POST de création (qui répond
`{status, token}` :276-277) reste la seule remise du secret.

### C-3 `cd-error-message-internal-leak` — low
7 sites de catch rendent `message:String(e)` dans des corps 500 atteignables par un
appelant anonyme (auth.ts:59/85/123 setup/login/état, suggestions.ts:111/124/134,
hermes.ts:105 sur GET). `String(e)` sur une Error vaut `Type: message` (ex.
`SQLITE_CONSTRAINT: UNIQUE constraint failed: ...`) : fragments de schéma/contraintes
internes exposés. error-logger.ts console-only : le détail doit rester là.
**Remède** : corps 500 = NOM d'erreur produit + message stable ; détail au logger serveur.

## needs_validation (2) — voir NEEDS-VALIDATION.md
- `cd-ssrf-probe-anon-trigger-staff-target` (medium) : sonde réseau sortante déclenchable
  par GET anonyme sur cible staff-configurable (ollama_url/llm_url libre) ;
- `cd-upload-disk-exhaustion` (medium) : budgétisation par requête sans budget cumulé
  (~187 Mo/5 min/IP par construction).

## Rejeté (1)
- `cd-hermes-contexte-anon-readable` : GET /api/hermes/contexte expose le résumé métier
  (stock/DLC/températures/suggestions) anonymement (src/routes/hermes.ts:101-106 →
  src/services/hermes.ts:48+). **Rejeté** : la lecture libre des GET est le contrat
  explicite du produit (auth.ts). Consigné dans les risques acceptés — décision produit
  possible (fermer ce GET derrière une session) mais pas une violation de frontière au
  contrat courant.

## Risques acceptés consignés (hors candidats)
- `COOKDRIVE_AUTH_OFF=1` fournit un user maître fictif (`/api/auth/me`) : contrat harnais
  documenté, jamais posé en production (porte verify:auth juge SANS ces envs) ;
- les 46 GET portent les données métier de l'établissement : contrat A1 lecture libre
  (le chef accepte cette exposition locale/LAN).
