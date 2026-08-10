-- Reconcile functions deployed with pre-canonical CRM column contracts.
-- Safe/idempotent: function bodies only; no data or table mutation.
begin;

CREATE OR REPLACE FUNCTION "public"."register_whatsapp_opt_out"("p_organization_id" "uuid", "p_recipient" "text", "p_source" "text", "p_external_message_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare normalized text; blocked_messages integer:=0; cancelled_approvals integer:=0; blocked_events integer:=0; lead_ref uuid;
begin
  normalized:=regexp_replace(coalesce(p_recipient,''),'\D','','g');
  if length(normalized)<10 then raise exception 'invalid_opt_out_recipient'; end if;
  insert into public.messaging_suppressions(organization_id,channel,recipient,reason,source) values(p_organization_id,'whatsapp',normalized,'opt_out',left(coalesce(p_source,'customer_request'),80)) on conflict(organization_id,channel,recipient) do update set reason='opt_out',source=excluded.source;
  select c.lead_id into lead_ref from public.conversations c where c.organization_id=p_organization_id and c.channel='whatsapp' and c.external_thread_id=normalized order by c.updated_at desc limit 1;
  with blocked as (update public.messages set status='failed',error='Contato bloqueado por opt-out.' where organization_id=p_organization_id and channel='whatsapp' and recipient=normalized and direction='outbound' and status='queued' returning id)
  select count(*) into blocked_messages from blocked;
  with cancelled as (update public.approval_requests set status='cancelled',decision_reason='Cancelada automaticamente por opt-out.',decided_at=now() where organization_id=p_organization_id and entity_type='message' and status='pending' and entity_id in(select id from public.messages where organization_id=p_organization_id and channel='whatsapp' and recipient=normalized) returning id)
  select count(*) into cancelled_approvals from cancelled;
  with stopped as (update public.integration_outbox set status='blocked',last_error='Bloqueado imediatamente por opt-out.',delivered_at=now(),locked_at=null,locked_by=null where organization_id=p_organization_id and topic='message.send' and status in ('pending','failed') and aggregate_id in(select id from public.messages where organization_id=p_organization_id and channel='whatsapp' and recipient=normalized) returning id)
  select count(*) into blocked_events from stopped;
  update public.lead_reactivation_contacts set status='blocked',block_reason='opt_out' where organization_id=p_organization_id and phone=normalized and status in ('pending_approval','queued','sent');
  update public.ai_sales_journeys set status='opted_out',next_run_at=null,updated_at=now() where organization_id=p_organization_id and lead_id=lead_ref and status not in ('completed','opted_out');
  if lead_ref is not null then
    insert into public.activities(organization_id,lead_id,type,description,metadata,occurred_at) values(p_organization_id,lead_ref,'whatsapp_opt_out','Cliente solicitou interrupção de mensagens. Novos envios por WhatsApp foram bloqueados imediatamente.',jsonb_build_object('title','Cliente solicitou interrupção de mensagens','source',p_source,'externalMessageId',p_external_message_id,'blockedMessages',blocked_messages),now());
  end if;
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id) values(p_organization_id,'messaging.opt_out','whatsapp','lead',lead_ref,jsonb_build_object('channel','whatsapp','blockedMessages',blocked_messages,'cancelledApprovals',cancelled_approvals,'blockedEvents',blocked_events),nullif(p_external_message_id,''));
  return jsonb_build_object('suppressed',true,'blockedMessages',blocked_messages,'cancelledApprovals',cancelled_approvals,'blockedEvents',blocked_events,'leadId',lead_ref);
end; $$;

