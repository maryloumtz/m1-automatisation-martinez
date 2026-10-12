alter table public.organisations enable row level security;
alter table public.profils enable row level security;
alter table public.tickets enable row level security;

create or replace function public.public_get_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profils.organisation_id
  from public.profils as profils
  where profils.id = (select auth.uid())
$$;

revoke execute on function public.public_get_org_id() from public, anon;
grant execute on function public.public_get_org_id() to authenticated;

create policy "Les utilisateurs lisent les tickets de leur organisation"
on public.tickets
for select
to authenticated
using (
  organisation_id = (select public.public_get_org_id())
);

create policy "Les utilisateurs creent des tickets pour leur organisation"
on public.tickets
for insert
to authenticated
with check (
  cree_par = (select auth.uid())
  and organisation_id = (select public.public_get_org_id())
);
