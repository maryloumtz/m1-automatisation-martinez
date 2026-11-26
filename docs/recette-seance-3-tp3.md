# Recette séance 3 — TP3 (pages 11 à 14)

Réalisée le 26 novembre 2026. La page 10 reprend le TP2 déjà réalisé.

## Livraison

- Sous-workflow publié `[SUB] Audit & Notification` (`tp3AuditNotify01`).
- Déclencheur When Executed by Another Workflow avec six entrées typées :
  cinq chaînes (`idempotency_key`, `workflow_name`, `ticket_id`, `statut`,
  `alert_message`) et un objet (`details`).
- Credential Supabase API chiffré créé dans le projet n8n existant et utilisé
  pour l'upsert d'audit et le PATCH métier. Aucun secret dans les exports.
- POST PostgREST avec `on_conflict=idempotency_key` et préférence
  `resolution=merge-duplicates,return=representation`.
- Conversion d'un `ticket_id` vide en NULL ; details conservé comme JSONB.
- Notification conditionnelle, erreur non bloquante et contrat de retour compact.
- CORE publié : clé `tickets:<UUID>:INSERT:nouveau`, plus d'appel Discord direct,
  appel synchrone de SUB après le PATCH sur les deux branches.
- Retry critique du TP2 conservé : 3 tentatives / délai 2000 ms / Stop Workflow.

## Résultats observés

| Recette | Exécutions CORE / SUB | Résultat |
|---|---|---|
| Ticket critique depuis Bruno 05 | 16 / 17 | success, audit_saved=true, notification_sent=true |
| Ticket normal depuis Bruno 04 | 18 / 19 | success, audit_saved=true, notification_sent=false |
| URL Discord invalide dans SUB | 20 / 21 | success, audit_saved=true, notification_sent=false |

Les deux tickets Bruno ont chacun une ligne `workflow_logs` en `success`, avec
la priorité et le booléen d'alerte attendus. Leur statut métier est `en_cours`.
Le cas de panne a parcouru la sortie Error de Discord et le No Operation du
sous-workflow ; le parent a reçu le résultat sans crash. L'URL valide a ensuite
été restaurée et SUB republié.

Test de normalisation : clé manquante constatée avant modification (RED), puis
tests verts après modification. Cinq tests locaux passent ; le test réseau
est désactivé par défaut et a été exécuté séparément avec succès.

Le test réseau utilise le corps et les paramètres du nœud d'upsert : deux POST
avec la même clé, d'abord `processing` puis `success`, conservent le même UUID
et une seule ligne ; `ticket_id` vaut NULL. Sa fixture a été supprimée.

## Utilisation

- Bruno : **03 → 05 → 06 → 09** pour le parcours critique.
- Bruno : **03 → 04 → 06 → 09** pour le parcours normal.
- Trois tickets métier de recette ont été conservés pour ce TP.
- La requête 09 contrôle l'audit du dernier ticket injecté.

## Limites du périmètre

L'idempotence obtenue ici concerne l'unicité de la ligne d'audit. L'upsert
répété peut encore provoquer un nouvel envoi de notification si un message
est fourni ; le filtrage global des doublons est prévu au TP5. L'Error Trigger,
la DLQ et l'alimentation d'error_logs sont prévus au TP4, pas dans ce livrable.
