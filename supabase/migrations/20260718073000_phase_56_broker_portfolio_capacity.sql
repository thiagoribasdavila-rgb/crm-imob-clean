begin;
create table if not exists public.broker_capacity_limits(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,max_active_leads integer not null default 100 check(max_active_leads between 1 and 2000),max_project_leads integer not null default 50 check(max_project_leads between 1 and 1000),warning_percent integer not null default 80 check(warning_percent between 50 and 95),updated_by uuid not null references public.profiles(id),reason text not null check(char_length(reason) between 10 and 500),updated_at timestamptz not null default now(),unique(organization_id,profile_id));
create index if not exists broker_capacity_limits_scope_idx on public.broker_capacity_limits(organization_id,profile_id);
alter table public.broker_capacity_limits enable row level security;
drop policy if exists broker_capacity_limits_scope on public.broker_capacity_limits;
create policy broker_capacity_limits_scope on public.broker_capacity_limits for select to authenticated using(organization_id=(select public.current_organization_id()) and (select private.can_view_commercial_profile(profile_id)));
revoke all on public.broker_capacity_limits from anon;revoke insert,update,delete on public.broker_capacity_limits from authenticated;grant select on public.broker_capacity_limits to authenticated;

create or replace function public.configure_broker_capacity(p_actor_id uuid,p_organization_id uuid,p_profile_id uuid,p_max_active_leads integer,p_max_project_leads integer,p_warning_percent integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;target_manager uuid;current_total integer;current_project_max integer;
begin
 if p_max_active_leads<1 or p_max_active_leads>2000 or p_max_project_leads<1 or p_max_project_leads>1000 or p_max_project_leads>p_max_active_leads or p_warning_percent<50 or p_warning_percent>95 then raise exception 'capacity_values_invalid';end if;if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'capacity_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;if actor_role not in('director','superintendent','manager') then raise exception 'capacity_actor_forbidden';end if;
 select reports_to into target_manager from public.profiles where id=p_profile_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,role)='broker';if target_manager is null then raise exception 'capacity_broker_invalid';end if;
 if actor_role='manager' and target_manager<>p_actor_id then raise exception 'capacity_broker_out_of_scope';end if;if actor_role='superintendent' and not exists(select 1 from public.profiles where id=target_manager and reports_to=p_actor_id and organization_id=p_organization_id and active=true) then raise exception 'capacity_broker_out_of_scope';end if;
 select count(*) into current_total from public.leads where organization_id=p_organization_id and assigned_to=p_profile_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado');
 select coalesce(max(n),0) into current_project_max from(select count(*) n from public.leads where organization_id=p_organization_id and assigned_to=p_profile_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado') group by development_id)s;
 insert into public.broker_capacity_limits(organization_id,profile_id,max_active_leads,max_project_leads,warning_percent,updated_by,reason,updated_at)values(p_organization_id,p_profile_id,p_max_active_leads,p_max_project_leads,p_warning_percent,p_actor_id,trim(p_reason),now())on conflict(organization_id,profile_id)do update set max_active_leads=excluded.max_active_leads,max_project_leads=excluded.max_project_leads,warning_percent=excluded.warning_percent,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=excluded.updated_at;
 return jsonb_build_object('profileId',p_profile_id,'maxActiveLeads',p_max_active_leads,'maxProjectLeads',p_max_project_leads,'warningPercent',p_warning_percent,'currentActiveLeads',current_total,'currentLargestProject',current_project_max,'currentlyOverLimit',current_total>p_max_active_leads or current_project_max>p_max_project_leads,'humanConfigured',true,'peopleRanking',false);
end $$;

create or replace function private.guard_broker_portfolio_capacity()returns trigger language plpgsql security definer set search_path='' as $$
declare limits record;total_load integer;project_load integer;
begin
 if new.assigned_to is null or lower(coalesce(new.status,'novo')) in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado') then return new;end if;
 if tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to and new.development_id is not distinct from old.development_id and lower(coalesce(old.status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado') then return new;end if;
 select * into limits from public.broker_capacity_limits where organization_id=new.organization_id and profile_id=new.assigned_to;if limits.id is null then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||new.assigned_to::text,56));
 select count(*) into total_load from public.leads where organization_id=new.organization_id and assigned_to=new.assigned_to and id<>new.id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado');
 select count(*) into project_load from public.leads where organization_id=new.organization_id and assigned_to=new.assigned_to and id<>new.id and development_id is not distinct from new.development_id and lower(coalesce(status,'novo')) not in('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado');
 if total_load>=limits.max_active_leads then raise exception 'broker_total_capacity_reached';end if;if project_load>=limits.max_project_leads then raise exception 'broker_project_capacity_reached';end if;return new;
end $$;
drop trigger if exists leads_guard_broker_capacity on public.leads;create trigger leads_guard_broker_capacity before insert or update of assigned_to,status,development_id on public.leads for each row execute function private.guard_broker_portfolio_capacity();
revoke all on function public.configure_broker_capacity(uuid,uuid,uuid,integer,integer,integer,text) from public,anon,authenticated;grant execute on function public.configure_broker_capacity(uuid,uuid,uuid,integer,integer,integer,text) to service_role;
commit;
