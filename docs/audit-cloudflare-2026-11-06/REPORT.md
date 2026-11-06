# Rapport d'audit statique — claus.io (run `clausio-cf-quick-1`)

- **Cible** : claus.io @ `7e66d4e45cd4e30379cf376e99c18e05c2dc7e1e` (arborescence propre, 0 fichier modifié)
- **Profil** : `quick`, périmètre `src/middleware`, `src/routes`, `electron`
- **Mode** : source-only (sandbox `NONE appliqué`) — aucune exécution du code cible
- **Méthode** : registre de couverture déterministe (13 unités validées par le validateur
  du skill) + vague de chasse unique + critique final + re-vérification adversariale par
  candidat (tentative de DISPROUVE)
- **Deviation déclarée** : sessions-enfants indisponibles (4 × « Free usage limit
  reached ») → exécution **parent-solo** sur tout le run ; budget 16 interprété en unités
  de couverture (13), 0 sous-agent. Chaque citation du rapport est adossée à une commande
  exécutée pendant le run.

## Résumé

| # | fingerprint | titre (court) | gravité | verdict |
|---|---|---|---|---|
| 1 | `cd-iot-webhook-token-disclosure` | le token d'ingestion HACCP sort par un GET anonyme | high | confirmed |
| 2 | `cd-backup-zip-staff-access` | POST /api/backup emporte la base pour une session staff | medium | confirmed |
| 3 | `cd-error-message-internal-leak` | les 500 rendent String(e) (fragment interne) | low | confirmed |
| 4 | `cd-ssrf-probe-anon-trigger-staff-target` | sondes sortantes GET anonyme × cible staff | medium | needs_validation |
| 5 | `cd-upload-disk-exhaustion` | ~187 Mo/5 min/IP sans budget cumulé | medium | needs_validation |
| 6 | `cd-hermes-contexte-anon-readable` | GET /hermes/contexte lisible anonyme | — | rejected (risque accepté) |

## Couverture

13 unités validées (validate-coverage-ledger PASS) : **5 candidates** (3 confirmées,
2 needs_validation), **5 covered** (db-download post-F1 ; exemption agent EXACT ;
filtre secrets settings ; surface LLM sans écriture ; Electron sans bridge IPC),
**3 out_of_scope** (server.ts/helmet ; src/services audit+coffre ; supply chain —
réservés à un run full).

## Points clés

1. **Le plus gros risque du run** est C-2 (token HACCP) : la menace est nommée dans le
   code lui-même (sprint h1 : « pièce d'audit fausse ») et le remède est une ligne.
2. Le plus rapide à fermer est C-1 (backup) : copier la garde maître de admin.ts:24 et
   éliminer la route morte — cohérence avec le correctif F1 du matin.
3. Les deux `needs_validation` ont des plans de reproduction exacts (NEEDS-VALIDATION.md)
   avec le canal de timing pour la sonde LLM.
4. Le rejet de hermes-contexte est un jugement de CONTRAT (lecture libre), pas une
   absence de risque : c'est un axe de décision produit.

## Artifacts

- `run-metadata.json` (statut complete + deviation + budget)
- `architecture.md`, `coverage-ledger.json` (PASS), `findings.json` (PASS, 6 candidats)
- `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`
- Validateurs du skill exécutés : `validate-coverage-ledger.cjs` (PASS 13), `validate-findings.cjs` (PASS 6)
