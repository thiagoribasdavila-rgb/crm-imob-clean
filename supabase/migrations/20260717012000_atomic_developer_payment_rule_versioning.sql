begin;

create or replace function public.version_developer_payment_rule(
  p_organization_id uuid,
  p_created_by uuid,
  p_developer_name text,
  p_rule_name text,
  p_payment_flow text,
  p_down_payment_percent numeric default null,
  p_installments_count integer default null,
  p_balloon_payment_notes text default null,
  p_financing_notes text default null,
  p_valid_from date default null,
  p_valid_until date default null
) returns public.developer_payment_flow_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
  created_rule public.developer_payment_flow_rules;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_created_by
      and organization_id = p_organization_id
      and active = true
      and (role = 'admin' or commercial_role in ('director', 'superintendent'))
  ) then
    raise exception 'payment_rule_forbidden';
  end if;
  if length(trim(p_developer_name)) < 2 or length(trim(p_rule_name)) < 2 or length(trim(p_payment_flow)) < 10 then
    raise exception 'payment_rule_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || lower(trim(p_developer_name)), 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.developer_payment_flow_rules
  where organization_id = p_organization_id and lower(developer_name) = lower(trim(p_developer_name));

  update public.developer_payment_flow_rules
  set active = false, updated_at = now()
  where organization_id = p_organization_id and lower(developer_name) = lower(trim(p_developer_name)) and active = true;

  insert into public.developer_payment_flow_rules (
    organization_id, developer_name, version, rule_name, payment_flow,
    down_payment_percent, installments_count, balloon_payment_notes,
    financing_notes, valid_from, valid_until, active, created_by
  ) values (
    p_organization_id, trim(p_developer_name), next_version, trim(p_rule_name), trim(p_payment_flow),
    p_down_payment_percent, p_installments_count, nullif(trim(p_balloon_payment_notes), ''),
    nullif(trim(p_financing_notes), ''), p_valid_from, p_valid_until, true, p_created_by
  ) returning * into created_rule;
  return created_rule;
end;
$$;

revoke all on function public.version_developer_payment_rule(uuid, uuid, text, text, text, numeric, integer, text, text, date, date) from public, anon, authenticated;
grant execute on function public.version_developer_payment_rule(uuid, uuid, text, text, text, numeric, integer, text, text, date, date) to service_role;

commit;
