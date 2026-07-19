begin;
create table if not exists public.broker_absence_events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,broker_id uuid not null references public.profiles(id),manager_id uuid not null references public.profiles(id),actor_id uuid not null references public.profiles(id),starts_at timestamptz not null default now(),ends_at timestamptz not null,reason text not null check(char_length(reason) between 10 and 500),status text not null default 'active' check(status in('active','ended','cancelled')),transferred_count integer not null default 0,assignment_snapshot jsonb not null default '[]'::jsonb,created_at timestamptz not null default now());
create index if not exists broker_absence_events_scope_idx on public.broker_absence_events(organization_id,broker_id,ends_at desc);
alter table public.broker_absence_events enable row level security;
drop policy if exists broker_absence_events_scope on public.broker_absence_events;
create policy broker_absence_events_scope on public.broker_absence_events for select to authenticated using(organization_id=(select public.current_organization_id()) and (select private.can_view_commercial_profile(broker_id)));
revoke all on public.broker_absence_events from anon;revoke insert,update,delete on public.broker_absence_events from authenticated;grant select on public.broker_absence_events to authenticated;

create or replace function public.redistribute_absent_broker_leads(p_actor_id uuid,p_organization_id uuid,p_broker_id uuid,p_ends_at timestamptz,p_reason text,p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;manager_id uuid;requested integer;batch_id uuid;absence_id uuid;lead_row record;target_broker uuid;target_load integer;target_weight integer;transferred integer:=0;assignments jsonb:='[]'::jsonb;
begin
 if p_limit<1 or p_limit>200 then raise exception 'absence_transfer_limit_invalid';end if;if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'absence_reason_invalid';end if;if p_ends_at<=now() or p_ends_at>now()+interval '90 days' then raise exception 'absence_period_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent','manager') then raise exception 'absence_actor_forbidden';end if;
 select reports_to into manager_id from public.profiles where id=p_broker_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,role)='broker';if manager_id is null then raise exception 'absence_broker_invalid';end if;
 if actor_role='manager' and manager_id<>p_actor_id then raise exception 'absence_broker_out_of_scope';end if;
 if actor_role='superintendent' and not exists(select 1 from public.profiles m where m.id=manager_id and m.organization_id=p_organization_id and m.reports_to=p_actor_id and m.active=true) then raise exception 'absence_broker_out_of_scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_broker_id::text,0));
 insert into public.broker_absence_events(organization_id,broker_id,manager_id,actor_id,ends_at,reason)values(p_organization_id,p_broker_id,manager_id,p_actor_id,p_ends_at,trim(p_reason))returning id into absence_id;
 update public.commercial_presence set availability='offline',updated_at=now() where profile_id=p_broker_id and organization_id=p_organization_id;
 select count(*) into requested from public.leads where organization_id=p_organization_id and assigned_to=p_broker_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado');requested:=least(requested,p_limit);
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,manager_id,requested,trim(p_reason))returning id into batch_id;
 for lead_row in select id,development_id from public.leads where organization_id=p_organization_id and assigned_to=p_broker_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado') order by updated_at,id for update skip locked limit p_limit loop
  select p.id,count(l.id)::integer,coalesce(m.weight,1) into target_broker,target_load,target_weight from public.profiles p join public.commercial_presence cp on cp.profile_id=p.id and cp.organization_id=p_organization_id and cp.availability='available' and cp.last_seen_at>=now()-interval '90 seconds' left join public.project_distribution_members m on m.profile_id=p.id and m.development_id=lead_row.development_id left join public.leads l on l.organization_id=p_organization_id and l.assigned_to=p.id and l.development_id is not distinct from lead_row.development_id where p.organization_id=p_organization_id and p.reports_to=manager_id and p.id<>p_broker_id and p.active=true and coalesce(p.commercial_role,p.role)='broker' and coalesce(m.enabled,true) group by p.id,m.weight,m.last_assigned_at order by(count(l.id)::numeric/coalesce(m.weight,1)),m.last_assigned_at nulls first,p.id limit 1;
  if target_broker is null then raise exception 'absence_no_eligible_replacement';end if;
  insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,lead_row.id,p_broker_id,target_broker);
  update public.leads set assigned_to=target_broker,updated_at=now() where id=lead_row.id and organization_id=p_organization_id and assigned_to=p_broker_id;
  update public.tasks set assigned_to=target_broker where organization_id=p_organization_id and lead_id=lead_row.id and coalesce(status,'pendente') not in('concluida','completed','cancelado','cancelled');
  insert into public.activities(organization_id,lead_id,user_id,title,description,type,occurred_at)values(p_organization_id,lead_row.id,p_actor_id,'Cobertura por ausência do corretor',left(trim(p_reason),500),'system',now());
  insert into public.project_distribution_members(organization_id,development_id,profile_id,assignments_count,last_assigned_at,updated_at)select p_organization_id,lead_row.development_id,target_broker,1,now(),now() where lead_row.development_id is not null on conflict(development_id,profile_id)do update set assignments_count=public.project_distribution_members.assignments_count+1,last_assigned_at=excluded.last_assigned_at,updated_at=excluded.updated_at;
  assignments:=assignments||jsonb_build_array(jsonb_build_object('leadId',lead_row.id,'brokerId',target_broker,'projectId',lead_row.development_id,'projectLoadBefore',target_load,'weight',target_weight));transferred:=transferred+1;
 end loop;
 update public.broker_absence_events set transferred_count=transferred,assignment_snapshot=assignments where id=absence_id;
 return jsonb_build_object('absenceId',absence_id,'batchId',batch_id,'transferred',transferred,'endsAt',p_ends_at,'assignments',assignments,'sameTeam',true,'activePortfolioOnly',true,'singleBrokerOwner',true,'managerOwnsLeads',false,'humanApproval',true,'auditable',true);
end $$;
revoke all on function public.redistribute_absent_broker_leads(uuid,uuid,uuid,timestamptz,text,integer) from public,anon,authenticated;grant execute on function public.redistribute_absent_broker_leads(uuid,uuid,uuid,timestamptz,text,integer) to service_role;
commit;
