# Recette séance 3 — TP1

Vérification du 26 novembre 2026, vers 09 h 24 (Europe/Paris).

## Infrastructure et smoke test

- n8n 2.42.7 : santé HTTP 200, volume conservé.
- Workflow `[CORE] Ingestion & Routage Tickets` publié, même identifiant que
  le workflow de séance 2, sans données épinglées.
- `on_ticket_mutation` recâblé vers le tunnel courant ; déclencheur AFTER
  INSERT FOR EACH ROW uniquement. En-têtes et autres paramètres conservés.
- Requête 03 exécutée depuis Bruno : HTTP 200, profil existant.
- Deux tickets critiques créés depuis Bruno à 09:23:28 et 09:23:52.
- Exécutions n8n 12 et 13 : succès, notification réussie et retour PATCH
  `en_cours`. Statut confirmé ensuite par une lecture SQL indépendante.
- Délais depuis la création du ticket jusqu'à la fin du workflow :
  **1 234 ms** et **760 ms**. Temps n8n seuls : 676 ms et 656 ms.
- Une exécution par insertion ; aucun nouveau déclenchement dû aux PATCH.
- Deux tickets de recette ont été conservés dans la base.

## Observabilité et RLS

- Migration CLI `20261126081311_03_observabilite_et_erreurs.sql` appliquée par
  `supabase db push --linked --skip-vault` ; historiques local/distant alignés.
- `workflow_logs` et `error_logs` créées avec les colonnes et contraintes du TP1.
- Test SQL observé en échec avant la migration : `workflow_logs manquante`.
- Même test après migration : PASS, avec fixtures transactionnelles annulées.
- Vérifications : unicité, longueurs, statut, JSONB non nul, valeurs par défaut,
  FK et ON DELETE SET NULL, RLS active sans politique, masquage anon et
  authenticated malgré des lignes présentes, lecture/écriture service_role.
- GET HTTP réel avec clé anon : 200 + `[]` pour les deux tables.
- GET HTTP réel avec clé service_role : 200 pour les deux tables.

## Fichiers et périmètre

- Requêtes Bruno 05 à 08 ajoutées dans le dépôt et dans la copie ouverte par
  l'application. Aucune clé utilisateur remplacée.
- Requête 04 et README actualisés pour remplacer les anciennes consignes
  webhook.site par le parcours n8n.
- Compose validé, syntaxe Node du proxy valide, export JSON valide.
- Fichiers destinés à Git contrôlés sans valeur de secret détectée.
- Proxy existant conservé : seul le webhook de production est exposé par le
  tunnel. Le GET racine 404 est attendu, l'interface n8n reste hors du tunnel.
- Le workflow utilise encore les variables serveur ; migration vers les
  Credentials conseillée dans les rappels mais non réalisée dans ce TP1.
- TP2 à TP5 de séance 3 non réalisés. Les journaux ne sont pas encore alimentés
  automatiquement ; cette partie vient avec les sous-workflows et Error Trigger.

## Audit de sécurité complémentaire

Aucune erreur bloquante signalée par `supabase db advisors --linked --type
security --level warn --fail-on error`. Deux avertissements sur des éléments
préexistants, non modifiés par le TP1 :

- `public_get_org_id()` est une fonction SECURITY DEFINER accessible au rôle
  authenticated pour les politiques RLS de séance 1 :
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Protection contre les mots de passe compromis désactivée dans Supabase Auth :
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
