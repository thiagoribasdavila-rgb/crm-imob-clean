begin;
alter table public.ai_usage_events add column if not exists provider_request_id text;
create index if not exists ai_usage_events_provider_request_idx on public.ai_usage_events (organization_id, provider, provider_request_id) where provider_request_id is not null;
commit;
