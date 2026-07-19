-- Oportunidades seguem o mesmo escopo hierárquico do lead relacionado.
drop policy if exists opportunities_org_access on public.opportunities;
drop policy if exists opportunities_commercial_select on public.opportunities;
drop policy if exists opportunities_commercial_insert on public.opportunities;
drop policy if exists opportunities_commercial_update on public.opportunities;
drop policy if exists opportunities_commercial_delete on public.opportunities;

create policy opportunities_commercial_select on public.opportunities for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.commercial_role, case when p.role = 'admin' then 'director' else p.role end) = 'director')
    or exists (select 1 from public.leads l where l.id = lead_id and private.can_access_commercial_lead(l.organization_id,l.assigned_to))
  )
);
create policy opportunities_commercial_insert on public.opportunities for insert to authenticated with check (
  organization_id = public.current_organization_id()
  and exists (select 1 from public.leads l where l.id = lead_id and private.can_access_commercial_lead(l.organization_id,l.assigned_to))
);
create policy opportunities_commercial_update on public.opportunities for update to authenticated using (
  organization_id = public.current_organization_id()
  and exists (select 1 from public.leads l where l.id = lead_id and private.can_access_commercial_lead(l.organization_id,l.assigned_to))
) with check (
  organization_id = public.current_organization_id()
  and exists (select 1 from public.leads l where l.id = lead_id and private.can_access_commercial_lead(l.organization_id,l.assigned_to))
);
create policy opportunities_commercial_delete on public.opportunities for delete to authenticated using (
  organization_id = public.current_organization_id()
  and exists (select 1 from public.leads l where l.id = lead_id and private.can_access_commercial_lead(l.organization_id,l.assigned_to))
);
