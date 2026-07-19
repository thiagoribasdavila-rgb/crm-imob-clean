begin;

create or replace function public.decide_message_approval(
  p_actor_id uuid, p_organization_id uuid, p_approval_id uuid, p_decision text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; current_approval public.approval_requests%rowtype; message_row record; outbox_id uuid;
begin
  if p_decision not in ('approved','rejected') then raise exception 'approval_decision_invalid'; end if;
  if p_decision = 'rejected' and char_length(trim(coalesce(p_reason,''))) < 5 then raise exception 'approval_rejection_reason_required'; end if;
  select coalesce(commercial_role, case when role = 'admin' then 'director' else role end) into actor_role from public.profiles where id = p_actor_id and organization_id = p_organization_id and active = true;
  if actor_role not in ('director','superintendent','manager') then raise exception 'approval_forbidden'; end if;
  select * into current_approval from public.approval_requests where id = p_approval_id and organization_id = p_organization_id and status = 'pending' and entity_type = 'message' for update;
  if current_approval.id is null then raise exception 'approval_not_pending'; end if;
  select m.id, m.channel, coalesce(c.assigned_to, l.assigned_to) as broker_id into message_row from public.messages m join public.conversations c on c.id = m.conversation_id left join public.leads l on l.id = c.lead_id where m.id = current_approval.entity_id and m.organization_id = p_organization_id and c.organization_id = p_organization_id;
  if message_row.id is null then raise exception 'approval_message_not_found'; end if;
  if actor_role = 'manager' and not exists (select 1 from public.profiles where id = message_row.broker_id and organization_id = p_organization_id and reports_to = p_actor_id and active = true) then raise exception 'approval_out_of_scope'; end if;
  if actor_role = 'superintendent' and not exists (with recursive team as (select id from public.profiles where reports_to = p_actor_id and organization_id = p_organization_id and active = true union all select p.id from public.profiles p join team t on p.reports_to = t.id where p.organization_id = p_organization_id and p.active = true) select 1 from team where id = message_row.broker_id) then raise exception 'approval_out_of_scope'; end if;
  update public.approval_requests set status = p_decision, decision_reason = nullif(left(trim(coalesce(p_reason,'')),500),''), decided_by = p_actor_id, decided_at = now() where id = current_approval.id;
  if p_decision = 'approved' then
    insert into public.integration_outbox (organization_id, topic, aggregate_type, aggregate_id, payload) values (p_organization_id, 'message.send', 'message', message_row.id, jsonb_build_object('messageId',message_row.id,'channel',message_row.channel,'approvalId',current_approval.id)) returning id into outbox_id;
  else
    update public.messages set status = 'failed', error = left(trim(p_reason),500) where id = message_row.id and organization_id = p_organization_id;
  end if;
  return jsonb_build_object('approvalId',current_approval.id,'status',p_decision,'outboxId',outbox_id,'queued',p_decision='approved');
end; $$;

revoke all on function public.decide_message_approval(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.decide_message_approval(uuid,uuid,uuid,text,text) to service_role;
commit;
