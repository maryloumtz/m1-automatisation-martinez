# Recette API — séance 2 et séance 3 TP1 à TP3

Ouvrir ce dossier comme collection Bruno et sélectionner **Supabase**.
Renseigner `publishableKey` et `secretKey` dans les variables secrètes de Bruno,
jamais dans les fichiers `.bru`.

| Requête | Usage |
|---|---|
| 01 | Création initiale d’une organisation ; inutile à chaque relance |
| 02 | Cloisonnement RLS des tickets avec la clé publique |
| 03 | Récupération du profil et de l’organisation pour les clés étrangères |
| 04 | Ticket standard, branche False de n8n |
| 05 | Ticket critique, branche True et notification Discord |
| 06 | Contrôle du passage du ticket 04 ou 05 à `en_cours` |
| 07 | Lecture publique de `workflow_logs` : HTTP 200 et `[]` |
| 08 | Lecture publique de `error_logs` : HTTP 200 et `[]` |
| 09 | Audit du ticket courant : une ligne `success`, clé déterministe |

## Smoke test

1. Vérifier le workflow publié **[CORE] Ingestion & Routage Tickets** et le
   webhook Supabase `on_ticket_mutation` : nouvelle URL du tunnel, chemin
   `/webhook/tickets-webhook`, événement **INSERT uniquement**.
2. Exécuter **03**, puis **05** : HTTP 200 puis 201, tests verts.
3. Après environ deux secondes, exécuter **06** : HTTP 200, `en_cours`.
4. Vérifier une exécution réussie dans n8n et la notification Discord.
5. Exécuter **07** et **08** : HTTP 200 et `[]`.

Branche standard : **03 → 04 → 06**, sans notification Discord.
Les insertions créent réellement des tickets : ne pas relancer toute la collection
pour simplement consulter un statut. Si 03 renvoie `[]`, créer un utilisateur
Supabase Auth et son profil associé avant la recette.

Depuis le TP3, les deux branches enregistrent automatiquement un audit via
**[SUB] Audit & Notification**. Exécuter **09** après **06** pour le vérifier.
Le ticket critique produit une notification ; le ticket normal n'en produit pas.
Un titre contenant « panne », « bloquant » ou « urgent » déclenche également
une notification, même avec une priorité normale.
`error_logs` sera alimentée lors du TP Error Trigger. Le test SQL vérifie aussi
le masquage RLS avec des lignes présentes.

## Dossier de collection

La collection du dépôt est la référence à versionner. La copie importée ouverte
sur cette machine se trouve dans `~/Documents/bruno/TP 4 et TP 5 - Recette API`.
Elle a été complétée avec les requêtes manquantes, sans modifier ses secrets.
Pour les prochaines modifications, ouvrir directement la collection du dépôt
ou synchroniser les fichiers `.bru` dans la copie importée.

Relance : voir `../../orchestration/README.md` dans le dépôt.
