# Relance n8n et recette — séance 3 TP1 à TP3

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
   Tickets** est publié. Ne pas épingler de données pendant la recette réelle.

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
3. Importer `workflow-normalisation-filtrage.json`, sélectionner le credential
   dans `Mise a jour en cours`, vérifier le workflow choisi dans `Audit et
   notification`, puis publier CORE.
4. Vérifier le `.env`, le tunnel et le webhook Supabase, puis faire la recette.

Les exports contiennent la référence du credential, jamais sa valeur secrète.

### Tests

```bash
node --test orchestration/tests/*.test.mjs
RUN_POSTGREST_TEST=1 node --env-file=orchestration/.env --test orchestration/tests/audit-contract.test.mjs
```

La seconde commande écrit une fixture d'audit, contrôle l'upsert et la supprime.
Elle n'envoie aucune notification. Les recettes Bruno créent de vrais tickets.

Error Trigger / DLQ et filtrage anti-doublon global (TP4/TP5) restent à réaliser.
`workflow_logs` est maintenant alimentée ; `error_logs` ne l'est pas encore.
