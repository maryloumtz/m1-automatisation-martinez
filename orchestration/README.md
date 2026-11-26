# Relance n8n et recette — séance 3 TP1 à TP4

Commandes à exécuter depuis la racine du dépôt, Docker Desktop ouvert.

## Relancer

1. Vérifier `orchestration/.env` à partir de `.env.example` : URL Supabase,
   clé serveur, URL de notification Discord. Le `.env` est ignoré par Git.
2. Lancer n8n :

   ```bash
   docker compose -f orchestration/docker-compose.yml up -d
   ```

3. Laisser tourner le proxy dans un terminal dédié :

   ```bash
   node orchestration/webhook-proxy.mjs
   ```

4. Laisser tourner le tunnel dans un autre terminal :

   ```bash
   cloudflared tunnel --url http://127.0.0.1:5680
   ```

5. Reporter l’URL HTTPS obtenue dans `N8N_WEBHOOK_URL` du `.env`, puis refaire
   `docker compose -f orchestration/docker-compose.yml up -d`.
6. Dans Supabase, modifier `on_ticket_mutation` sur `public.tickets` : méthode
   POST, URL `https://<nouveau-tunnel>/webhook/tickets-webhook`, événement
   **INSERT uniquement**, afin que les PATCH ne redéclenchent pas le flux.
7. Ouvrir `http://localhost:5678` et vérifier que **[CORE] Ingestion & Routage
   Tickets**, **[SUB] Audit & Notification** et **[OPS] Global Error Handler**
   sont publiés. Ne pas épingler de données pendant la recette réelle.

Les données n8n sont conservées dans `n8n_data`. Ne pas lancer
`docker compose down -v`, qui supprimerait ce volume.

## Adaptation du support

Le tunnel expose le proxy sur 5680 : seul le POST de production
`/webhook/tickets-webhook` est transmis à n8n sur 5678. Le tunnel ne publie pas
l’administration ; un GET à sa racine retourne volontairement
404. Le proxy n’expose pas `/webhook-test/...` : utiliser la production pour le
smoke test. Le port Docker 5678 reste publié sur les interfaces de la machine,
comme dans le Compose du cours ; ce n'est pas une restriction à localhost.

Version vérifiée : n8n 2.42.7. `N8N_WEBHOOK_URL` est le nom actuel de la variable
présentée comme `WEBHOOK_URL` dans le support. L’image Compose reste celle du
cours (`latest`). Depuis le TP3, les requêtes Supabase de n8n utilisent le
credential chiffré **Supabase service_role - TP**. Les URL restent en variables
serveur `$env`, donc `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` reste nécessaire.
La clé du `.env` reste disponible pour les tests API lancés en terminal.

## Recette Bruno

Collection `bruno/tp4-cahier-recette-api`, environnement Supabase :

- **03 → 05 → 06** : ticket critique, notification Discord, statut `en_cours`.
- **03 → 04 → 06** : ticket standard, statut `en_cours`, sans notification.
- **07 et 08** : HTTP 200 et `[]` avec la clé publique.
- **09**, après 04 ou 05 : une ligne d'audit `success` avec la clé déterministe.
- **10** : incident de la recette TP4 ; adapter la variable locale `executionId` à l'exécution CORE en échec.

Attendre environ deux secondes entre l’insertion et 06. Dans n8n, vérifier
qu’une insertion ne produit qu’une exécution, même après le PATCH.

## Migration et tests

La CLI doit être authentifiée et le dépôt lié au projet Supabase.

```bash
supabase migration list --linked
supabase db push --linked --dry-run --skip-vault
supabase db push --linked --skip-vault
supabase db query --linked --file supabase/tests/database/03_observabilite.sql
```

La migration `20261126081311_03_observabilite_et_erreurs.sql` ajoute :

- `workflow_logs` : clé d’idempotence unique, référence nullable au ticket,
  statuts `processing`, `success`, `ignored`, détails JSONB.
