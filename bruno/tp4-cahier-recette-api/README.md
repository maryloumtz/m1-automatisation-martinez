# Recette API — séance 2 et séance 3 TP1 à TP5

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
| 10 | Lecture du crash TP4 par son identifiant d'exécution CORE |
| 11 | Événement direct vers n8n pour la rafale anti-doublon TP5 |
| 12 | Poison pill TP5 : UUID invalide, erreur PATCH puis OPS |

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
Depuis le TP4, **[OPS] Global Error Handler** archive les crashs de production
dans `error_logs` et alerte Discord. La requête **10** lit l'incident de la recette
(exécution CORE 22). Modifier sa variable locale `executionId` pour une nouvelle
recette. **08** doit toujours retourner `[]` avec la clé publique, même lorsque
la table contient des incidents.

Pour simuler un crash : dans le Code initial de CORE, ajouter temporairement
`throw new Error("Crash de test DLQ");`, publier, puis exécuter **04**.
Contrôler l'alerte et **10**, retirer le `throw`, republier et vérifier **04 → 06 → 09**.
Le ticket du crash reste `nouveau` ; il n'est pas rejoué automatiquement.

## TP5 : doublons et poison pill

**11** réutilise un ticket dédié déjà présent en base. La recette a envoyé le
même événement trois fois avec deux secondes de pause : un seul traitement et
une seule notification, puis deux passages sur `Doublon ignore`. Le ticket de
la requête est déjà audité ; les prochains tirs seront donc ignorés.

Pour refaire un premier passage, préparer un ticket de test sans audit et
adapter le payload et `replayTicketId`. La variable locale `webhookUrl` contient
l'adresse du tunnel ; la mettre à jour si le tunnel change.

**12** est à exécuter séparément : l'accusé HTTP 200 est attendu, mais le PATCH
doit ensuite échouer en HTTP 400 sur l'UUID invalide. Vérifier CORE puis OPS et
`error_logs` après au moins cinq secondes. La requête **10** reste spécifique
au crash TP4 (elle attend son message) et ne valide pas la poison pill TP5.

Ne pas utiliser `--iteration-count 3 --delay 2000` pour espacer une seule requête
avec Bruno CLI 4.4.0 : le délai ne s'applique pas entre ces itérations. La boucle
avec pause et les limites du filtre séquentiel sont documentées dans
`../../orchestration/README.md`.

## Dossier de collection

La collection du dépôt est la référence à versionner. La copie importée ouverte
sur cette machine se trouve dans `~/Documents/bruno/TP 4 et TP 5 - Recette API`.
Elle a été complétée avec les requêtes manquantes, sans modifier ses secrets.
Pour les prochaines modifications, ouvrir directement la collection du dépôt
ou synchroniser les fichiers `.bru` dans la copie importée.

Relance : voir `../../orchestration/README.md` dans le dépôt.