CREATE OR REPLACE FUNCTION "public"."route_nightly_journey_reply"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_message_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare journey public.ai_sales_journeys%rowtype; lead_owner uuid; current_stage text;
begin
  select j.* into journey from public.ai_sales_journeys j where j.organization_id=p_organization_id and j.conversation_id=p_conversation_id for update;
  if journey.id is null then return jsonb_build_object('routed',false,'reason','not_nightly_journey'); end if;
  if journey.status in ('opted_out','completed','paused') then return jsonb_build_object('routed',false,'reason',journey.status); end if;
  select assigned_to into lead_owner from public.leads where id=journey.lead_id and organization_id=p_organization_id for update;
  if lead_owner is null or lead_owner<>journey.broker_id then raise exception 'nightly_journey_owner_mismatch'; end if;
  update public.conversations set assigned_to=lead_owner,status='open',unread_count=greatest(unread_count,1),updated_at=now() where id=p_conversation_id and organization_id=p_organization_id;
  current_stage:=case when journey.stage='approach' then 'discovery' else journey.stage end;
  update public.ai_sales_journeys set broker_id=lead_owner,stage=current_stage,status='waiting_broker',last_message_id=p_message_id,next_run_at=null,updated_at=now() where id=journey.id;
  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at) values(p_organization_id,journey.lead_id,lead_owner,'nightly_journey_reply','Lead respondeu à abordagem noturna. Resposta direcionada ao corretor exclusivo. Próxima ação: abrir a conversa e continuar a descoberta.',jsonb_build_object('title','Lead respondeu à abordagem noturna','journeyId',journey.id,'conversationId',p_conversation_id,'messageId',p_message_id,'stage',current_stage,'status','waiting_broker'),now());
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id) values(p_organization_id,'nightly_journey.customer_replied','whatsapp','lead',journey.lead_id,jsonb_build_object('brokerId',lead_owner,'journeyId',journey.id,'stage',current_stage,'nextAction','broker_reply'),p_message_id::text);
  return jsonb_build_object('routed',true,'journeyId',journey.id,'leadId',journey.lead_id,'brokerId',lead_owner,'stage',current_stage,'status','waiting_broker');
end; $$;

CREATE OR REPLACE FUNCTION "public"."decide_commercial_proposal"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_approval_id" "uuid", "p_decision" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare approval public.approval_requests%rowtype; sim public.commercial_simulations%rowtype; lead_row public.leads%rowtype; actor_role text; actor_allowed boolean; move_id uuid; from_stage text;
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
  if p_decision='approved' then
    from_stage:=coalesce(lead_row.status,'novo');
    update public.leads set status='proposta',updated_at=now() where id=lead_row.id;
    if from_stage<>'proposta' then
      insert into public.pipeline_stage_moves(organization_id,lead_id,actor_id,from_stage,to_stage,reason,occurred_at) values(p_organization_id,lead_row.id,p_actor_id,from_stage,'proposta',coalesce(nullif(trim(p_reason),''),'Proposta comercial aprovada'),now()) returning id into move_id;
      insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) values(p_organization_id,'lead.stage_changed','atlas-v1','lead',lead_row.id,jsonb_build_object('moveId',move_id,'previousStage',from_stage,'stage','proposta','userId',p_actor_id,'via','commercial_proposal_approval'),move_id::text,now());
    end if;
  end if;
  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at) values(p_organization_id,lead_row.id,p_actor_id,'commercial_proposal_decision',concat(case when p_decision='approved' then 'Proposta comercial aprovada. ' else 'Proposta comercial devolvida. ' end,coalesce(nullif(trim(p_reason),''),case when p_decision='approved' then 'Preço, estoque e regra reconfirmados pela gestão.' else 'Requer ajuste antes do envio ao cliente.' end)),jsonb_build_object('title',case when p_decision='approved' then 'Proposta comercial aprovada' else 'Proposta comercial devolvida' end,'simulationId',sim.id,'approvalId',approval.id,'decision',p_decision),now());
  return jsonb_build_object('id',approval.id,'status',p_decision,'simulationId',sim.id,'leadId',lead_row.id,'previousStage',lead_row.status,'decidedAt',now());
end; $$;

CREATE OR REPLACE FUNCTION "public"."transition_commercial_proposal"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_lead_id" "uuid", "p_simulation_id" "uuid", "p_status" "text", "p_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare sim public.commercial_simulations%rowtype; lead_owner uuid; actor_allowed boolean; previous_status text;
begin
  if p_status not in ('sent','accepted','declined','expired') then raise exception 'proposal_transition_invalid'; end if;
  if p_status='declined' and char_length(trim(coalesce(p_note,'')))<5 then raise exception 'proposal_decline_reason_required'; end if;
  select * into sim from public.commercial_simulations where id=p_simulation_id and organization_id=p_organization_id and lead_id=p_lead_id for update;
  if sim.id is null then raise exception 'proposal_not_found'; end if;
  previous_status := sim.status;
  select assigned_to into lead_owner from public.leads where id=p_lead_id and organization_id=p_organization_id;
  with recursive team as (select id from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true)
  select exists(select 1 from team where id=lead_owner) into actor_allowed;
  if not actor_allowed then raise exception 'proposal_out_of_scope'; end if;
  if p_status='sent' and (sim.status<>'approved' or sim.valid_until<now()) then raise exception 'proposal_not_sendable'; end if;
  if p_status in ('accepted','declined') and sim.status<>'sent' then raise exception 'proposal_response_invalid'; end if;
  if p_status='expired' and (sim.status not in ('approved','sent') or sim.valid_until>=now()) then raise exception 'proposal_not_expired'; end if;
  update public.commercial_simulations set status=p_status,response_note=case when p_status in ('accepted','declined') then nullif(left(trim(coalesce(p_note,'')),1000),'') else response_note end where id=sim.id;
  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)
  values(p_organization_id,p_lead_id,p_actor_id,'commercial_proposal_lifecycle',concat(case p_status when 'sent' then 'Proposta enviada ao cliente. ' when 'accepted' then 'Proposta aceita pelo cliente. ' when 'declined' then 'Proposta recusada pelo cliente. ' else 'Proposta vencida. ' end,coalesce(nullif(left(trim(coalesce(p_note,'')),900),''),'Ciclo comercial atualizado com rastreabilidade.')),jsonb_build_object('title',case p_status when 'sent' then 'Proposta enviada ao cliente' when 'accepted' then 'Proposta aceita pelo cliente' when 'declined' then 'Proposta recusada pelo cliente' else 'Proposta vencida' end,'simulationId',sim.id,'from',previous_status,'to',p_status),now());
  if p_status='sent' then update public.leads set next_action_at=least(sim.valid_until,now()+interval '24 hours'),updated_at=now() where id=p_lead_id and organization_id=p_organization_id;
  elsif p_status in ('accepted','declined','expired') then update public.leads set next_action_at=null,updated_at=now() where id=p_lead_id and organization_id=p_organization_id; end if;
  return jsonb_build_object('id',sim.id,'previousStatus',previous_status,'status',p_status,'validUntil',sim.valid_until,'occurredAt',now());
