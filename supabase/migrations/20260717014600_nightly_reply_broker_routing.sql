begin;

drop policy if exists atlas_org_isolation on public.conversations;
drop policy if exists atlas_org_isolation on public.messages;
create policy conversations_commercial_scope on public.conversations for select to authenticated using(organization_id=(select public.current_organization_id()) and assigned_to is not null and (select private.can_access_commercial_lead(organization_id,assigned_to)));
create policy messages_commercial_scope on public.messages for select to authenticated using(messages.organization_id=(select public.current_organization_id()) and exists(select 1 from public.conversations c where c.id=messages.conversation_id and c.organization_id=messages.organization_id and c.assigned_to is not null and (select private.can_access_commercial_lead(c.organization_id,c.assigned_to))));
revoke insert,update,delete on public.conversations from authenticated;
revoke insert,update,delete on public.messages from authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;

create or replace function public.route_nightly_journey_reply(p_organization_id uuid,p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata,occurred_at) values(p_organization_id,journey.lead_id,lead_owner,'nightly_journey_reply','Lead respondeu à abordagem noturna','Resposta direcionada ao corretor exclusivo. Próxima ação: abrir a conversa e continuar a descoberta.',jsonb_build_object('journeyId',journey.id,'conversationId',p_conversation_id,'messageId',p_message_id,'stage',current_stage,'status','waiting_broker'),now());
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id) values(p_organization_id,'nightly_journey.customer_replied','whatsapp','lead',journey.lead_id,jsonb_build_object('brokerId',lead_owner,'journeyId',journey.id,'stage',current_stage,'nextAction','broker_reply'),p_message_id::text);
  return jsonb_build_object('routed',true,'journeyId',journey.id,'leadId',journey.lead_id,'brokerId',lead_owner,'stage',current_stage,'status','waiting_broker');
end; $$;

revoke all on function public.route_nightly_journey_reply(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.route_nightly_journey_reply(uuid,uuid,uuid) to service_role;
commit;
