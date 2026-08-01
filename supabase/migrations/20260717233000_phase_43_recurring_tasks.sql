begin;
create table if not exists public.task_recurrences (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, description text, priority text not null, lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id), cadence text not null check(cadence in('daily','weekly','monthly')),
  next_run_at timestamptz not null, ends_at timestamptz not null, max_occurrences integer not null check(max_occurrences between 2 and 100),
  occurrences integer not null default 1 check(occurrences>=1), active boolean not null default true,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ends_at>=next_run_at), check(char_length(title) between 3 and 120)
);
alter table public.tasks add column if not exists recurrence_id uuid references public.task_recurrences(id) on delete set null;
alter table public.tasks add column if not exists recurrence_occurrence integer;
create unique index if not exists tasks_recurrence_occurrence_unique on public.tasks(recurrence_id,recurrence_occurrence) where recurrence_id is not null;
create index if not exists task_recurrences_due_idx on public.task_recurrences(active,next_run_at) where active=true;
alter table public.task_recurrences enable row level security;
create policy task_recurrences_scope on public.task_recurrences for select to authenticated using(organization_id=(select public.current_organization_id()) and (select private.can_view_commercial_profile(assigned_to)));
revoke insert,update,delete on public.task_recurrences from authenticated,anon;grant select on public.task_recurrences to authenticated;grant all on public.task_recurrences to service_role;

create or replace function public.create_recurring_task(p_actor uuid,p_organization uuid,p_title text,p_description text,p_due_at timestamptz,p_priority text,p_lead_id uuid,p_assigned_to uuid,p_cadence text,p_ends_at timestamptz,p_max integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recurrence_id uuid;task_id uuid;next_at timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_actor and organization_id=p_organization and active=true) then raise exception 'recurrence_actor_invalid';end if;
  if p_cadence not in('daily','weekly','monthly') or p_max not between 2 and 100 or p_due_at<=now() or p_ends_at<=p_due_at then raise exception 'recurrence_rule_invalid';end if;
  if not exists(select 1 from public.profiles where id=p_assigned_to and organization_id=p_organization and active=true) then raise exception 'recurrence_assignee_invalid';end if;
  if p_lead_id is not null and not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization and assigned_to=p_assigned_to) then raise exception 'recurrence_lead_owner_invalid';end if;
  next_at:=case p_cadence when 'daily' then p_due_at+interval '1 day' when 'weekly' then p_due_at+interval '1 week' else p_due_at+interval '1 month' end;
  if next_at>p_ends_at then raise exception 'recurrence_without_next_occurrence';end if;
  insert into public.task_recurrences(organization_id,title,description,priority,lead_id,assigned_to,cadence,next_run_at,ends_at,max_occurrences,created_by) values(p_organization,left(trim(p_title),120),nullif(left(trim(coalesce(p_description,'')),2000),''),p_priority,p_lead_id,p_assigned_to,p_cadence,next_at,p_ends_at,p_max,p_actor) returning id into recurrence_id;
  insert into public.tasks(organization_id,title,description,due_at,priority,status,lead_id,assigned_to,recurrence_id,recurrence_occurrence) values(p_organization,left(trim(p_title),120),nullif(left(trim(coalesce(p_description,'')),2000),''),p_due_at,p_priority,'pendente',p_lead_id,p_assigned_to,recurrence_id,1) returning id into task_id;
  return jsonb_build_object('taskId',task_id,'recurrenceId',recurrence_id,'nextRunAt',next_at);
end $$;
revoke all on function public.create_recurring_task(uuid,uuid,text,text,timestamptz,text,uuid,uuid,text,timestamptz,integer) from public,anon,authenticated;grant execute on function public.create_recurring_task(uuid,uuid,text,text,timestamptz,text,uuid,uuid,text,timestamptz,integer) to service_role;

create or replace function public.process_due_task_recurrences(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.task_recurrences%rowtype;generated integer:=0;next_at timestamptz;effective_assignee uuid;
begin
  for row in select * from public.task_recurrences where active=true and next_run_at<=now() order by next_run_at limit least(greatest(p_limit,1),500) for update skip locked loop
    effective_assignee:=row.assigned_to;if row.lead_id is not null then select assigned_to into effective_assignee from public.leads where id=row.lead_id and organization_id=row.organization_id;if effective_assignee is null then update public.task_recurrences set active=false,updated_at=now() where id=row.id;continue;end if;end if;
    insert into public.tasks(organization_id,title,description,due_at,priority,status,lead_id,assigned_to,recurrence_id,recurrence_occurrence) values(row.organization_id,row.title,row.description,row.next_run_at,row.priority,'pendente',row.lead_id,effective_assignee,row.id,row.occurrences+1) on conflict(recurrence_id,recurrence_occurrence) where recurrence_id is not null do nothing;
    if found then generated:=generated+1;end if;
    next_at:=case row.cadence when 'daily' then row.next_run_at+interval '1 day' when 'weekly' then row.next_run_at+interval '1 week' else row.next_run_at+interval '1 month' end;
    update public.task_recurrences set assigned_to=effective_assignee,occurrences=occurrences+1,next_run_at=next_at,active=not(occurrences+1>=max_occurrences or next_at>ends_at),updated_at=now() where id=row.id;
  end loop;
  return jsonb_build_object('generated',generated);
end $$;
revoke all on function public.process_due_task_recurrences(integer) from public,anon,authenticated;grant execute on function public.process_due_task_recurrences(integer) to service_role;
commit;
