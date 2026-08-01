begin;
create table if not exists public.task_reminders(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete cascade,assigned_to uuid not null references public.profiles(id),kind text not null check(kind in('upcoming','overdue')),
 task_due_at timestamptz not null,priority text not null,created_at timestamptz not null default now(),read_at timestamptz,dismissed_at timestamptz,
 unique(task_id,kind,task_due_at)
);
create index if not exists task_reminders_assignee_open_idx on public.task_reminders(organization_id,assigned_to,created_at desc) where dismissed_at is null;
alter table public.task_reminders enable row level security;
create policy task_reminders_scope on public.task_reminders for select to authenticated using(organization_id=(select public.current_organization_id()) and (assigned_to=(select auth.uid()) or (select private.can_view_commercial_profile(assigned_to))));
create policy task_reminders_own_update on public.task_reminders for update to authenticated using(organization_id=(select public.current_organization_id()) and assigned_to=(select auth.uid())) with check(organization_id=(select public.current_organization_id()) and assigned_to=(select auth.uid()));
revoke insert,delete on public.task_reminders from authenticated,anon;grant select,update on public.task_reminders to authenticated;grant all on public.task_reminders to service_role;

create or replace function public.generate_smart_task_reminders(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' as $$
declare generated integer:=0;
begin
 with candidates as(
  select t.id,t.organization_id,t.assigned_to,t.due_at,lower(coalesce(t.priority,'normal')) priority,
   case when t.due_at<now() then 'overdue' else 'upcoming' end kind
  from public.tasks t where t.assigned_to is not null and t.due_at is not null and lower(coalesce(t.status,'')) not in('done','concluido','concluida','completed','cancelado','cancelled')
   and (t.due_at<now() or (lower(coalesce(t.priority,'')) in('alta','high','critical') and t.due_at<=now()+interval '24 hours') or (lower(coalesce(t.priority,'')) in('media','medium','normal') and t.due_at<=now()+interval '4 hours') or (lower(coalesce(t.priority,'')) in('baixa','low') and t.due_at<=now()+interval '1 hour'))
  order by t.due_at limit least(greatest(p_limit,1),2000)
 ),inserted as(
  insert into public.task_reminders(organization_id,task_id,assigned_to,kind,task_due_at,priority)
  select organization_id,id,assigned_to,kind,due_at,priority from candidates on conflict(task_id,kind,task_due_at) do nothing returning 1
 ) select count(*) into generated from inserted;
 return jsonb_build_object('generated',generated);
end $$;
revoke all on function public.generate_smart_task_reminders(integer) from public,anon,authenticated;grant execute on function public.generate_smart_task_reminders(integer) to service_role;
commit;
