begin;

alter table public.commercial_simulations
  add column if not exists review_requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists preparation_minutes integer,
  add column if not exists review_minutes integer,
  add column if not exists response_minutes integer,
  add column if not exists response_note text;

alter table public.commercial_simulations drop constraint if exists commercial_simulations_status_check;
alter table public.commercial_simulations add constraint commercial_simulations_status_check
  check (status in ('draft','proposal_review','approved','rejected','sent','accepted','declined','expired'));
alter table public.commercial_simulations drop constraint if exists commercial_simulations_sla_minutes_check;
alter table public.commercial_simulations add constraint commercial_simulations_sla_minutes_check check (
  (preparation_minutes is null or preparation_minutes >= 0) and
  (review_minutes is null or review_minutes >= 0) and
  (response_minutes is null or response_minutes >= 0)
);
create index if not exists commercial_simulations_proposal_sla on public.commercial_simulations (organization_id, status, valid_until);

create or replace function public.stamp_commercial_proposal_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'proposal_review' then
    new.review_requested_at := coalesce(new.review_requested_at, now());
    new.preparation_minutes := greatest(0, floor(extract(epoch from (new.review_requested_at - old.created_at)) / 60)::integer);
  elsif new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.review_minutes := greatest(0, floor(extract(epoch from (new.approved_at - coalesce(old.review_requested_at, old.updated_at))) / 60)::integer);
  elsif new.status = 'sent' then new.sent_at := coalesce(new.sent_at, now());
  elsif new.status in ('accepted','declined') then
    new.responded_at := coalesce(new.responded_at, now());
    new.response_minutes := greatest(0, floor(extract(epoch from (new.responded_at - coalesce(old.sent_at, old.updated_at))) / 60)::integer);
  elsif new.status = 'expired' then new.expired_at := coalesce(new.expired_at, now());
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists commercial_simulations_stamp_lifecycle on public.commercial_simulations;
create trigger commercial_simulations_stamp_lifecycle before update of status on public.commercial_simulations
for each row execute function public.stamp_commercial_proposal_lifecycle();

create or replace function public.transition_commercial_proposal(
  p_actor_id uuid, p_organization_id uuid, p_lead_id uuid, p_simulation_id uuid, p_status text, p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata,occurred_at)
  values(p_organization_id,p_lead_id,p_actor_id,'commercial_proposal_lifecycle',case p_status when 'sent' then 'Proposta enviada ao cliente' when 'accepted' then 'Proposta aceita pelo cliente' when 'declined' then 'Proposta recusada pelo cliente' else 'Proposta vencida' end,coalesce(nullif(left(trim(coalesce(p_note,'')),1000),''),'Ciclo comercial atualizado com rastreabilidade.'),jsonb_build_object('simulationId',sim.id,'from',previous_status,'to',p_status),now());
  if p_status='sent' then update public.leads set next_action_at=least(sim.valid_until,now()+interval '24 hours'),updated_at=now() where id=p_lead_id and organization_id=p_organization_id;
  elsif p_status in ('accepted','declined','expired') then update public.leads set next_action_at=null,updated_at=now() where id=p_lead_id and organization_id=p_organization_id; end if;
  return jsonb_build_object('id',sim.id,'previousStatus',previous_status,'status',p_status,'validUntil',sim.valid_until,'occurredAt',now());
end $$;

update public.commercial_simulations set review_requested_at=coalesce(review_requested_at,updated_at),preparation_minutes=coalesce(preparation_minutes,greatest(0,floor(extract(epoch from (updated_at-created_at))/60)::integer)) where status in ('proposal_review','approved','rejected','sent','accepted','declined') and review_requested_at is null;
update public.commercial_simulations set approved_at=coalesce(approved_at,updated_at),review_minutes=coalesce(review_minutes,0) where status in ('approved','sent','accepted','declined') and approved_at is null;

revoke all on function public.stamp_commercial_proposal_lifecycle() from public,anon,authenticated;
revoke all on function public.transition_commercial_proposal(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_commercial_proposal(uuid,uuid,uuid,uuid,text,text) to service_role;

commit;
