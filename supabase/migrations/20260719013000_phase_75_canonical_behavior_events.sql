begin;

create table if not exists public.lead_behavior_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_name text not null check (event_name in ('message_inbound','message_outbound','message_read','call_completed','visit_scheduled','visit_confirmed','visit_completed','visit_cancelled','visit_no_show','proposal_created','proposal_review','proposal_approved','proposal_rejected','proposal_expired','stage_progressed','conversion_won','conversion_lost','external_purchase','opt_out')),
  event_category text not null check (event_category in ('engagement','visit','proposal','conversion','preference')),
  direction text not null check (direction in ('positive','negative','neutral')),
  channel text,
  stage text,
  source_table text not null,
  source_id uuid,
  event_key text not null,
  occurred_at timestamptz not null default now(),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,event_key)
);
create index if not exists lead_behavior_events_timeline_idx on public.lead_behavior_events(organization_id,lead_id,occurred_at desc,id);
create index if not exists lead_behavior_events_learning_idx on public.lead_behavior_events(organization_id,event_name,occurred_at desc);
alter table public.lead_behavior_events enable row level security;
drop policy if exists lead_behavior_events_scope on public.lead_behavior_events;
create policy lead_behavior_events_scope on public.lead_behavior_events for select to authenticated using(organization_id=(select public.current_organization_id())and(select private.can_view_lead(lead_id)));
revoke all on public.lead_behavior_events from anon;
revoke insert,update,delete on public.lead_behavior_events from authenticated;
grant select on public.lead_behavior_events to authenticated;
grant all on public.lead_behavior_events to service_role;

create or replace function public.record_lead_behavior_event(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_event_name text,p_channel text,p_stage text,p_source_table text,p_source_id uuid,p_event_key text,p_occurred_at timestamptz,p_attributes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare category text;signal_direction text;target_id uuid;safe_attributes jsonb;
begin
  if not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id) then raise exception 'behavior_lead_invalid';end if;
  if p_actor_id is not null and not exists(select 1 from public.profiles p where p.id=p_actor_id and p.organization_id=p_organization_id and p.active=true and(p.id=(select l.assigned_to from public.leads l where l.id=p_lead_id)or coalesce(p.commercial_role,case p.role when'admin'then'director'else p.role end)in('director','superintendent','manager')))then raise exception 'behavior_actor_forbidden';end if;
  if p_event_name not in('message_inbound','message_outbound','message_read','call_completed','visit_scheduled','visit_confirmed','visit_completed','visit_cancelled','visit_no_show','proposal_created','proposal_review','proposal_approved','proposal_rejected','proposal_expired','stage_progressed','conversion_won','conversion_lost','external_purchase','opt_out')or char_length(trim(coalesce(p_event_key,'')))<5 then raise exception 'behavior_payload_invalid';end if;
  category:=case when p_event_name like'message_%'or p_event_name='call_completed'then'engagement'when p_event_name like'visit_%'then'visit'when p_event_name like'proposal_%'then'proposal'when p_event_name='opt_out'then'preference'else'conversion'end;
  signal_direction:=case when p_event_name in('visit_cancelled','visit_no_show','proposal_rejected','proposal_expired','conversion_lost','opt_out')then'negative'when p_event_name in('message_outbound','proposal_created','proposal_review','stage_progressed')then'neutral'else'positive'end;
  safe_attributes:=jsonb_strip_nulls(jsonb_build_object('status',nullif(p_attributes->>'status',''),'previousStatus',nullif(p_attributes->>'previousStatus',''),'format',nullif(p_attributes->>'format',''),'outcome',nullif(p_attributes->>'outcome',''),'durationMinutes',case when (p_attributes->>'durationMinutes')~'^\d+$'then(p_attributes->>'durationMinutes')::integer end,'automated',case when p_attributes?'automated'then(p_attributes->>'automated')::boolean end,'modelVersion',nullif(p_attributes->>'modelVersion','')));
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||trim(p_event_key),0));
  insert into public.lead_behavior_events(organization_id,lead_id,event_name,event_category,direction,channel,stage,source_table,source_id,event_key,occurred_at,attributes)values(p_organization_id,p_lead_id,p_event_name,category,signal_direction,nullif(trim(coalesce(p_channel,'')),''),nullif(trim(coalesce(p_stage,'')),''),trim(p_source_table),p_source_id,trim(p_event_key),coalesce(p_occurred_at,now()),safe_attributes)on conflict(organization_id,event_key)do nothing returning id into target_id;
  if target_id is null then select id into target_id from public.lead_behavior_events where organization_id=p_organization_id and event_key=trim(p_event_key);return jsonb_build_object('eventId',target_id,'duplicatePrevented',true,'canonicalTaxonomy',true);end if;
  return jsonb_build_object('eventId',target_id,'recorded',true,'canonicalTaxonomy',true,'personalDataStored',false);
