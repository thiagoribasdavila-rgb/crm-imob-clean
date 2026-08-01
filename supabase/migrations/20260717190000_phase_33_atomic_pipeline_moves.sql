begin;
create table if not exists public.pipeline_stage_moves (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, actor_id uuid not null references public.profiles(id),
  from_stage text not null, to_stage text not null, reason text, reversal_of uuid references public.pipeline_stage_moves(id),
  occurred_at timestamptz not null default now(), unique (reversal_of)
);
create index if not exists pipeline_stage_moves_lead_time_idx on public.pipeline_stage_moves(organization_id,lead_id,occurred_at desc);
alter table public.pipeline_stage_moves enable row level security;
create policy pipeline_stage_moves_scope on public.pipeline_stage_moves for select to authenticated using (organization_id=(select public.current_organization_id()) and exists(select 1 from public.leads l where l.id=lead_id and (select private.can_access_commercial_lead(l.organization_id,l.assigned_to))));
revoke insert,update,delete on public.pipeline_stage_moves from authenticated,anon;
grant select on public.pipeline_stage_moves to authenticated; grant all on public.pipeline_stage_moves to service_role;

create or replace function public.move_pipeline_lead(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_to_stage text,p_expected_from_stage text,p_reason text default null,p_reversal_of uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare lead_row public.leads%rowtype; actor_role text; allowed boolean:=false; move_id uuid; original public.pipeline_stage_moves%rowtype; latest_id uuid; now_at timestamptz:=now();
begin
  if p_to_stage not in ('novo','contato','qualificacao','visita','proposta','contrato','ganho','perdido','comprou_outro') then raise exception 'pipeline_stage_invalid'; end if;
  select coalesce(commercial_role,case when role='admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
  if lead_row.id is null or actor_role is null then raise exception 'pipeline_lead_not_found'; end if;
  if actor_role='director' or lead_row.assigned_to=p_actor_id then allowed:=true; else with recursive team as (select id from public.profiles where reports_to=p_actor_id and organization_id=p_organization_id and active=true union all select p.id from public.profiles p join team t on p.reports_to=t.id where p.organization_id=p_organization_id and p.active=true) select exists(select 1 from team where id=lead_row.assigned_to) into allowed; end if;
  if actor_role='manager' then select exists(select 1 from public.profiles where id=lead_row.assigned_to and reports_to=p_actor_id and organization_id=p_organization_id and active=true) into allowed; end if;
  if not allowed then raise exception 'pipeline_move_out_of_scope'; end if;
  if coalesce(lead_row.status,'novo')<>p_expected_from_stage then raise exception 'pipeline_stage_conflict'; end if;
  if p_to_stage='comprou_outro' and char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'pipeline_buyer_reason_required'; end if;
  if p_reversal_of is not null then
    select * into original from public.pipeline_stage_moves where id=p_reversal_of and organization_id=p_organization_id and lead_id=p_lead_id;
    if original.id is null or original.reversal_of is not null or original.to_stage<>p_expected_from_stage or original.from_stage<>p_to_stage then raise exception 'pipeline_undo_invalid'; end if;
    if exists(select 1 from public.pipeline_stage_moves where reversal_of=original.id) then raise exception 'pipeline_already_reversed'; end if;
    select id into latest_id from public.pipeline_stage_moves where organization_id=p_organization_id and lead_id=p_lead_id order by occurred_at desc,id desc limit 1;
    if latest_id is distinct from original.id then raise exception 'pipeline_undo_stale'; end if;
  end if;
  insert into public.pipeline_stage_moves(organization_id,lead_id,actor_id,from_stage,to_stage,reason,reversal_of,occurred_at) values(p_organization_id,p_lead_id,p_actor_id,p_expected_from_stage,p_to_stage,nullif(left(trim(coalesce(p_reason,'')),4000),''),p_reversal_of,now_at) returning id into move_id;
  update public.leads set status=p_to_stage,updated_at=now_at where id=p_lead_id and organization_id=p_organization_id;
  insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata,occurred_at) values(p_organization_id,p_lead_id,p_actor_id,case when p_reversal_of is null then 'pipeline_stage_changed' else 'pipeline_stage_reverted' end,case when p_reversal_of is null then 'Etapa alterada para '||p_to_stage else 'Movimentação desfeita' end,case when p_to_stage='comprou_outro' then 'Comprou em outro lugar. '||trim(p_reason) else p_expected_from_stage||' → '||p_to_stage end,jsonb_build_object('moveId',move_id,'fromStage',p_expected_from_stage,'toStage',p_to_stage,'reversalOf',p_reversal_of),now_at);
  insert into public.atlas_events(organization_id,event_type,source,aggregate_type,aggregate_id,payload,correlation_id,causation_id,occurred_at) values(p_organization_id,case when p_reversal_of is null then 'lead.stage_changed' else 'lead.stage_reverted' end,'atlas-v1','lead',p_lead_id,jsonb_build_object('moveId',move_id,'previousStage',p_expected_from_stage,'stage',p_to_stage,'userId',p_actor_id),move_id::text,p_reversal_of,now_at);
  return jsonb_build_object('moveId',move_id,'leadId',p_lead_id,'previousStage',p_expected_from_stage,'stage',p_to_stage,'occurredAt',now_at,'reversalOf',p_reversal_of);
end $$;
revoke all on function public.move_pipeline_lead(uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.move_pipeline_lead(uuid,uuid,uuid,text,text,text,uuid) to service_role;
commit;
