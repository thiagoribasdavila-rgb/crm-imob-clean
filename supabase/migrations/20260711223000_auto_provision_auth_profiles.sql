create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  assigned_role text;
begin
  select id
    into target_organization_id
  from public.organizations
  where active = true
  order by created_at asc
  limit 1;

  if target_organization_id is null then
    raise exception 'No active organization available for user provisioning';
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
  )
  values (
    new.id,
    target_organization_id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    assigned_role,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
