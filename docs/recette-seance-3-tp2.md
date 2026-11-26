# Recette séance 3 — TP2 (pages 8 à 10)

Réalisée le 26 novembre 2026 sur le workflow publié
`[CORE] Ingestion & Routage Tickets`, identifiant conservé.

## Réglages appliqués

| Nœud | Retry On Fail | Tentatives / délai | On Error |
|---|---|---|---|
| Mise a jour en cours | Oui | 3 au total / 2 000 ms | Stop Workflow |
| Notification externe | Non | Sans objet | Continue (using error output) |

La notification et le PATCH sont en parallèle. La sortie Error de la
notification mène à `Notification indisponible (non bloquante)`, un nœud
No Operation terminal. Elle ne déclenche pas un second PATCH.

## Injection de panne depuis Bruno

1. Sauvegarde de la version initiale et vérification de sa cohérence avec Git.
2. Publication d'une variante avec URL Discord volontairement invalide.
3. Envoi de la requête critique 05 depuis Bruno, profil préparé précédemment.
4. Exécution **14** : statut global **success**, sortie normale Discord vide,
   sortie Error contenant un item, No Operation exécuté et PATCH réussi.
5. Lecture indépendante dans Supabase : le ticket de recette est `en_cours`.
6. Restauration de l'URL valide via `$env.NOTIFICATION_WEBHOOK_URL`, publication
   puis rechargement du workflow.
7. Nouveau ticket Bruno : exécution **15**, statut global **success**, sortie
   normale Discord contenant un item, sortie Error vide, PATCH `en_cours`.

Deux tickets de recette conservés. La vraie URL Discord n'a pas été modifiée
dans le `.env`. La version finale est publiée et le point de santé n8n répond
HTTP 200. Les réglages de retry du PATCH ont été vérifiés dans le workflow
installé ; aucune panne Supabase réelle n'a été provoquée pour cette recette.

## Portée des pages 8 et 9

Le cours distingue pannes transitoires (429, 5xx, timeout) et erreurs permanentes
(400, 401, 404, exception JS). Le réglage natif demandé au TP2 applique un délai
fixe ; il ne réalise pas à lui seul une classification des erreurs ni un
backoff exponentiel avec jitter.

Les TP ultérieurs ajouteront la capture globale, la DLQ et les sous-workflows.
Ils ne sont pas présents dans les pages supplémentaires fournies et ne sont
pas implémentés ici. En cas d'épuisement du retry critique, le workflow s'arrête
en erreur ; l'alerte globale n'est pas encore câblée.
