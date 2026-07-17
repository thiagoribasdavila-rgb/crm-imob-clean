begin;

create unique index if not exists approval_one_pending_commercial_proposal_idx
on public.approval_requests (organization_id, entity_id)
where entity_type = 'commercial_simulation' and status = 'pending';

create or replace function public.request_commercial_proposal_review(p_actor_id uuid, p_organization_id uuid, p_simulation_id uuid, p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sim public.commercial_simulations%rowtype; lead_owner uuid; approval_id uuid; actor_allowed boolean; actor_role text;
begin
  select * into sim from public.commercial_simulations where id=p_simulation_id and organization_id=p_organization_id and lead_id=p_lead_id for update;
  if sim.id is null or sim.status <> 'draft' or sim.valid_until < now() then raise exception 'simulation_not_available'; end if;
  select assigned_to into lead_owner from public.leads where id=p_lead_id and organization_id=p_organization_id;
  with recursive team as (select id from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true)
  select exists(select 1 from team where id=lead_owner) into actor_allowed;
  select coalesce(commercial_role,case when role='admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  if actor_role='manager' then select exists(select 1 from public.profiles where id=lead_owner and organization_id=p_organization_id and reports_to=p_actor_id and active=true) into actor_allowed; end if;
  if not actor_allowed then raise exception 'proposal_out_of_scope'; end if;
  if not exists(select 1 from public.properties where id=sim.property_id and organization_id=p_organization_id and lower(status) in ('available','ativo','disponivel','disponível') and price=sim.property_price) then raise exception 'property_changed'; end if;
  if not exists(select 1 from public.developer_payment_flow_rules where id=sim.payment_rule_id and organization_id=p_organization_id and active=true and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date)) then raise exception 'payment_rule_changed'; end if;
  insert into public.approval_requests (organization_id,request_type,entity_type,entity_id,payload,requested_by,expires_at)
  values (p_organization_id,'commercial_proposal','commercial_simulation',sim.id,jsonb_build_object('leadId',sim.lead_id,'propertyId',sim.property_id,'requiresInventoryCheck',true,'requiresPriceCheck',true,'requiresPaymentRuleCheck',true),p_actor_id,sim.valid_until)
  returning id into approval_id;
  update public.commercial_simulations set status='proposal_review',updated_at=now() where id=sim.id;
  return jsonb_build_object('simulationId',sim.id,'approvalId',approval_id,'status','proposal_review');
exception when unique_violation then raise exception 'proposal_already_pending';
end; $$;

create or replace function public.decide_commercial_proposal(p_actor_id uuid,p_organization_id uuid,p_approval_id uuid,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare approval public.approval_requests%rowtype; sim public.commercial_simulations%rowtype; lead_row public.leads%rowtype; actor_role text; actor_allowed boolean;
begin
  if p_decision not in ('approved','rejected') then raise exception 'proposal_decision_invalid'; end if;
  if p_decision='rejected' and char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'proposal_rejection_reason_required'; end if;
  select coalesce(commercial_role,case when role='admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  if actor_role not in ('director','superintendent','manager') then raise exception 'proposal_approval_forbidden'; end if;
  select * into approval from public.approval_requests where id=p_approval_id and organization_id=p_organization_id and entity_type='commercial_simulation' and status='pending' for update;
  if approval.id is null then raise exception 'proposal_not_pending'; end if;
  select * into sim from public.commercial_simulations where id=approval.entity_id and organization_id=p_organization_id for update;
  select * into lead_row from public.leads where id=sim.lead_id and organization_id=p_organization_id for update;
  with recursive team as (select id from public.profiles where reports_to=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true)
  select actor_role='director' or exists(select 1 from team where id=lead_row.assigned_to) into actor_allowed;
  if actor_role='manager' then select exists(select 1 from public.profiles where id=lead_row.assigned_to and organization_id=p_organization_id and reports_to=p_actor_id and active=true) into actor_allowed; end if;
  if not actor_allowed then raise exception 'proposal_out_of_scope'; end if;
  if p_decision='approved' then
    if sim.valid_until<now() then raise exception 'simulation_expired'; end if;
    if not exists(select 1 from public.properties where id=sim.property_id and organization_id=p_organization_id and lower(status) in ('available','ativo','disponivel','disponível') and price=sim.property_price) then raise exception 'property_changed'; end if;
    if not exists(select 1 from public.developer_payment_flow_rules where id=sim.payment_rule_id and organization_id=p_organization_id and active=true and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date)) then raise exception 'payment_rule_changed'; end if;
  end if;
  update public.approval_requests set status=p_decision,decision_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),decided_by=p_actor_id,decided_at=now() where id=approval.id;
  update public.commercial_simulations set status=p_decision,updated_at=now() where id=sim.id;
  if p_decision='approved' then update public.leads set status='proposta',updated_at=now() where id=lead_row.id; end if;
  insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata,occurred_at) values(p_organization_id,lead_row.id,p_actor_id,'commercial_proposal_decision',case when p_decision='approved' then 'Proposta comercial aprovada' else 'Proposta comercial devolvida' end,coalesce(nullif(trim(p_reason),''),case when p_decision='approved' then 'Preço, estoque e regra reconfirmados pela gestão.' else 'Requer ajuste antes do envio ao cliente.' end),jsonb_build_object('simulationId',sim.id,'approvalId',approval.id,'decision',p_decision),now());
  return jsonb_build_object('id',approval.id,'status',p_decision,'simulationId',sim.id,'leadId',lead_row.id,'previousStage',lead_row.status,'decidedAt',now());
end; $$;

revoke all on function public.request_commercial_proposal_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.decide_commercial_proposal(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_commercial_proposal_review(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.decide_commercial_proposal(uuid,uuid,uuid,text,text) to service_role;
commit;
