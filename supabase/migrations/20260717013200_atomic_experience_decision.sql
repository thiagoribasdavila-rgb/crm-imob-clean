begin;

create or replace function public.decide_lead_experience_signal(
  p_actor_id uuid,
  p_organization_id uuid,
  p_signal_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  current_signal public.lead_experience_signals%rowtype;
  approval_id uuid;
begin
  if p_decision not in ('keep', 'change_requested') then raise exception 'experience_decision_invalid'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'experience_reason_required'; end if;
  select coalesce(commercial_role, case when role = 'admin' then 'director' else role end) into actor_role
  from public.profiles where id = p_actor_id and organization_id = p_organization_id and active = true;
  if actor_role not in ('director', 'superintendent', 'manager') then raise exception 'experience_decision_forbidden'; end if;

  select * into current_signal from public.lead_experience_signals
  where id = p_signal_id and organization_id = p_organization_id and status = 'pending'
  for update;
  if current_signal.id is null then raise exception 'experience_signal_not_pending'; end if;
  if current_signal.broker_id is null then raise exception 'experience_signal_without_broker'; end if;

  if actor_role = 'manager' and not exists (
    select 1 from public.profiles where id = current_signal.broker_id and organization_id = p_organization_id and reports_to = p_actor_id and active = true
  ) then raise exception 'experience_signal_out_of_scope'; end if;
  if actor_role = 'superintendent' and not exists (
    with recursive team as (
      select id from public.profiles where reports_to = p_actor_id and organization_id = p_organization_id and active = true
      union all
      select p.id from public.profiles p join team t on p.reports_to = t.id where p.organization_id = p_organization_id and p.active = true
    ) select 1 from team where id = current_signal.broker_id
  ) then raise exception 'experience_signal_out_of_scope'; end if;

  update public.lead_experience_signals set status = p_decision, decision_by = p_actor_id,
    decision_reason = left(trim(p_reason), 500), decided_at = now()
  where id = current_signal.id;

  if p_decision = 'change_requested' then
    insert into public.approval_requests (organization_id, request_type, entity_type, entity_id, payload, requested_by)
    values (p_organization_id, 'lead_broker_change', 'lead_experience_signal', current_signal.id,
      jsonb_build_object('leadId', current_signal.lead_id, 'currentBrokerId', current_signal.broker_id, 'recommendation', current_signal.recommendation, 'humanDecisionReason', left(trim(p_reason), 500)), p_actor_id)
    returning id into approval_id;
  end if;
  return jsonb_build_object('signalId', current_signal.id, 'decision', p_decision, 'approvalId', approval_id, 'leadReassigned', false);
end;
$$;

revoke all on function public.decide_lead_experience_signal(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_lead_experience_signal(uuid, uuid, uuid, text, text) to service_role;

commit;
