drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated using (id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists org_update_admin on public.organizations;
create policy org_update_admin on public.organizations for update to authenticated using (id = (select organization_id from public.profiles where id = (select auth.uid())) and exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin','manager'))) with check (id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists profiles_select_org on public.profiles;
create policy profiles_select_org on public.profiles for select to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists leads_org_access on public.leads;
create policy leads_org_access on public.leads for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists pipeline_org_access on public.pipeline;
create policy pipeline_org_access on public.pipeline for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists properties_org_access on public.properties;
create policy properties_org_access on public.properties for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists customers_org_access on public.customers;
create policy customers_org_access on public.customers for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists developments_org_access on public.developments;
create policy developments_org_access on public.developments for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists units_org_access on public.units;
create policy units_org_access on public.units for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists opportunities_org_access on public.opportunities;
create policy opportunities_org_access on public.opportunities for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists activities_org_access on public.activities;
create policy activities_org_access on public.activities for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists tasks_org_access on public.tasks;
create policy tasks_org_access on public.tasks for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists campaigns_org_access on public.campaigns;
create policy campaigns_org_access on public.campaigns for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists ai_insights_org_access on public.ai_insights;
create policy ai_insights_org_access on public.ai_insights for all to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid()))) with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists audit_logs_org_select on public.audit_logs;
create policy audit_logs_org_select on public.audit_logs for select to authenticated using (organization_id = (select organization_id from public.profiles where id = (select auth.uid())) and exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin','manager')));

drop policy if exists audit_logs_org_insert on public.audit_logs;
create policy audit_logs_org_insert on public.audit_logs for insert to authenticated with check (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));

drop policy if exists "tenant feature flags isolation" on public.feature_flags;
drop policy if exists "tenant feature flags management" on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select to authenticated using (organization_id is null or organization_id = (select public.current_organization_id()));
create policy feature_flags_insert on public.feature_flags for insert to authenticated with check (organization_id = (select public.current_organization_id()) and (select public.current_user_role()) in ('admin','manager'));
create policy feature_flags_update on public.feature_flags for update to authenticated using (organization_id = (select public.current_organization_id()) and (select public.current_user_role()) in ('admin','manager')) with check (organization_id = (select public.current_organization_id()) and (select public.current_user_role()) in ('admin','manager'));
create policy feature_flags_delete on public.feature_flags for delete to authenticated using (organization_id = (select public.current_organization_id()) and (select public.current_user_role()) in ('admin','manager'));