end $$;

CREATE OR REPLACE FUNCTION "public"."create_recurring_task"("p_actor" "uuid", "p_organization" "uuid", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text", "p_lead_id" "uuid", "p_assigned_to" "uuid", "p_cadence" "text", "p_ends_at" timestamp with time zone, "p_max" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare recurrence_id uuid;task_id uuid;next_at timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_actor and organization_id=p_organization and active=true) then raise exception 'recurrence_actor_invalid';end if;
  if p_cadence not in('daily','weekly','monthly') or p_max not between 2 and 100 or p_due_at<=now() or p_ends_at<=p_due_at then raise exception 'recurrence_rule_invalid';end if;
  if not exists(select 1 from public.profiles where id=p_assigned_to and organization_id=p_organization and active=true) then raise exception 'recurrence_assignee_invalid';end if;
  if p_lead_id is not null and not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization and assigned_to=p_assigned_to) then raise exception 'recurrence_lead_owner_invalid';end if;
  next_at:=case p_cadence when 'daily' then p_due_at+interval '1 day' when 'weekly' then p_due_at+interval '1 week' else p_due_at+interval '1 month' end;
  if next_at>p_ends_at then raise exception 'recurrence_without_next_occurrence';end if;
  insert into public.task_recurrences(organization_id,title,description,priority,lead_id,assigned_to,cadence,next_run_at,ends_at,max_occurrences,created_by) values(p_organization,left(trim(p_title),120),nullif(left(trim(coalesce(p_description,'')),2000),''),p_priority,p_lead_id,p_assigned_to,p_cadence,next_at,p_ends_at,p_max,p_actor) returning id into recurrence_id;
  insert into public.tasks(organization_id,title,description,due_date,priority,status,lead_id,user_id,recurrence_id,recurrence_occurrence) values(p_organization,left(trim(p_title),120),nullif(left(trim(coalesce(p_description,'')),2000),''),p_due_at,p_priority,'pendente',p_lead_id,p_assigned_to,recurrence_id,1) returning id into task_id;
  return jsonb_build_object('taskId',task_id,'recurrenceId',recurrence_id,'nextRunAt',next_at);
end $$;

