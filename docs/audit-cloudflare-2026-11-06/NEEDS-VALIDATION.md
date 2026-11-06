# Besoins de validation — run clausio-cf-quick-1

Deux candidats restent en `needs_validation` : leur structure est **un fait de source**,
mais le fait DECISIF (reachability / quota disque) est un **fait de déploiement** que la
source ne tranche pas (ligne de conduite du skill : sandbox `NONE en règles d'exécution`,
aucun code cible exécuté dans ce run).

## 1. `cd-ssrf-probe-anon-trigger-staff-target` — sondes sortantes par GET anonyme

**Ce qui est déjà prouvé par la source** (fichier:lignes dans findings.json) :
- `GET /api/llm/tester` (src/routes/settings.ts:39) déclenche le spawn de la sonde
  (sans shell, timeout 20 s) vers une cible construite depuis `llm_url` des settings ;
- pour `llm_choix=ollama|llamacpp` la base est LIBRE (src/shared/fournisseur/reglage-llm.ts:91-103) ;
- `GET /api/ollama/status` (settings.ts:207) appelle `ollama.list()` vers `ollama_url`
  (src/shared/util.ts:213) ;
- la gate exempte les GET/HEAD/OPTIONS (src/middleware/auth.ts:85) → déclencheur ANONYME ;
- `POST /api/settings` est accessible à une session **staff** (gate mutations auth.ts:91).

**Ce qui manque (blocage nommé)** : la liste des hostnames joignables depuis l'espace
réseau du serveur en production (metadata cloud 169.254.169.254, DNS interne, sockets
docker, proxy) — un fait de déploiement.

**Plan de validation local** (instance jetable, émission nommée) :
1. `settings.json` : `llm_choix=ollama`, `llm_url=http://169.254.169.254:80` ;
2. `GET /api/llm/tester` → noter `vivant` et `duree_ms` ;
3. re-jouer avec `llm_url=http://127.0.0.1:1` (ECONNREFUSED instantané) ;
4. le DELTA `duree_ms` entre refusé-instantané et timeout constitue un canal de timing
   exploitable même à réponse masquée.

**Plan de validation déploiement** : cataloguer les cibles internes joignables depuis le
serveur de production ; activer la journalisation d'audit sur ces deux GET (IP source,
cible, durée).

**Verdict nominal attendu** : si une cible interne (metadata ou docker bridge) répond
différemment d'un port fermé, le candidat passe à `confirmed` (gravité medium). Si aucune
cible interne n'est joignable et que la cible est bornée au LAN voulu du LLM, rester
`rejected` avec ce constat mesuré.

## 2. `cd-upload-disk-exhaustion` — budget d'écriture cumulé non borné

**Ce qui est déjà prouvé par la source** : 25 Mo × 5 fichiers par requête
(src/shared/upload.ts:6-8), JSON 10 Mo (server.ts:128), rate limiter mutate 150/5 min
par IP (src/middleware/api-rate-limiter.ts:35) → ~187 Mo/5 min/IP **par construction** ;
aucun budget cumulé ni purge en source.

**Ce qui manque (blocage nommé)** : quota disque réel, taille max de la base SQLite en
production, politique de purge/rétention — faits de déploiement.

**Plan de validation local** : sur l'instance jetable, mesurer la croissance du fichier
base pour 100 uploads bornés (25 Mo) et le taux mémoire (memoryStorage) ; brancher un
quotum source (somme des tailles) si le disque de production est ≤ 2 × la base nominale.

**Plan de validation déploiement** : mesurer l'espace disque et la décroissance de
purge en production ; fixer le budget cumulé de source en conséquence.

## Rappel sur le 3ᵉ blocage structurel du run

Toute reproduction dynamique (exécution du code cible) est restée interdite dans ce run :
`sandbox_capability = NONE`. Les plans ci-dessus sont conçus pour **le propriétaire sur
son instance jetable** (même recette que les mesures dynamiques du matin, §8 de
docs/pentest-2026-11-03.md).
