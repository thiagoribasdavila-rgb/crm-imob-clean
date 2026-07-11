create table if not exists public.user_provisioning_failures (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  error_message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.user_provisioning_failures enable row level security;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_organization_id uuid;
  assigned_role text;
begin
  perform pg_advisory_xact_lock(hashtext('atlas_auth_profile_provisioning'));

  insert into public.organizations (name, slug, plan, active)
  values ('Atlas AI', 'atlas-default', 'founder', true)
  on conflict (slug) do update
    set active = true,
        updated_at = now()
  returning id into target_organization_id;

  if target_organization_id is null then
    select id into target_organization_id
    from public.organizations
    where slug = 'atlas-default'
    limit 1;
  end if;

  if exists (select 1 from public.profiles limit 1) then
    assigned_role := 'broker';
  else
    assigned_role := 'admin';
  end if;

  insert into public.profiles (
    id,
    organization_id,
    full_name,
    role,
    active
  ) values (
    new.id,
    target_organization_id,
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário Atlas'
    ),
    assigned_role,
    true
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        active = true,
        updated_at = now();

  return new;
exception
  when others then
    insert into public.user_provisioning_failures (user_id, email, error_message)
    values (new.id, new.email, sqlerrm);
    return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.reconcile_auth_profiles()
returns table (processed integer, remaining_failures integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_organization_id uuid;
  processed_count integer := 0;
begin
  insert into public.organizations (name, slug, plan, active)
  values ('Atlas AI', 'atlas-default', 'founder', true)
  on conflict (slug) do update set active = true, updated_at = now()
  returning id into target_organization_id;

  insert into public.profiles (id, organization_id, full_name, role, active)
  select
    u.id,
    target_organization_id,
    coalesce(nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Usuário Atlas'),
    case when row_number() over (order by u.created_at, u.id) = 1 and not exists (select 1 from public.profiles) then 'admin' else 'broker' end,
    true
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  on conflict (id) do nothing;

  get diagnostics processed_count = row_count;

  update public.user_provisioning_failures f
  set resolved_at = now()
  where resolved_at is null
    and exists (select 1 from public.profiles p where p.id = f.user_id);

  return query
  select processed_count, count(*)::integer
  from public.user_provisioning_failures
  where resolved_at is null;
end;
$$;

revoke all on function public.reconcile_auth_profiles() from public, anon, authenticated;
grant execute on function public.reconcile_auth_profiles() to service_role;