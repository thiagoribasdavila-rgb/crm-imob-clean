begin;

create or replace function private.block_suppressed_whatsapp_outbox()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient_value text;
begin
  if new.topic='message.send' and new.status in ('pending','failed') then
    select regexp_replace(coalesce(recipient,''),'\D','','g') into recipient_value from public.messages where id=new.aggregate_id and organization_id=new.organization_id and channel='whatsapp';
    if recipient_value is not null and exists(select 1 from public.messaging_suppressions where organization_id=new.organization_id and channel='whatsapp' and recipient=recipient_value) then raise exception 'whatsapp_recipient_suppressed'; end if;
  end if;
  return new;
end; $$;
revoke all on function private.block_suppressed_whatsapp_outbox() from public,anon,authenticated;
drop trigger if exists integration_outbox_block_suppressed_whatsapp on public.integration_outbox;
create trigger integration_outbox_block_suppressed_whatsapp before insert or update of status on public.integration_outbox for each row execute function private.block_suppressed_whatsapp_outbox();

create or replace function public.register_whatsapp_opt_out(p_organization_id uuid,p_recipient text,p_source text,p_external_message_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if lead_ref is not null then
    insert into public.activities(organization_id,lead_id,type,title,description,metadata,occurred_at) values(p_organization_id,lead_ref,'whatsapp_opt_out','Cliente solicitou interrupção de mensagens','Novos envios por WhatsApp foram bloqueados imediatamente.',jsonb_build_object('source',p_source,'externalMessageId',p_external_message_id,'blockedMessages',blocked_messages),now());
  end if;
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id) values(p_organization_id,'messaging.opt_out','whatsapp','lead',lead_ref,jsonb_build_object('channel','whatsapp','blockedMessages',blocked_messages,'cancelledApprovals',cancelled_approvals,'blockedEvents',blocked_events),nullif(p_external_message_id,''));
  return jsonb_build_object('suppressed',true,'blockedMessages',blocked_messages,'cancelledApprovals',cancelled_approvals,'blockedEvents',blocked_events,'leadId',lead_ref);
end; $$;

revoke all on function public.register_whatsapp_opt_out(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_whatsapp_opt_out(uuid,text,text,text) to service_role;
commit;