- `error_logs` : contexte d’exécution, message, snapshot JSONB, résolution.
- RLS sans politique publique ; accès aux lignes réservé à `service_role`.
  Les rôles publics ont seulement SELECT, intégralement filtré par RLS,
  permettant la recette HTTP 200 + `[]` du cours.

Le test SQL vérifie les contraintes, les valeurs par défaut, le masquage pour
`anon` / `authenticated` avec des fixtures présentes, et l’accès serveur.
Il annule toutes ses écritures avec `ROLLBACK`.

## TP2 — Résilience locale

- `Mise a jour en cours` : Retry On Fail activé, **3 tentatives au total**, délai
  fixe de **2 000 ms** entre les tentatives, On Error = **Stop Workflow**.
- `Notification externe` (dans SUB depuis le TP3) : Retry On Fail désactivé, On Error = **Continue
  (using error output)**. La sortie Error rejoint le No Operation
  `Notification indisponible (non bloquante)`.
- Au TP2, notification et PATCH étaient en parallèle. Depuis le TP3, le PATCH
  précède l'appel de SUB. La sortie Error de Discord reste non bloquante et ne
  revient jamais au PATCH.

Pour refaire la recette du TP2 dans n8n :

1. Dans **[SUB] Audit & Notification**, remplacer temporairement l'URL du nœud `Notification externe` par
   `https://discord.com/api/webhooks/0/tp2-webhook-invalide`, puis **Publish**.
2. Dans Bruno, exécuter **03 → 05 → 06**. Attendus : ticket `en_cours`, exécution
   n8n réussie, branche d'erreur Discord parcourue jusqu'au No Operation.
3. Rétablir l'expression `{{ $env.NOTIFICATION_WEBHOOK_URL }}` dans le champ URL
   de n8n, puis **Publish**. Dans l'export JSON, cette expression commence par `=`.
4. Refaire la recette : notification reçue, sortie normale parcourue, PATCH réussi.

La configuration finale exportée contient uniquement l'expression valide ;
l'URL invalide n'est jamais enregistrée dans le `.env`.

Le Retry On Fail natif utilise un délai fixe : ce n'est pas un backoff
exponentiel avec jitter ni un filtre des seuls codes 429/5xx. Les erreurs
permanentes et de contrat doivent être distinguées des pannes transitoires
avant d'élargir cette stratégie à une utilisation de production.

## TP3 — Sous-workflow d'audit et notification

`[CORE]` calcule `table:UUID:operation:statut_initial`, exécute le PATCH avec les
réglages TP2, puis appelle **[SUB] Audit & Notification** de manière synchrone.
Les deux branches passent par ce même appel avec `statut=success`. CORE transmet
un `alert_message` non vide lorsque `alerte_immediate` vaut `true` : priorité
critique ou titre contenant « panne », « bloquant » ou « urgent ».

Entrées typées de SUB :

| Champ | Type | Utilisation |
|---|---|---|
| idempotency_key | String | Clé déterministe unique dans workflow_logs |
| workflow_name | String | Nom du workflow appelant |
| ticket_id | String | UUID ou chaîne vide, convertie en NULL |
| statut | String | processing, success ou ignored |
| details | Object | Détails métier stockés en JSONB |
| alert_message | String | Vide : ne pas notifier ; sinon texte Discord |

SUB envoie un POST sur `workflow_logs?on_conflict=idempotency_key` avec
`Prefer: resolution=merge-duplicates,return=representation`, vérifie la réponse,
puis notifie si nécessaire. Les sélecteurs absolus permettent de conserver les
données d'origine après les appels HTTP.

Contrat de retour : `{ "audit_saved": true, "notification_sent": true/false }`.
Une absence d'alerte ou une panne Discord donne `notification_sent=false`.
Une erreur de persistance d'audit arrête l'appel, plutôt que d'annoncer un succès.

L'upsert est idempotent pour **la ligne d'audit**. Un nouvel appel avec la même
clé peut encore renvoyer une notification ; la déduplication complète avant
traitement appartient au TP5.

### Import sur une autre instance n8n

