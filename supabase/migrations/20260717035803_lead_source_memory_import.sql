begin;

create table if not exists public.lead_source_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  commercial_facts jsonb not null default '{}'::jsonb,
  excluded_sensitive_fields text[] not null default '{}',
  duplicate_group_size integer not null default 1 check (duplicate_group_size > 0),
  memory_role text not null check (memory_role in ('master_candidate','history_only')),
  ai_eligible boolean not null default true,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_fingerprint)
);
create index if not exists lead_source_memories_lead_idx on public.lead_source_memories (lead_id, created_at desc);
alter table public.lead_source_memories enable row level security;
create policy lead_source_memories_scope on public.lead_source_memories for select to authenticated using (
  organization_id=(select public.current_organization_id()) and exists(select 1 from public.leads l where l.id=lead_id and (select private.can_view_commercial_profile(l.assigned_to)))
);
revoke insert,update,delete on public.lead_source_memories from anon,authenticated;
grant select on public.lead_source_memories to authenticated;

create or replace function public.import_historical_lead_memory(
  p_organization_id uuid,p_owner_id uuid,p_imported_by uuid,p_name text,p_phone text,p_email text,
  p_source_file text,p_source_sheet text,p_source_row integer,p_source_fingerprint text,
  p_commercial_facts jsonb,p_excluded_sensitive_fields text[],p_duplicate_group_size integer,p_memory_role text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized text; normalized_email text; lead_ref uuid; created_new boolean:=false; suppression_reason text;
begin
  normalized:=nullif(regexp_replace(coalesce(p_phone,''),'\D','','g'),''); normalized_email:=nullif(lower(trim(coalesce(p_email,''))),'');
  if normalized is null and normalized_email is null then return jsonb_build_object('status','blocked','reason','invalid_contact'); end if;
  if p_commercial_facts ?| array['cpf','cnpj','endereco','cep','fax','pedido','codigo','razao_social','valor_pago'] then raise exception 'sensitive_fact_not_allowed'; end if;
  if normalized is not null then
    select reason into suppression_reason from public.contact_quality_suppressions where organization_id=p_organization_id and channel='whatsapp' and normalized_contact=normalized and active limit 1;
    if suppression_reason is null and exists(select 1 from public.messaging_suppressions where organization_id=p_organization_id and channel='whatsapp' and recipient=normalized) then suppression_reason:='opt_out'; end if;
    if suppression_reason is not null then return jsonb_build_object('status','blocked','reason',suppression_reason); end if;
  end if;
  select id into lead_ref from public.leads where organization_id=p_organization_id and ((normalized is not null and phone_normalized=normalized) or (normalized_email is not null and lower(email)=normalized_email)) order by created_at limit 1;
  if lead_ref is null then
    if not exists(select 1 from public.profiles where id=p_owner_id and organization_id=p_organization_id and active and (commercial_role='broker' or role='broker')) then raise exception 'historical_import_owner_invalid'; end if;
    insert into public.leads(organization_id,assigned_to,name,phone,email,source,status,metadata)
    values(p_organization_id,p_owner_id,left(coalesce(nullif(trim(p_name),''),'Contato histórico'),160),normalized,normalized_email,'Base histórica','novo',jsonb_build_object('reactivation',jsonb_build_object('contactPermission','pending_validation','automaticActivation',false),'historicalMemory',true)) returning id into lead_ref; created_new:=true;
  end if;
  insert into public.lead_source_memories(organization_id,lead_id,source_file,source_sheet,source_row,source_fingerprint,commercial_facts,excluded_sensitive_fields,duplicate_group_size,memory_role,imported_by)
  values(p_organization_id,lead_ref,left(p_source_file,240),left(p_source_sheet,120),p_source_row,p_source_fingerprint,coalesce(p_commercial_facts,'{}'::jsonb),coalesce(p_excluded_sensitive_fields,'{}'),p_duplicate_group_size,p_memory_role,p_imported_by)
  on conflict(organization_id,source_fingerprint) do nothing;
  return jsonb_build_object('status',case when created_new then 'created' else 'memory_attached' end,'leadId',lead_ref,'automaticActivation',false);
end $$;
revoke all on function public.import_historical_lead_memory(uuid,uuid,uuid,text,text,text,text,text,integer,text,jsonb,text[],integer,text) from public,anon,authenticated;
grant execute on function public.import_historical_lead_memory(uuid,uuid,uuid,text,text,text,text,text,integer,text,jsonb,text[],integer,text) to service_role;

commit;
