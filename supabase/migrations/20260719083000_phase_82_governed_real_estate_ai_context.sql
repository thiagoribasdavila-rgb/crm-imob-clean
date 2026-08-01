begin;
create table if not exists public.ai_context_manifests(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid references public.profiles(id) on delete set null,purpose text not null,task text not null check(task in('fast','commercial','reasoning','research')),
 data_class text not null check(data_class in('public','internal','personal')),sections text[] not null,field_count integer not null check(field_count>=0),lead_context_included boolean not null,direct_identifiers_included boolean not null default false,raw_text_included boolean not null default false,
 external_provider_allowed boolean not null,context_fingerprint text not null,policy_version integer not null default 1,created_at timestamptz not null default now()
);
create index if not exists ai_context_manifests_org_time_idx on public.ai_context_manifests(organization_id,created_at desc);alter table public.ai_context_manifests enable row level security;drop policy if exists ai_context_manifests_scope on public.ai_context_manifests;create policy ai_context_manifests_scope on public.ai_context_manifests for select to authenticated using(organization_id=(select public.current_organization_id()));revoke all on public.ai_context_manifests from anon;revoke insert,update,delete on public.ai_context_manifests from authenticated;grant select on public.ai_context_manifests to authenticated;grant all on public.ai_context_manifests to service_role;
commit;
