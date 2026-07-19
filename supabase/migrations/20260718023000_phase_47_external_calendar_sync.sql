begin;
create table if not exists public.calendar_sync_preferences (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, provider text not null check(provider in('google','microsoft')),
  enabled boolean not null default false, direction text not null default 'atlas_to_external' check(direction='atlas_to_external'),
  privacy text not null default 'private' check(privacy in('private','commercial_title')), include_tasks boolean not null default true,
  include_visits boolean not null default true, include_follow_ups boolean not null default true, external_calendar_id text,
  credential_reference text, connected_at timestamptz, disconnected_at timestamptz, last_sync_at timestamptz, last_error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,profile_id,provider),
  check(credential_reference is null or char_length(credential_reference) between 12 and 200)
);
create table if not exists public.calendar_sync_outbox (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, provider text not null check(provider in('google','microsoft')),
  source_kind text not null check(source_kind in('task','visit','follow_up')), source_id uuid not null, operation text not null check(operation in('upsert','delete')),
  status text not null default 'pending' check(status in('pending','processing','delivered','failed','discarded')), attempts integer not null default 0 check(attempts between 0 and 20),
  available_at timestamptz not null default now(), delivered_at timestamptz, error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(profile_id,provider,source_kind,source_id,operation)
);
alter table public.calendar_sync_preferences enable row level security;alter table public.calendar_sync_outbox enable row level security;
create policy calendar_preferences_own on public.calendar_sync_preferences for select to authenticated using(organization_id=(select public.current_organization_id()) and profile_id=auth.uid());
create policy calendar_outbox_own on public.calendar_sync_outbox for select to authenticated using(organization_id=(select public.current_organization_id()) and profile_id=auth.uid());
revoke insert,update,delete on public.calendar_sync_preferences from authenticated,anon;revoke insert,update,delete on public.calendar_sync_outbox from authenticated,anon;
grant select on public.calendar_sync_preferences,public.calendar_sync_outbox to authenticated;grant all on public.calendar_sync_preferences,public.calendar_sync_outbox to service_role;
create index if not exists calendar_sync_outbox_worker_idx on public.calendar_sync_outbox(status,available_at) where status in('pending','failed');
commit;
