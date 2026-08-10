begin;

-- These functions exist exclusively as trigger implementations. PostgreSQL
-- triggers do not need API clients to have EXECUTE on their functions, so
-- removing direct access closes an unnecessary Data API surface.
alter function public.apply_opportunity_commission_sla()
  set search_path = '';
alter function public.refresh_commission_status()
  set search_path = '';
alter function public.scaffold_project_intelligence()
  set search_path = '';

revoke all on function public.apply_opportunity_commission_sla()
  from public, anon, authenticated;
revoke all on function public.refresh_commission_status()
  from public, anon, authenticated;
revoke all on function public.scaffold_project_intelligence()
  from public, anon, authenticated;

-- The kept indexes have the same key order and semantics as the removed
-- indexes. Dropping only the duplicates reduces write amplification without
-- changing query coverage.
drop index if exists public.idx_ai_insights_org_rls;
drop index if exists public.idx_campaigns_org_rls;
drop index if exists public.dead_letter_org_resolved_created_idx;

commit;
