begin;

alter table public.leads add column if not exists phone_normalized text;
update public.leads set phone_normalized = regexp_replace(coalesce(phone,''),'\D','','g') where phone is not null and phone_normalized is null;
create index if not exists leads_org_phone_normalized_idx on public.leads (organization_id, phone_normalized) where phone_normalized is not null;

create or replace function private.normalize_lead_phone() returns trigger language plpgsql set search_path = '' as $$
begin new.phone_normalized := nullif(regexp_replace(coalesce(new.phone,''),'\D','','g'),''); return new; end $$;
drop trigger if exists normalize_lead_phone_before_write on public.leads;
create trigger normalize_lead_phone_before_write before insert or update of phone on public.leads for each row execute function private.normalize_lead_phone();

create table if not exists public.contact_quality_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','sms','phone')),
  normalized_contact text not null,
  reason text not null check (reason in ('invalid_phone','disconnected','wrong_person','duplicate_master','fraud_risk')),
  evidence text not null,
  source text not null default 'broker_feedback',
  reported_by uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  hit_count integer not null default 1 check (hit_count > 0),
  active boolean not null default true,
  unique (organization_id, channel, normalized_contact)
);
create index if not exists contact_quality_suppressions_lookup_idx on public.contact_quality_suppressions (organization_id, channel, normalized_contact) where active;

create table if not exists public.contact_quality_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  suppression_id uuid not null references public.contact_quality_suppressions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null, action text not null check (action in ('reported','blocked_import','blocked_activation','reviewed')),
  batch_id uuid references public.lead_reactivation_batches(id) on delete set null, actor_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists contact_quality_history_org_created_idx on public.contact_quality_history (organization_id, created_at desc);

alter table public.contact_quality_suppressions enable row level security;
alter table public.contact_quality_history enable row level security;
create policy contact_quality_suppressions_director_read on public.contact_quality_suppressions for select to authenticated using (organization_id = (select public.current_organization_id()) and exists (select 1 from public.profiles where id = (select auth.uid()) and active = true and (role = 'admin' or commercial_role in ('director','superintendent','manager'))));
create policy contact_quality_history_director_read on public.contact_quality_history for select to authenticated using (organization_id = (select public.current_organization_id()) and exists (select 1 from public.profiles where id = (select auth.uid()) and active = true and (role = 'admin' or commercial_role in ('director','superintendent','manager'))));
revoke insert, update, delete on public.contact_quality_suppressions, public.contact_quality_history from anon, authenticated;
grant select on public.contact_quality_suppressions, public.contact_quality_history to authenticated;

create or replace function public.register_invalid_lead_phone(p_organization_id uuid,p_lead_id uuid,p_actor_id uuid,p_reason text,p_evidence text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare normalized text; suppression_ref uuid;
begin
  if p_reason not in ('invalid_phone','disconnected','wrong_person') or length(trim(coalesce(p_evidence,''))) < 5 then raise exception 'invalid_phone_quality_payload'; end if;
  if not exists (select 1 from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true) then raise exception 'invalid_phone_quality_actor'; end if;
  select phone_normalized into normalized from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if length(coalesce(normalized,'')) < 10 then raise exception 'invalid_phone_quality_contact'; end if;
  insert into public.contact_quality_suppressions(organization_id,channel,normalized_contact,reason,evidence,reported_by)
  values(p_organization_id,'whatsapp',normalized,p_reason,left(trim(p_evidence),500),p_actor_id)
  on conflict(organization_id,channel,normalized_contact) do update set reason=excluded.reason,evidence=excluded.evidence,reported_by=excluded.reported_by,last_seen_at=now(),hit_count=contact_quality_suppressions.hit_count+1,active=true returning id into suppression_ref;
  insert into public.contact_quality_history(organization_id,suppression_id,lead_id,action,actor_id,details) values(p_organization_id,suppression_ref,p_lead_id,'reported',p_actor_id,jsonb_build_object('reason',p_reason,'evidence',left(trim(p_evidence),500)));
  update public.lead_reactivation_contacts set status='blocked',block_reason='invalid_phone_history' where organization_id=p_organization_id and phone=normalized and status in ('imported','pending_approval','queued','sent');
  update public.messages set status='failed',error='Telefone inválido confirmado; contato suprimido.' where organization_id=p_organization_id and channel='whatsapp' and recipient=normalized and direction='outbound' and status='queued';
  update public.leads set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{phoneQuality}',jsonb_build_object('status','invalid','reason',p_reason,'reportedAt',now(),'reportedBy',p_actor_id),true),updated_at=now() where id=p_lead_id and organization_id=p_organization_id;
  return jsonb_build_object('suppressed',true,'leadId',p_lead_id,'reason',p_reason);
end $$;
revoke all on function public.register_invalid_lead_phone(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_invalid_lead_phone(uuid,uuid,uuid,text,text) to service_role;

create or replace function private.block_bad_quality_whatsapp_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare normalized text;
begin
  if new.channel='whatsapp' and new.direction='outbound' then normalized:=regexp_replace(coalesce(new.recipient,''),'\D','','g');
    if exists(select 1 from public.contact_quality_suppressions where organization_id=new.organization_id and channel='whatsapp' and normalized_contact=normalized and active) then raise exception 'invalid_phone_suppressed'; end if;
  end if; return new;
end $$;
revoke all on function private.block_bad_quality_whatsapp_message() from public,anon,authenticated;
drop trigger if exists block_bad_quality_whatsapp_message on public.messages;
create trigger block_bad_quality_whatsapp_message before insert on public.messages for each row execute function private.block_bad_quality_whatsapp_message();

commit;