CREATE OR REPLACE FUNCTION "public"."process_due_task_recurrences"("p_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare row public.task_recurrences%rowtype;generated integer:=0;next_at timestamptz;effective_assignee uuid;
begin
  for row in select * from public.task_recurrences where active=true and next_run_at<=now() order by next_run_at limit least(greatest(p_limit,1),500) for update skip locked loop
    effective_assignee:=row.assigned_to;if row.lead_id is not null then select assigned_to into effective_assignee from public.leads where id=row.lead_id and organization_id=row.organization_id;if effective_assignee is null then update public.task_recurrences set active=false,updated_at=now() where id=row.id;continue;end if;end if;
    insert into public.tasks(organization_id,title,description,due_date,priority,status,lead_id,user_id,recurrence_id,recurrence_occurrence) values(row.organization_id,row.title,row.description,row.next_run_at,row.priority,'pendente',row.lead_id,effective_assignee,row.id,row.occurrences+1) on conflict(recurrence_id,recurrence_occurrence) where recurrence_id is not null do nothing;
    if found then generated:=generated+1;end if;
    next_at:=case row.cadence when 'daily' then row.next_run_at+interval '1 day' when 'weekly' then row.next_run_at+interval '1 week' else row.next_run_at+interval '1 month' end;
    update public.task_recurrences set assigned_to=effective_assignee,occurrences=occurrences+1,next_run_at=next_at,active=not(occurrences+1>=max_occurrences or next_at>ends_at),updated_at=now() where id=row.id;
  end loop;
  return jsonb_build_object('generated',generated);
end $$;

CREATE OR REPLACE FUNCTION "public"."transfer_single_lead"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_lead_id" "uuid", "p_expected_owner_id" "uuid", "p_target_owner_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor_role text;target_role text;lead_row public.leads%rowtype;batch_id uuid;
begin
 if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'transfer_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 select coalesce(commercial_role,role) into target_role from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent','manager') or target_role not in('broker','manager') then raise exception 'transfer_role_forbidden';end if;
 if target_role='manager' and actor_role not in('director','superintendent') then raise exception 'transfer_manager_target_forbidden';end if;
 select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;if lead_row.id is null then raise exception 'transfer_lead_not_found';end if;
 if lead_row.assigned_to is distinct from p_expected_owner_id then raise exception 'transfer_owner_conflict';end if;if lead_row.assigned_to=p_target_owner_id then raise exception 'transfer_same_owner';end if;
 if actor_role<>'director' and not exists(with recursive descendants as(select id from public.profiles where id=p_actor_id and organization_id=p_organization_id union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id and p.active=true)select 1 where p_target_owner_id in(select id from descendants) and lead_row.assigned_to in(select id from descendants)) then raise exception 'transfer_hierarchy_forbidden';end if;
 if actor_role='manager' and not exists(select 1 from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'transfer_direct_team_required';end if;
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,p_target_owner_id,1,trim(p_reason))returning id into batch_id;
 insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,p_lead_id,lead_row.assigned_to,p_target_owner_id);
 update public.leads set assigned_to=p_target_owner_id,updated_at=now() where id=p_lead_id and organization_id=p_organization_id and assigned_to is not distinct from p_expected_owner_id;
 update public.tasks set user_id=p_target_owner_id where organization_id=p_organization_id and lead_id=p_lead_id and status not in('concluida','completed','cancelado','cancelled');
 insert into public.activities(organization_id,lead_id,user_id,description,type,metadata,occurred_at)values(p_organization_id,p_lead_id,p_actor_id,concat('Responsável transferido. ',left(trim(p_reason),450)),'system',jsonb_build_object('title','Responsável transferido'),now());
 return jsonb_build_object('batchId',batch_id,'leadId',p_lead_id,'previousOwnerId',lead_row.assigned_to,'targetOwnerId',p_target_owner_id,'targetRole',target_role,'singleOwnerPreserved',true,'openTasksRealigned',true,'auditable',true);
end $$;