end $$;

create or replace function private.capture_message_behavior()returns trigger language plpgsql security definer set search_path='' as $$declare lead uuid;event_name text;event_key text;begin select c.lead_id into lead from public.conversations c where c.id=new.conversation_id and c.organization_id=new.organization_id;if lead is null then return new;end if;if tg_op='UPDATE'then if new.status<>'read'or old.status='read'then return new;end if;event_name:='message_read';event_key:='message-read:'||new.id::text;else event_name:=case when new.direction='inbound'then'message_inbound'else'message_outbound'end;event_key:='message-created:'||new.id::text;end if;perform public.record_lead_behavior_event(null,new.organization_id,lead,event_name,new.channel,null,'messages',new.id,event_key,coalesce(new.read_at,new.sent_at,new.created_at),jsonb_build_object('status',new.status,'automated',false));return new;end $$;
drop trigger if exists capture_message_behavior_insert on public.messages;create trigger capture_message_behavior_insert after insert on public.messages for each row execute function private.capture_message_behavior();
drop trigger if exists capture_message_behavior_read on public.messages;create trigger capture_message_behavior_read after update of status on public.messages for each row when(old.status is distinct from new.status)execute function private.capture_message_behavior();

create or replace function private.capture_visit_behavior()returns trigger language plpgsql security definer set search_path='' as $$declare event_name text;event_key text;event_time timestamptz;begin if tg_op='UPDATE'and new.status=old.status then return new;end if;event_name:=case new.status when'scheduled'then'visit_scheduled'when'confirmed'then'visit_confirmed'when'completed'then'visit_completed'when'cancelled'then'visit_cancelled'when'no_show'then'visit_no_show'end;event_key:='visit:'||new.id::text||':'||new.status;event_time:=coalesce(new.completed_at,new.cancelled_at,new.no_show_at,new.confirmed_at,new.created_at);perform public.record_lead_behavior_event(null,new.organization_id,new.lead_id,event_name,null,null,'lead_visits',new.id,event_key,event_time,jsonb_build_object('status',new.status,'previousStatus',case when tg_op='UPDATE'then old.status end,'format',new.format));return new;end $$;
drop trigger if exists capture_visit_behavior_write on public.lead_visits;create trigger capture_visit_behavior_write after insert or update of status on public.lead_visits for each row execute function private.capture_visit_behavior();

create or replace function private.capture_proposal_behavior()returns trigger language plpgsql security definer set search_path='' as $$declare event_name text;begin if tg_op='UPDATE'and new.status=old.status then return new;end if;event_name:=case new.status when'draft'then'proposal_created'when'proposal_review'then'proposal_review'when'approved'then'proposal_approved'when'rejected'then'proposal_rejected'when'expired'then'proposal_expired'end;perform public.record_lead_behavior_event(null,new.organization_id,new.lead_id,event_name,null,'proposta','commercial_simulations',new.id,'proposal:'||new.id::text||':'||new.status,case when tg_op='INSERT'then new.created_at else new.updated_at end,jsonb_build_object('status',new.status,'previousStatus',case when tg_op='UPDATE'then old.status end));return new;end $$;
drop trigger if exists capture_proposal_behavior_write on public.commercial_simulations;create trigger capture_proposal_behavior_write after insert or update of status on public.commercial_simulations for each row execute function private.capture_proposal_behavior();

