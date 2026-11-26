-- Séance 3, TP1 : audit / registre d'idempotence et file d'erreurs.
-- Les workflows de remplissage seront ajoutés dans les TP suivants.
create table public.workflow_logs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key varchar(255) not null unique,
  workflow_name varchar(120) not null,
  ticket_id uuid references public.tickets(id) on delete set null,
  statut text not null check (statut in ('processing', 'success', 'ignored')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workflow_logs_ticket_id_idx on public.workflow_logs(ticket_id);

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null,
  workflow_name text not null,
  failed_node text not null,
  error_message text not null,
  payload_snapshot jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.workflow_logs enable row level security;
alter table public.error_logs enable row level security;

-- Supprimer les privilèges éventuellement hérités des default privileges.
revoke all on public.workflow_logs, public.error_logs from public, anon, authenticated;

-- SELECT permet la recette HTTP 200 + [] : sans politique RLS, aucune ligne
-- n'est visible pour anon/authenticated, même quand des journaux existent.
grant select on public.workflow_logs, public.error_logs to anon, authenticated;
grant select, insert, update, delete on public.workflow_logs, public.error_logs to service_role;
