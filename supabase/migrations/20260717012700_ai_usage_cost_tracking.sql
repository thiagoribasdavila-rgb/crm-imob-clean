begin;
alter table public.ai_usage_events add column if not exists input_cost_usd numeric(14,8);
alter table public.ai_usage_events add column if not exists output_cost_usd numeric(14,8);
alter table public.ai_usage_events add column if not exists estimated_cost_usd numeric(14,8);
alter table public.ai_usage_events drop constraint if exists ai_usage_cost_non_negative;
alter table public.ai_usage_events add constraint ai_usage_cost_non_negative check (
  coalesce(input_cost_usd, 0) >= 0 and coalesce(output_cost_usd, 0) >= 0 and coalesce(estimated_cost_usd, 0) >= 0
);
create index if not exists ai_usage_events_org_cost_idx on public.ai_usage_events (organization_id, created_at desc) include (provider, task, estimated_cost_usd);
commit;