create or replace function private.capture_lead_stage_behavior()returns trigger language plpgsql security definer set search_path='' as $$declare event_name text;begin if new.status is not distinct from old.status then return new;end if;event_name:=case lower(new.status)when'ganho'then'conversion_won'when'won'then'conversion_won'when'perdido'then'conversion_lost'when'lost'then'conversion_lost'when'comprou_outro'then'external_purchase'else'stage_progressed'end;perform public.record_lead_behavior_event(null,new.organization_id,new.id,event_name,null,new.status,'leads',new.id,'lead-stage:'||new.id::text||':'||txid_current()::text,now(),jsonb_build_object('status',new.status,'previousStatus',old.status));return new;end $$;
drop trigger if exists capture_lead_stage_behavior_update on public.leads;create trigger capture_lead_stage_behavior_update after update of status on public.leads for each row when(old.status is distinct from new.status)execute function private.capture_lead_stage_behavior();

insert into public.lead_behavior_events(organization_id,lead_id,event_name,event_category,direction,channel,source_table,source_id,event_key,occurred_at,attributes)
select m.organization_id,c.lead_id,case when m.direction='inbound'then'message_inbound'else'message_outbound'end,'engagement',case when m.direction='inbound'then'positive'else'neutral'end,m.channel,'messages',m.id,'backfill-message:'||m.id::text,coalesce(m.sent_at,m.created_at),jsonb_build_object('status',m.status,'automated',false)from public.messages m join public.conversations c on c.id=m.conversation_id where c.lead_id is not null on conflict(organization_id,event_key)do nothing;
insert into public.lead_behavior_events(organization_id,lead_id,event_name,event_category,direction,source_table,source_id,event_key,occurred_at,attributes)
select v.organization_id,v.lead_id,case v.status when'scheduled'then'visit_scheduled'when'confirmed'then'visit_confirmed'when'completed'then'visit_completed'when'cancelled'then'visit_cancelled'else'visit_no_show'end,'visit',case when v.status in('cancelled','no_show')then'negative'else'positive'end,'lead_visits',v.id,'backfill-visit:'||v.id::text||':'||v.status,coalesce(v.completed_at,v.cancelled_at,v.no_show_at,v.confirmed_at,v.created_at),jsonb_build_object('status',v.status,'format',v.format)from public.lead_visits v on conflict(organization_id,event_key)do nothing;
insert into public.lead_behavior_events(organization_id,lead_id,event_name,event_category,direction,stage,source_table,source_id,event_key,occurred_at,attributes)
select s.organization_id,s.lead_id,case s.status when'draft'then'proposal_created'when'proposal_review'then'proposal_review'when'approved'then'proposal_approved'when'rejected'then'proposal_rejected'else'proposal_expired'end,'proposal',case when s.status in('rejected','expired')then'negative'when s.status='approved'then'positive'else'neutral'end,'proposta','commercial_simulations',s.id,'backfill-proposal:'||s.id::text||':'||s.status,s.updated_at,jsonb_build_object('status',s.status)from public.commercial_simulations s on conflict(organization_id,event_key)do nothing;

revoke all on function public.record_lead_behavior_event(uuid,uuid,uuid,text,text,text,text,uuid,text,timestamptz,jsonb)from public,anon,authenticated;
grant execute on function public.record_lead_behavior_event(uuid,uuid,uuid,text,text,text,text,uuid,text,timestamptz,jsonb)to service_role;
commit;
