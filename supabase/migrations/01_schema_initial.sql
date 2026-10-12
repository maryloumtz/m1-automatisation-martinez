create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_at timestamp with time zone default now()
);

create table public.profils (
  id uuid primary key
    references auth.users (id) on delete cascade,
  organisation_id uuid not null
    references public.organisations (id) on delete restrict,
  role text
    constraint profils_role_check check (role in ('admin', 'tech', 'client')),
  nom_complet text not null,
  created_at timestamp with time zone default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations (id) on delete cascade,
  cree_par uuid not null
    references public.profils (id) on delete restrict,
  titre varchar(255) not null,
  description text not null,
  statut text
    constraint tickets_statut_check
    check (statut in ('nouveau', 'en_cours', 'resolu', 'ferme'))
    default 'nouveau',
  priorite text
    constraint tickets_priorite_check
    check (priorite in ('basse', 'normale', 'haute', 'critique'))
    default 'normale',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index tickets_organisation_id_idx
  on public.tickets (organisation_id);

create index tickets_statut_idx
  on public.tickets (statut);