1. Créer un credential **Supabase API** avec l'URL du projet et sa clé serveur.
2. Importer `workflow-audit-notification.json`, sélectionner ce credential dans
   `Upsert audit`, puis publier SUB.
3. Importer `workflow-global-error-handler.json`, sélectionner le credential
   dans `Archiver incident DLQ`, puis publier OPS.
4. Importer `workflow-normalisation-filtrage.json`, sélectionner le credential
   dans `Mise a jour en cours`, vérifier le workflow choisi dans `Audit et
   notification` et **Settings → Error Workflow → [OPS] Global Error Handler**,
   puis publier CORE.
5. Vérifier le `.env`, le tunnel et le webhook Supabase, puis faire la recette.

Les exports contiennent la référence du credential, jamais sa valeur secrète.

### Tests

```bash
node --test orchestration/tests/*.test.mjs
RUN_POSTGREST_TEST=1 node --env-file=orchestration/.env --test orchestration/tests/audit-contract.test.mjs
```

La seconde commande écrit une fixture d'audit, contrôle l'upsert et la supprime.
Elle n'envoie aucune notification. Les recettes Bruno créent de vrais tickets.

## TP4 — Gestion centralisée des crashs

**[OPS] Global Error Handler** démarre par Error Trigger. Le Code normalise
`execution_id`, `workflow_name`, `failed_node`, `error_message` et conserve le
payload original dans `payload_snapshot` (objet JSON, pas chaîne sérialisée).
Les champs absents ont un fallback ; les erreurs de trigger sans `execution.id`
sont aussi acceptées. Le nœud fautif vient en priorité de `execution.lastNodeExecuted`,
puis de `execution.error.node.name` ou `trigger.error.node.name`.

Deux branches partent du Code : POST `error_logs` avec le credential Supabase
et alerte Discord contenant le workflow, l'exécution, le nœud et le message.
Elles sont indépendantes : chaque HTTP utilise **Continue (using error output)**
vers un No Operation et un timeout de 5 secondes. Avec l'ordre d'exécution v1,
la branche Discord, située en haut, passe d'abord ; ce ne sont pas deux appels
simultanés. Une erreur Discord n'empêche pas l'archivage, et inversement.
Le résumé Discord est borné et les mentions désactivées ; le diagnostic complet
reste dans la DLQ protégée par RLS.

CORE référence OPS dans **Settings → Error Workflow**. OPS est publié.
SUB propage ses erreurs fatales à l'appel synchrone de CORE : CORE déclenche
alors OPS. SUB n'est pas relié séparément, pour éviter deux alertes pour le même
échec propagé. Les erreurs Discord tolérées dans SUB ne déclenchent pas OPS.

### Recette du crash

1. Ajouter temporairement `throw new Error("Crash de test DLQ");` au début de
   `Normalisation du ticket` dans CORE, puis **Publish**.
2. Depuis Bruno, exécuter **03 → 04**. Le ticket est créé, mais CORE doit échouer.
3. Vérifier l'exécution OPS en mode `error`, la notification et la ligne DLQ.
   La requête **10** filtre par l'identifiant de CORE ; adapter sa variable locale.
4. Retirer le `throw` et **Publish**, puis vérifier **04 → 06 → 09**.

Un clic manuel Execute Workflow dans CORE ne déclenche pas le gestionnaire :
la recette utilise le webhook de production. Execute step sur Error Trigger
fournit un exemple pour comprendre le contrat ; il ne prouve pas le câblage.

Le ticket interrompu reste `nouveau`, et `resolved=false` sur l'incident.
Le snapshot contient le contexte du crash émis par n8n ; il ne contient pas
nécessairement le ticket d'origine et ne constitue pas un rejeu automatique.
Si l'archivage échoue, consulter `Archivage indisponible` dans l'exécution OPS ;
un statut global `success` peut contenir une erreur HTTP volontairement tolérée.
Si Discord et Supabase tombent ensemble, aucune livraison externe n'est garantie.
La déduplication globale avant traitement reste à réaliser au TP5.

Résultats : voir `docs/recette-seance-3-tp4.md` à la racine du dépôt.