CREATE OR REPLACE FUNCTION "public"."transfer_leads_to_team"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_lead_ids" "uuid"[], "p_target_manager_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare actor_role text;requested integer;accessible integer;batch_id uuid;lead_row record;target_broker uuid;target_load integer;target_weight integer;transferred integer:=0;assignments jsonb:='[]'::jsonb;
begin
 requested:=coalesce(array_length(p_lead_ids,1),0);if requested<1 or requested>200 then raise exception 'team_transfer_limit_invalid';end if;if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'team_transfer_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent') then raise exception 'team_transfer_actor_forbidden';end if;
 if not exists(select 1 from public.profiles where id=p_target_manager_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,role)='manager') then raise exception 'team_transfer_manager_invalid';end if;
 if actor_role='superintendent' and not exists(select 1 from public.profiles where id=p_target_manager_id and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'team_transfer_manager_out_of_scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_target_manager_id::text,0));
 perform 1 from public.leads where organization_id=p_organization_id and id=any(p_lead_ids) order by id for update;
 with recursive descendants as(select id from public.profiles where id=p_actor_id and organization_id=p_organization_id union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id and p.active=true)select count(*) into accessible from public.leads l where l.organization_id=p_organization_id and l.id=any(p_lead_ids) and(actor_role='director' or l.assigned_to in(select id from descendants));if accessible<>requested then raise exception 'team_transfer_lead_out_of_scope';end if;
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,p_target_manager_id,requested,trim(p_reason))returning id into batch_id;
 for lead_row in select id,assigned_to,development_id from public.leads where organization_id=p_organization_id and id=any(p_lead_ids) order by id loop
  select p.id,count(l.id)::integer,coalesce(m.weight,1) into target_broker,target_load,target_weight from public.profiles p left join public.project_distribution_members m on m.profile_id=p.id and m.development_id=lead_row.development_id left join public.leads l on l.organization_id=p_organization_id and l.assigned_to=p.id and l.development_id is not distinct from lead_row.development_id where p.organization_id=p_organization_id and p.reports_to=p_target_manager_id and p.active=true and coalesce(p.commercial_role,p.role)='broker' and coalesce(m.enabled,true) group by p.id,m.weight,m.last_assigned_at order by(count(l.id)::numeric/coalesce(m.weight,1)),m.last_assigned_at nulls first,p.id limit 1;
  if target_broker is null then raise exception 'team_transfer_no_eligible_broker';end if;
  insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,lead_row.id,lead_row.assigned_to,target_broker);
  update public.leads set assigned_to=target_broker,updated_at=now() where id=lead_row.id and organization_id=p_organization_id;
  update public.tasks set user_id=target_broker where organization_id=p_organization_id and lead_id=lead_row.id and coalesce(status,'pendente') not in('concluida','completed','cancelado','cancelled');
  insert into public.activities(organization_id,lead_id,user_id,description,type,metadata,occurred_at)values(p_organization_id,lead_row.id,p_actor_id,concat('Lead transferida entre equipes. ',left(trim(p_reason),450)),'system',jsonb_build_object('title','Lead transferida entre equipes'),now());
  insert into public.project_distribution_members(organization_id,development_id,profile_id,assignments_count,last_assigned_at,updated_at)select p_organization_id,lead_row.development_id,target_broker,1,now(),now() where lead_row.development_id is not null on conflict(development_id,profile_id)do update set assignments_count=public.project_distribution_members.assignments_count+1,last_assigned_at=excluded.last_assigned_at,updated_at=excluded.updated_at;
  assignments:=assignments||jsonb_build_array(jsonb_build_object('leadId',lead_row.id,'brokerId',target_broker,'projectId',lead_row.development_id,'projectLoadBefore',target_load,'weight',target_weight,'reason','Menor carga ponderada no projeto dentro da equipe escolhida.'));transferred:=transferred+1;
 end loop;
 return jsonb_build_object('batchId',batch_id,'transferred',transferred,'teamTargetId',p_target_manager_id,'assignments',assignments,'managerOwnsLeads',false,'singleBrokerOwner',true,'openTasksRealigned',true,'auditable',true);
end $$;

