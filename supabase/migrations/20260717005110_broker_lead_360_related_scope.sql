begin;

drop policy if exists activities_org_access on public.activities;
drop policy if exists activities_commercial_select on public.activities;
drop policy if exists activities_commercial_insert on public.activities;
drop policy if exists activities_commercial_update on public.activities;
drop policy if exists activities_commercial_delete on public.activities;

create policy activities_commercial_select on public.activities for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and (
    (lead_id is null and user_id = (select auth.uid()))
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to))
    )
  )
);

create policy activities_commercial_insert on public.activities for insert to authenticated
with check (
  organization_id = (select public.current_organization_id())
  and user_id = (select auth.uid())
  and (
    lead_id is null
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to))
    )
  )
);

create policy activities_commercial_update on public.activities for update to authenticated
using (
  organization_id = (select public.current_organization_id())
  and user_id = (select auth.uid())
  and (
    lead_id is null
    or exists (select 1 from public.leads l where l.id = lead_id and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to)))
  )
)
with check (
  organization_id = (select public.current_organization_id())
  and user_id = (select auth.uid())
  and (
    lead_id is null
    or exists (select 1 from public.leads l where l.id = lead_id and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to)))
  )
);

create policy activities_commercial_delete on public.activities for delete to authenticated
using (
  organization_id = (select public.current_organization_id())
  and user_id = (select auth.uid())
  and (
    lead_id is null
    or exists (select 1 from public.leads l where l.id = lead_id and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to)))
  )
);

drop policy if exists lead_experience_signals_scope on public.lead_experience_signals;
create policy lead_experience_signals_scope on public.lead_experience_signals for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to))
  )
);

commit;
