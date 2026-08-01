begin;

create or replace function public.bulk_transfer_leads(p_actor_id uuid, p_organization_id uuid, p_lead_ids uuid[], p_target_owner_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_role text; target_role text; target_reports_to uuid; requested_count integer; accessible_count integer; batch_id uuid;
  broker_ids uuid[]; broker_count integer; lead_row record; actual_target uuid; position integer := 0;
begin
  requested_count := coalesce(array_length(p_lead_ids, 1), 0);
  if requested_count < 1 or requested_count > 200 then raise exception 'A transferência deve conter entre 1 e 200 leads.'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe um motivo com pelo menos 5 caracteres.'; end if;

  select coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end)
  into actor_role from public.profiles where id = p_actor_id and organization_id = p_organization_id and active;
  select coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end), reports_to
  into target_role, target_reports_to from public.profiles where id = p_target_owner_id and organization_id = p_organization_id and active;

  if actor_role not in ('director','superintendent','manager') then raise exception 'Perfil sem permissão para transferir leads.'; end if;
  if target_role not in ('manager','broker') then raise exception 'O destino deve ser um gerente ou corretor ativo.'; end if;
  if actor_role = 'manager' and (target_role <> 'broker' or target_reports_to is distinct from p_actor_id) then
    raise exception 'Gerentes podem transferir apenas para corretores diretamente subordinados.';
  end if;
  if actor_role = 'superintendent' and not exists (
    with recursive descendants as (
      select id from public.profiles where id = p_actor_id
      union all
      select p.id from public.profiles p join descendants d on p.reports_to = d.id
      where p.active and p.organization_id = p_organization_id
    ) select 1 from descendants where id = p_target_owner_id
  ) then raise exception 'O destino está fora da hierarquia permitida.'; end if;

  perform 1 from public.leads where organization_id = p_organization_id and id = any(p_lead_ids) order by id for update;
  with recursive descendants as (
    select id from public.profiles where id = p_actor_id
    union all select p.id from public.profiles p join descendants d on p.reports_to = d.id
    where p.active and p.organization_id = p_organization_id
  )
  select count(*) into accessible_count from public.leads l
  where l.organization_id = p_organization_id and l.id = any(p_lead_ids)
    and (actor_role = 'director' or l.assigned_to in (select id from descendants) or (l.assigned_to is null and actor_role = 'superintendent'));
  if accessible_count <> requested_count then raise exception 'Um ou mais leads estão fora do seu escopo ou não existem.'; end if;

  if target_role = 'manager' then
    select array_agg(r.id order by r.open_leads, r.id) into broker_ids from (
      select p.id, count(l.id) filter (where l.status not in ('ganho','perdido','comprou_outro')) as open_leads
      from public.profiles p left join public.leads l on l.assigned_to = p.id and l.organization_id = p_organization_id
      where p.organization_id = p_organization_id and p.reports_to = p_target_owner_id and p.active and coalesce(p.commercial_role, p.role) = 'broker'
      group by p.id
    ) r;
    broker_count := coalesce(array_length(broker_ids, 1), 0);
    if broker_count = 0 then raise exception 'O gerente de destino não possui corretores ativos.'; end if;
  else broker_ids := array[p_target_owner_id]; broker_count := 1; end if;

  insert into public.lead_transfer_batches (organization_id, actor_id, target_owner_id, lead_count, reason)
  values (p_organization_id, p_actor_id, p_target_owner_id, requested_count, trim(p_reason)) returning id into batch_id;
  for lead_row in select id, assigned_to from public.leads where organization_id = p_organization_id and id = any(p_lead_ids) order by id loop
    actual_target := broker_ids[(position % broker_count) + 1]; position := position + 1;
    insert into public.lead_transfer_items (batch_id, lead_id, previous_owner_id, target_owner_id)
    values (batch_id, lead_row.id, lead_row.assigned_to, actual_target);
    update public.leads set assigned_to = actual_target, updated_at = now() where id = lead_row.id and organization_id = p_organization_id;
  end loop;
  return jsonb_build_object('batchId', batch_id, 'transferred', requested_count, 'teamTargetId', case when target_role = 'manager' then p_target_owner_id else null end, 'brokerTargets', broker_ids);
end;
$$;

revoke all on function public.bulk_transfer_leads(uuid, uuid, uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.bulk_transfer_leads(uuid, uuid, uuid[], uuid, text) to service_role;

commit;