CREATE OR REPLACE FUNCTION "public"."redistribute_absent_broker_leads"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_broker_id" "uuid", "p_ends_at" timestamp with time zone, "p_reason" "text", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare actor_role text;v_manager_id uuid;requested integer;batch_id uuid;absence_id uuid;lead_row record;target_broker uuid;target_load integer;target_weight integer;transferred integer:=0;assignments jsonb:='[]'::jsonb;
begin
 if p_limit<1 or p_limit>200 then raise exception 'absence_transfer_limit_invalid';end if;if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'absence_reason_invalid';end if;if p_ends_at<=now() or p_ends_at>now()+interval '90 days' then raise exception 'absence_period_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent','manager') then raise exception 'absence_actor_forbidden';end if;
 select reports_to into v_manager_id from public.profiles where id=p_broker_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,role)='broker';if v_manager_id is null then raise exception 'absence_broker_invalid';end if;
 if actor_role='manager' and v_manager_id<>p_actor_id then raise exception 'absence_broker_out_of_scope';end if;
 if actor_role='superintendent' and not exists(select 1 from public.profiles m where m.id=v_manager_id and m.organization_id=p_organization_id and m.reports_to=p_actor_id and m.active=true) then raise exception 'absence_broker_out_of_scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_broker_id::text,0));
 insert into public.broker_absence_events(organization_id,broker_id,manager_id,actor_id,ends_at,reason)values(p_organization_id,p_broker_id,v_manager_id,p_actor_id,p_ends_at,trim(p_reason))returning id into absence_id;
 update public.commercial_presence set availability='offline',updated_at=now() where profile_id=p_broker_id and organization_id=p_organization_id;
 select count(*) into requested from public.leads where organization_id=p_organization_id and assigned_to=p_broker_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado');requested:=least(requested,p_limit);
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,v_manager_id,requested,trim(p_reason))returning id into batch_id;
 for lead_row in select id,development_id from public.leads where organization_id=p_organization_id and assigned_to=p_broker_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado') order by updated_at,id for update skip locked limit p_limit loop
  select p.id,count(l.id)::integer,coalesce(m.weight,1) into target_broker,target_load,target_weight from public.profiles p join public.commercial_presence cp on cp.profile_id=p.id and cp.organization_id=p_organization_id and cp.availability='available' and cp.last_seen_at>=now()-interval '90 seconds' left join public.project_distribution_members m on m.profile_id=p.id and m.development_id=lead_row.development_id left join public.leads l on l.organization_id=p_organization_id and l.assigned_to=p.id and l.development_id is not distinct from lead_row.development_id where p.organization_id=p_organization_id and p.reports_to=v_manager_id and p.id<>p_broker_id and p.active=true and coalesce(p.commercial_role,p.role)='broker' and coalesce(m.enabled,true) group by p.id,m.weight,m.last_assigned_at order by(count(l.id)::numeric/coalesce(m.weight,1)),m.last_assigned_at nulls first,p.id limit 1;
  if target_broker is null then raise exception 'absence_no_eligible_replacement';end if;
  insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,lead_row.id,p_broker_id,target_broker);
  update public.leads set assigned_to=target_broker,updated_at=now() where id=lead_row.id and organization_id=p_organization_id and assigned_to=p_broker_id;
  update public.tasks set user_id=target_broker where organization_id=p_organization_id and lead_id=lead_row.id and coalesce(status,'pendente') not in('concluida','completed','cancelado','cancelled');
  insert into public.activities(organization_id,lead_id,user_id,description,type,metadata,occurred_at)values(p_organization_id,lead_row.id,p_actor_id,concat('Cobertura por ausência do corretor. ',left(trim(p_reason),440)),'system',jsonb_build_object('title','Cobertura por ausência do corretor'),now());
  insert into public.project_distribution_members(organization_id,development_id,profile_id,assignments_count,last_assigned_at,updated_at)select p_organization_id,lead_row.development_id,target_broker,1,now(),now() where lead_row.development_id is not null on conflict(development_id,profile_id)do update set assignments_count=public.project_distribution_members.assignments_count+1,last_assigned_at=excluded.last_assigned_at,updated_at=excluded.updated_at;
  assignments:=assignments||jsonb_build_array(jsonb_build_object('leadId',lead_row.id,'brokerId',target_broker,'projectId',lead_row.development_id,'projectLoadBefore',target_load,'weight',target_weight));transferred:=transferred+1;
 end loop;
 update public.broker_absence_events set transferred_count=transferred,assignment_snapshot=assignments where id=absence_id;
 return jsonb_build_object('absenceId',absence_id,'batchId',batch_id,'transferred',transferred,'endsAt',p_ends_at,'assignments',assignments,'sameTeam',true,'activePortfolioOnly',true,'singleBrokerOwner',true,'managerOwnsLeads',false,'humanApproval',true,'auditable',true);
end $$;

CREATE OR REPLACE FUNCTION "public"."accept_lead_assignment"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_lead_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare reservation record;
begin select * into reservation from public.lead_assignment_reservations where organization_id=p_organization_id and lead_id=p_lead_id and broker_id=p_actor_id and status='pending' order by created_at desc for update limit 1;if reservation.id is null then raise exception 'reservation_not_found';end if;if reservation.expires_at<=now() then raise exception 'reservation_expired';end if;if not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id and assigned_to=p_actor_id) then raise exception 'reservation_owner_changed';end if;update public.lead_assignment_reservations set status='accepted',accepted_at=now() where id=reservation.id;insert into public.activities(organization_id,lead_id,user_id,description,type,metadata,occurred_at)values(p_organization_id,p_lead_id,p_actor_id,'Lead aceita pelo corretor. Aceite registrado dentro do prazo da distribuição.','system',jsonb_build_object('title','Lead aceita pelo corretor'),now());return jsonb_build_object('reservationId',reservation.id,'leadId',p_lead_id,'accepted',true,'acceptedAt',now(),'singleOwnerPreserved',true);end $$;

