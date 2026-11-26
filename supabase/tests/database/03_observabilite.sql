-- Test transactionnel : aucune fixture ni événement pg_net n'est conservé.
begin;

do $$
begin
  assert to_regclass('public.workflow_logs') is not null, 'workflow_logs manquante';
  assert to_regclass('public.error_logs') is not null, 'error_logs manquante';
end $$;

do $$
declare
  audit public.workflow_logs;
  erreur public.error_logs;
begin
  assert (select count(*) = 2 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('workflow_logs', 'error_logs') and c.relrowsecurity),
    'RLS obligatoire sur les deux tables';
  assert (select count(*) = 0 from pg_policies
    where schemaname = 'public' and tablename in ('workflow_logs', 'error_logs')),
    'Aucune politique publique attendue';

  insert into public.workflow_logs (idempotency_key, workflow_name, statut)
    values ('test-tp1-' || gen_random_uuid(), 'test-tp1', 'processing') returning * into audit;
  assert audit.id is not null and audit.created_at is not null and audit.details = '{}'::jsonb
    and audit.ticket_id is null, 'Valeurs par défaut audit incorrectes';

  begin
    insert into public.workflow_logs (idempotency_key, workflow_name, statut)
      values (audit.idempotency_key, 'test-tp1', 'success');
    raise exception 'Une clé d''idempotence dupliquée est acceptée';
  exception when unique_violation then null;
  end;
  begin
    update public.workflow_logs set statut = 'inconnu' where id = audit.id;
    raise exception 'Un statut inconnu est accepté';
  exception when check_violation then null;
  end;
  begin
    update public.workflow_logs set idempotency_key = repeat('x', 256) where id = audit.id;
    raise exception 'Clé supérieure à 255 caractères acceptée';
  exception when string_data_right_truncation then null;
  end;
  begin
    update public.workflow_logs set workflow_name = repeat('x', 121) where id = audit.id;
    raise exception 'Nom supérieur à 120 caractères accepté';
  exception when string_data_right_truncation then null;
  end;
  begin
    update public.workflow_logs set details = null where id = audit.id;
    raise exception 'details NULL accepté';
  exception when not_null_violation then null;
  end;
  begin
    update public.workflow_logs set ticket_id = gen_random_uuid() where id = audit.id;
    raise exception 'Référence vers un ticket inexistant acceptée';
  exception when foreign_key_violation then null;
  end;
  assert exists (select 1 from pg_constraint where conrelid = 'public.workflow_logs'::regclass
    and contype = 'f' and confrelid = 'public.tickets'::regclass and confdeltype = 'n'),
    'La suppression du ticket doit mettre ticket_id à NULL';
  update public.workflow_logs set statut = 'success' where id = audit.id;
  update public.workflow_logs set statut = 'ignored' where id = audit.id;

  insert into public.error_logs (execution_id, workflow_name, failed_node, error_message)
    values ('test-tp1', 'test-tp1', 'test', 'Erreur de test annulée') returning * into erreur;
  assert erreur.id is not null and erreur.created_at is not null
    and erreur.payload_snapshot = '{}'::jsonb and erreur.resolved = false,
    'Valeurs par défaut DLQ incorrectes';
  begin
    update public.error_logs set payload_snapshot = null where id = erreur.id;
    raise exception 'payload_snapshot NULL accepté';
  exception when not_null_violation then null;
  end;
end $$;

-- Vérifie le masquage alors que les tables contiennent des fixtures.
set local role anon;
do $$
begin
  assert (select count(*) = 0 from public.workflow_logs), 'Fuite audit vers anon';
  assert (select count(*) = 0 from public.error_logs), 'Fuite DLQ vers anon';
  assert not has_table_privilege(current_user, 'public.workflow_logs', 'INSERT'), 'anon peut écrire';
  assert not has_table_privilege(current_user, 'public.error_logs', 'UPDATE'), 'anon peut modifier';
end $$;
reset role;

set local role authenticated;
do $$
begin
  assert (select count(*) = 0 from public.workflow_logs), 'Fuite audit vers authenticated';
  assert (select count(*) = 0 from public.error_logs), 'Fuite DLQ vers authenticated';
end $$;
reset role;

set local role service_role;
do $$
begin
  assert exists (select 1 from public.workflow_logs where workflow_name = 'test-tp1'), 'Audit inaccessible au serveur';
  assert exists (select 1 from public.error_logs where workflow_name = 'test-tp1'), 'DLQ inaccessible au serveur';
  insert into public.workflow_logs (idempotency_key, workflow_name, statut)
    values ('test-serveur-' || gen_random_uuid(), 'test-tp1', 'success');
  insert into public.error_logs (execution_id, workflow_name, failed_node, error_message)
    values ('test-serveur', 'test-tp1', 'test', 'Test serveur annulé');
end $$;
reset role;

rollback;
select 'PASS : contraintes, valeurs par défaut, RLS anon/authenticated et accès service_role' as resultat;
