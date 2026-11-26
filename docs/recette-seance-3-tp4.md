# Recette séance 3 — TP4, parties 1 et 2

Réalisée le 26 novembre 2026, à partir des pages 15 à 18 du support.

## Livraison

- `[OPS] Global Error Handler`, ID final `tp4GlobalError02`, publié.
- Error Trigger → normalisation défensive → archivage DLQ et alerte Discord.
- POST sur `public.error_logs` avec le credential Supabase existant ; snapshot
  transmis comme objet JSON natif, sans double sérialisation.
- Fallbacks pour les champs absents ou vides, ID numérique converti en texte,
  prise en charge des erreurs de trigger sans ID d'exécution.
- Branches HTTP indépendantes, Continue using error output vers No Operation,
  timeout de cinq secondes. Discord passe avant l'archivage dans l'ordre v1.
- Résumé Discord borné, mentions désactivées, diagnostic complet dans la DLQ.
- CORE désigne OPS dans `settings.errorWorkflow` ; les trois workflows métier
  CORE, SUB et OPS sont publiés. Les deux variantes de test sont archivées.
- Requête **10 - Incident DLQ TP4** ajoutée dans le dépôt et la collection Bruno
  ouverte ; variable locale `executionId=22`, modifiable pour une nouvelle recette.

## Résultats observés

| Scénario | Exécutions | Résultat |
|---|---|---|
| `throw new Error("Crash de test DLQ")` publié dans CORE, ticket Bruno 04 | CORE 22 / OPS 23 | CORE en erreur ; Discord accepté ; ligne DLQ créée |
| Retrait du throw, republication, ticket nominal Bruno 04 | CORE 24 / SUB 25 | success, ticket `en_cours`, un audit `success`, aucune alerte métier |
| Archivage pointant vers une table inexistante, gestionnaire de test isolé | CORE 34 / OPS de test 35 | sortie Error de l'archivage parcourue ; Discord réussi |
| Vérification du gestionnaire final par payload de webhook invalide | CORE 36 / OPS final 37 | diagnostic archivé et Discord réussi avec la version finale |
| Lecture de l'incident 22 par Bruno 10 | HTTP 200 | 1 test réussi, 0 échec |

Pour le crash Bruno, le ticket a été créé à `10:15:46.412698 UTC`, Discord a
terminé à `10:15:47.143 UTC` et la ligne DLQ a été créée à
`10:15:47.307390 UTC` : respectivement environ **0,73 s** et **0,89 s** après
l'insertion, donc sous les trois secondes demandées.

La ligne DLQ contient `execution_id=22`, le nom de CORE,
`failed_node=Normalisation du ticket`, `Crash de test DLQ [line 1]`,
`resolved=false`, et un snapshot de type JSONB `object` avec le même ID.
Le ticket volontairement interrompu (`011de855-6ab1-4ba7-b25a-6445264e163b`)
reste `nouveau`, sans audit de succès. Le ticket nominal de restauration
(`b666d80b-2424-4f98-b228-32566c9bef80`) est `en_cours`, avec un seul audit.

Le contrat d'exemple manuel a été inspecté en appelant directement la méthode
`execute()` du nœud Error Trigger installé, en mode manuel. Le câblage réel a
ensuite été vérifié avec le payload de production de l'exécution 23, ce qu'un
simple Execute step ne permet pas de prouver.

## Incidents rencontrés pendant la recette

L'ancien tunnel `flight-heart-guns-primary.trycloudflare.com` ne se résolvait
plus. Deux insertions Bruno antérieures au test n'ont donc pas atteint n8n
(`Couldn't resolve host name` dans les réponses réseau Supabase). Le tunnel a
été renouvelé : `https://winston-length-univ-frank.trycloudflare.com`.
Le `.env` local et le trigger INSERT `on_ticket_mutation` ont été mis à jour.
Ces deux tickets restent conservés, sans rejeu automatique.

La simulation supplémentaire de panne d'archivage a révélé une incohérence de
publication : les exécutions continuaient à charger l'ancien gestionnaire malgré
des imports CLI. La commande `publish:workflow` de la version installée met à jour
`activeVersionId`, mais pas le mapping `workflow_published_version`. Les références
ont été sauvegardées puis remises en cohérence. Cette synchronisation seule n'a
pas suffi à reproduire la panne ; le test a été réalisé sur un gestionnaire isolé,
et le gestionnaire final recréé sous un nouvel ID.

Les versions précédentes sont archivées. Les essais intermédiaires 26/27, 28/29,
30/31 et 32/33 ont produit des diagnostics supplémentaires et des alertes de test ;
ils ne constituent pas la preuve de la panne d'archivage. La preuve est 34/35.
La comparaison des paramètres du snapshot réellement exécuté en **37** avec
l'export final a réussi (n8n ajoute ses paramètres par défaut à l'exécution).

## Vérifications finales

- Suite Node : **9 tests réussis**, 1 test réseau TP3 désactivé par défaut.
- Les nouveaux tests exécutent le Code exporté : champs absents/null, fallback
  de nœud, erreur de trigger, snapshot objet et borne Discord.
- Une régression sur le fallback d'une chaîne vide a été reproduite puis corrigée.
- Le test Bruno a détecté l'usage de `getVar` au lieu de `getRequestVar` pour la
  variable locale ; corrigé et réexécuté avec succès dans l'application.
- Versions finales CORE/OPS actives, publication cohérente, paramètres et
  connexions identiques aux exports ; aucun throw de recette dans CORE final.
- Relecture indépendante : aucun défaut bloquant ; fallback vide corrigé.

## Limites

La DLQ garde le contexte fourni par n8n, pas nécessairement le ticket complet.
Elle n'effectue aucun rejeu automatique. Une erreur HTTP tolérée peut donner un
statut global OPS `success` : consulter les sorties Error pour distinguer un
archivage ou une notification indisponible. Une panne simultanée des deux services
ne garantit aucune livraison externe. La déduplication globale appartient au TP5.

Les liens d'exécution présents dans le snapshot utilisent le domaine du webhook ;
le proxy n'expose pas l'administration n8n. Pour consulter les traces, utiliser
`http://localhost:5678/workflow/GKbjeSTwLn72snGN/executions/22` sur ce Mac.