CREATE OR REPLACE FUNCTION "public"."process_expired_lead_reservations"("p_limit" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare item record;released integer:=0;protected integer:=0;
begin if p_limit<1 or p_limit>2000 then raise exception 'reservation_worker_limit_invalid';end if;for item in select r.* from public.lead_assignment_reservations r where r.status='pending' and r.expires_at<=now() order by r.expires_at for update skip locked limit p_limit loop if exists(select 1 from public.activities a where a.organization_id=item.organization_id and a.lead_id=item.lead_id and a.occurred_at>=item.reserved_at and a.type<>'system') then update public.lead_assignment_reservations set status='accepted',accepted_at=now(),release_reason='Atendimento iniciado antes da expiração.' where id=item.id;protected:=protected+1;elsif exists(select 1 from public.leads where id=item.lead_id and organization_id=item.organization_id and assigned_to=item.broker_id) then update public.leads set assigned_to=null,updated_at=now() where id=item.lead_id and organization_id=item.organization_id and assigned_to=item.broker_id;update public.tasks set user_id=null where organization_id=item.organization_id and lead_id=item.lead_id and user_id=item.broker_id and coalesce(status,'pendente') not in('concluida','completed','cancelado','cancelled');update public.lead_assignment_reservations set status='expired',released_at=now(),release_reason='Prazo de aceite expirado sem interação.' where id=item.id;insert into public.activities(organization_id,lead_id,user_id,description,type,metadata,occurred_at)values(item.organization_id,item.lead_id,item.broker_id,'Lead devolvida à fila. Prazo de aceite expirou sem interação; responsável removido com segurança.','system',jsonb_build_object('title','Lead devolvida à fila'),now());released:=released+1;else update public.lead_assignment_reservations set status='superseded',released_at=now(),release_reason='Responsável mudou antes do processamento.' where id=item.id;protected:=protected+1;end if;end loop;return jsonb_build_object('released',released,'protected',protected,'processed',released+protected,'customerContacted',false,'singleOwnerPreserved',true);end $$;

CREATE OR REPLACE FUNCTION "public"."create_commercial_release_draft"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_development_id" "uuid", "p_title" "text", "p_price_table_material_id" "uuid", "p_sales_mirror_material_id" "uuid", "p_inventory_import_batch_id" "uuid", "p_payment_rule_id" "uuid", "p_valid_from" timestamp with time zone, "p_valid_until" timestamp with time zone, "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare actor_role text;next_version integer;target public.development_commercial_releases;project_developer_name text;
begin select coalesce(commercial_role,case role when'admin'then'director'else role end)into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;if actor_role not in('director','superintendent')then raise exception 'commercial_release_actor_forbidden';end if;if char_length(trim(coalesce(p_title,'')))<3 or p_valid_from is null or p_valid_until is not null and p_valid_until<=p_valid_from then raise exception 'commercial_release_validity_invalid';end if;select d.developer_name into project_developer_name from public.developments d where d.id=p_development_id and d.organization_id=p_organization_id;if project_developer_name is null then raise exception 'commercial_release_development_invalid';end if;if not exists(select 1 from public.project_materials m where m.id=p_price_table_material_id and m.organization_id=p_organization_id and m.development_id=p_development_id and m.material_type='price_table'and(m.valid_from is null or m.valid_from<=p_valid_from::date)and(m.valid_until is null or(p_valid_until is not null and m.valid_until>=p_valid_until::date)))then raise exception 'commercial_release_price_table_invalid';end if;if p_sales_mirror_material_id is not null and not exists(select 1 from public.project_materials m where m.id=p_sales_mirror_material_id and m.organization_id=p_organization_id and m.development_id=p_development_id and m.material_type='sales_mirror'and(m.valid_from is null or m.valid_from<=p_valid_from::date)and(m.valid_until is null or(p_valid_until is not null and m.valid_until>=p_valid_until::date)))then raise exception 'commercial_release_mirror_invalid';end if;if p_inventory_import_batch_id is not null and not exists(select 1 from public.inventory_import_batches where id=p_inventory_import_batch_id and organization_id=p_organization_id and development_id=p_development_id and status='applied')then raise exception 'commercial_release_import_invalid';end if;if not exists(select 1 from public.developer_payment_flow_rules r where r.id=p_payment_rule_id and r.organization_id=p_organization_id and lower(trim(r.developer_name))=lower(trim(project_developer_name))and(r.valid_from is null or r.valid_from<=p_valid_from::date)and(r.valid_until is null or(p_valid_until is not null and r.valid_until>=p_valid_until::date)))then raise exception 'commercial_release_payment_rule_invalid';end if;perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_development_id::text,0));select coalesce(max(version),0)+1 into next_version from public.development_commercial_releases where organization_id=p_organization_id and development_id=p_development_id;
 insert into public.development_commercial_releases(organization_id,development_id,version,title,price_table_material_id,sales_mirror_material_id,inventory_import_batch_id,payment_rule_id,valid_from,valid_until,notes,created_by)values(p_organization_id,p_development_id,next_version,trim(p_title),p_price_table_material_id,p_sales_mirror_material_id,p_inventory_import_batch_id,p_payment_rule_id,p_valid_from,p_valid_until,nullif(trim(p_notes),''),p_actor_id)returning * into target;insert into public.commercial_release_events(organization_id,development_id,release_id,actor_id,event_type,reason)values(p_organization_id,p_development_id,target.id,p_actor_id,'created','Rascunho comercial criado para revisão');return jsonb_build_object('release',to_jsonb(target),'singleActiveRelease',true,'snapshotRequired',true,'auditable',true);end $$;

