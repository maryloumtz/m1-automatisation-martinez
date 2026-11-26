# Relance n8n et recette — séance 3 TP1

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
cours (`latest`). Le workflow existant utilise encore les variables serveur
`$env` avec `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` ; le passage aux Credentials
conseillé dans le rappel de séance 3 reste une amélioration distincte du TP1.

## Recette Bruno

Collection `bruno/tp4-cahier-recette-api`, environnement Supabase :

- **03 → 05 → 06** : ticket critique, notification Discord, statut `en_cours`.
- **03 → 04 → 06** : ticket standard, statut `en_cours`, sans notification.
- **07 et 08** : HTTP 200 et `[]` avec la clé publique.

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

Les retries, sous-workflows, Error Trigger et traitements anti-doublons des
TP2 à TP5 ne sont pas encore implémentés. Les journaux restent donc vides au TP1.
