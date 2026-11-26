# Recette séance 3 — TP5, parties 1 à 3

Réalisée le 26 novembre 2026, à partir des pages 22 à 25 du support complet.

## Livraison

CORE ajoute après la normalisation un GET sur `workflow_logs`, filtré par
`idempotency_key`, avec le credential Supabase et **Always Output Data**.
`Evenement inedit ?` vérifie si l'ID retourné est vide : True poursuit le routage,
le PATCH et SUB ; False termine sur `Doublon ignore` (No Operation).
Les expressions de routage et de PATCH lisent désormais explicitement la sortie
de `Normalisation du ticket`, car un GET sans résultat transmet un objet vide.

La clé reste `tickets:<UUID>:INSERT:nouveau`. Le PATCH conserve trois tentatives
au total, espacées de 2000 ms, et arrête CORE en cas d'échec. OPS reçoit alors
l'erreur, alerte Discord et archive le diagnostic dans `error_logs`.

Les trois exports de l'instance sont rangés dans `orchestration/workflows/` :

- `[CORE] Ingestion & Routage Tickets.json` ;
- `[SUB] Audit & Notification.json` ;
- `[OPS] Global Error Handler.json`.

Leurs références de credentials ne contiennent pas les valeurs secrètes.
La migration `supabase/migrations/20261126081311_03_observabilite_et_erreurs.sql`
est déjà appliquée ; aucune nouvelle migration n'est nécessaire.
Bruno contient **11 - Rafale anti-doublon TP5** et **12 - Poison pill TP5**.

## Rafale espacée : résultat vérifié

Ticket dédié : `23c3ae4a-036c-4dd1-ab71-8e26af1a2b48`, préparé sans audit avant
la recette finale. Les trois requêtes identiques ont été exécutées avec Bruno CLI
4.4.0 dans une collection temporaire de trois requêtes, avec `--delay 2000`.
Résultat Bruno : trois requêtes et trois tests réussis. Les heures ci-dessous sont UTC.

| Tir | Début | Exécutions | Résultat réel n8n |
|---|---|---|---|
| 1 | 10:57:41.661 | CORE 45, SUB 46 | PATCH, un audit, notification Discord réussie |
| 2 | 10:57:44.015 | CORE 47 | Doublon ignoré, aucun PATCH ni appel SUB |
| 3 | 10:57:46.332 | CORE 48 | Doublon ignoré, aucun PATCH ni appel SUB |

Après cette rafale, le ticket est `en_cours` et possède exactement une ligne
d'audit. Une nouvelle utilisation de Bruno 11 sur ce ticket doit donc être
ignorée. Pour refaire le premier passage, préparer une nouvelle fixture ou
retirer uniquement l'audit de ce ticket de recette.

Un premier essai utilisant `--iteration-count 3 --delay 2000` n'a pas espacé les
itérations de la requête unique avec cette version de Bruno CLI. CORE 40 et 41
ont démarré avant la fin de l'audit, entraînant deux appels SUB (42 et 44), donc
deux notifications. CORE 43 a été ignoré. L'état et l'audit de la seule fixture
ont été réinitialisés avant la rafale finale ci-dessus. Le résultat « une seule
notification » concerne cette rafale finale, pas l'ensemble des essais.

## Poison pill : résultat vérifié

Bruno 12 envoie un événement avec `record.id=ticket-invalide-123`. Le webhook
répond HTTP 200 avec l'accusé de réception ; ce statut ne décrit pas le résultat
asynchrone du workflow.

- **CORE 49** : passage par le filtre, puis erreur HTTP **400** dans
  `Mise a jour en cours`, sans appel SUB.
- Le PATCH dure environ **4,5 secondes**, ce qui est cohérent avec les deux
  pauses de 2000 ms configurées entre les trois tentatives. La durée ne constitue
  pas un comptage indépendant des requêtes HTTP.
- **OPS 50** : notification Discord et archivage DLQ réussis, sans sortie Error.
- `error_logs` contient `execution_id=49`, `failed_node=Mise a jour en cours`,
  `resolved=false` et un `payload_snapshot` de type JSONB `object`.

Bruno 10 reste la recette du crash TP4 ; sa vérification du message de crash
spécifique ne s'applique pas à cette erreur HTTP 400.

## Vérifications et limites

Les tests locaux exécutent les expressions exportées avec un GET vide pour
vérifier que le routage et le PATCH conservent les données du ticket. La suite
comprend 11 tests réussis et un test réseau TP3 désactivé par défaut. Les
exécutions réelles ci-dessus couvrent le filtre et le gestionnaire d'erreur.
Les trois exports ont été comparés aux exports actifs de n8n. La revue a aussi
conduit à préciser le choix du credential dans le GET lors d'un nouvel import.

Ce filtre assure la déduplication **séquentielle** demandée. Il ne réserve pas
atomiquement la clé : deux événements simultanés peuvent passer le GET avant
que SUB écrive l'audit, comme l'a montré le premier essai. Un verrou atomique
serait nécessaire pour traiter ce cas. Si le PATCH réussit mais que l'audit
échoue, un rejeu peut également recommencer le traitement. Les en-têtes
`Idempotency-Key` et `X-Request-Id` ne sont pas utilisés par cette version.

Le tunnel de développement peut changer d'URL ; mettre à jour `webhookUrl` dans
Bruno 11 et 12 après son renouvellement. Les notifications observées sont les
réponses réussies de l'API Discord, sans vérification de lecture humaine.

## Versioning livré

Le commit `98f9e95` contient le TP5. Il a été poussé sur `origin/main`, avec
les quatre commits précédents de la séance 3, dont la migration SQL.
Le contrôle des secrets a porté sur les fichiers actuels et les commits sortants ;
aucune clé serveur ni URL Discord privée n’a été détectée. L’URL factice
de panne Discord documentée au TP2 a été vérifiée séparément.