CREATE OR REPLACE FUNCTION "public"."snapshot_conversion_cohort"("p_actor_id" "uuid", "p_organization_id" "uuid", "p_horizon_days" integer DEFAULT 90) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$declare actor_role text;cutoff timestamptz:=date_trunc('minute',now());inserted integer:=0;examples integer:=0;positives integer:=0;negatives integer:=0;dataset_version integer;dataset_id uuid;
begin select coalesce(commercial_role,case role when'admin'then'director'else role end)into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;if actor_role not in('director','superintendent')then raise exception 'conversion_dataset_actor_forbidden';end if;if p_horizon_days not in(30,60,90,180)then raise exception 'conversion_dataset_horizon_invalid';end if;
  insert into public.conversion_feature_snapshots(organization_id,lead_id,feature_cutoff_at,horizon_days,features,predicted_probability,model_version,input_hash,created_by)
  select l.organization_id,l.id,cutoff,p_horizon_days,jsonb_build_object('stage',lower(coalesce(l.status,'novo')),'score',greatest(0,least(100,coalesce(l.score,0))),'dataQualityPercent',greatest(0,least(100,coalesce(l.data_quality_percent,0))),'engagementCount',coalesce(ev.engagement,0),'visitCount',coalesce(ev.visits,0),'proposalCount',coalesce(ev.proposals,0),'positiveSignalCount',coalesce(ev.positive,0),'negativeSignalCount',coalesce(ev.negative,0),'leadAgeDays',greatest(0,floor(extract(epoch from(cutoff-l.created_at))/86400)::integer)),greatest(1,least(95,10+coalesce(l.score,0)*.55+case lower(coalesce(l.status,'novo'))when'contato'then 4 when'qualificacao'then 12 when'visita'then 20 when'proposta'then 30 when'contrato'then 42 else 0 end)), 'atlas-baseline-v1',encode(extensions.digest(concat_ws('|',l.id::text,cutoff::text,coalesce(l.status,''),coalesce(l.score,0)::text,coalesce(ev.total,0)::text),'sha256'),'hex'),p_actor_id
  from public.leads l left join lateral(select count(*) total,count(*)filter(where event_category='engagement')engagement,count(*)filter(where event_category='visit')visits,count(*)filter(where event_category='proposal')proposals,count(*)filter(where direction='positive')positive,count(*)filter(where direction='negative')negative from public.lead_behavior_events e where e.organization_id=l.organization_id and e.lead_id=l.id and e.occurred_at<=cutoff)ev on true
  where l.organization_id=p_organization_id and lower(coalesce(l.status,'novo'))not in('ganho','won','vendido','perdido','lost','comprou_outro','arquivado','archived','descartado','discarded')and not exists(select 1 from public.conversion_outcome_labels o where o.organization_id=l.organization_id and o.lead_id=l.id and o.outcome_at<=cutoff)
  on conflict(organization_id,lead_id,feature_cutoff_at,model_version)do nothing;get diagnostics inserted=row_count;
  select count(*),count(*)filter(where o.label_value=1),count(*)filter(where o.label_value=0)into examples,positives,negatives from public.conversion_feature_snapshots s join lateral(select label_value,outcome_at from public.conversion_outcome_labels x where x.organization_id=s.organization_id and x.lead_id=s.lead_id and x.outcome_at>s.feature_cutoff_at and x.outcome_at<=s.feature_cutoff_at+make_interval(days=>s.horizon_days)order by x.outcome_at limit 1)o on true where s.organization_id=p_organization_id;
  perform pg_advisory_xact_lock(hashtextextended('conversion-dataset:'||p_organization_id::text,0));select coalesce(max(version),0)+1 into dataset_version from public.conversion_dataset_versions where organization_id=p_organization_id;
  insert into public.conversion_dataset_versions(organization_id,version,cutoff_at,horizon_days,feature_schema_version,label_schema_version,example_count,positive_count,negative_count,status,created_by)values(p_organization_id,dataset_version,cutoff,p_horizon_days,1,1,examples,positives,negatives,case when examples>=100 and positives>=20 and negatives>=20 then'validated'else'draft'end,p_actor_id)returning id into dataset_id;
  return jsonb_build_object('datasetId',dataset_id,'version',dataset_version,'snapshotsCreated',inserted,'examples',examples,'positive',positives,'negative',negatives,'sampleSufficient',examples>=100 and positives>=20 and negatives>=20,'futureLeakagePrevented',true,'personalDataIncluded',false);
end $$;

commit;
