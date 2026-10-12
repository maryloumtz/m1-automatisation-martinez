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
