-- Phase 7: operational recovery.
-- Additive and idempotent: no existing Atlas user, tenant or business record is changed.

alter table public.campaigns
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null,
  add column if not exists objective text,
  add column if not exists briefing text,
  add column if not exists currency text not null default 'BRL',
  add column if not exists archived_at timestamptz;

create index if not exists idx_campaigns_org_period
  on public.campaigns (organization_id, starts_at desc, created_at desc);
create index if not exists idx_campaigns_responsible
  on public.campaigns (responsible_id) where responsible_id is not null;

create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  development_id uuid references public.developments(id) on delete set null,
  asset_type text not null check (asset_type in ('briefing', 'creative')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  storage_bucket text not null default 'project-materials',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  version integer not null default 1 check (version > 0),
  is_current boolean not null default true,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_bucket, storage_path)
);

create index if not exists idx_campaign_assets_current
  on public.campaign_assets (organization_id, campaign_id, asset_type, created_at desc);

alter table public.campaign_assets enable row level security;

drop policy if exists campaign_assets_org_select on public.campaign_assets;
create policy campaign_assets_org_select
  on public.campaign_assets for select to authenticated
  using (organization_id = (select public.current_organization_id()));

drop policy if exists campaign_assets_leadership_insert on public.campaign_assets;
create policy campaign_assets_leadership_insert
  on public.campaign_assets for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = campaign_assets.organization_id
        and p.active
        and (
          lower(coalesce(p.role, '')) = 'admin'
          or lower(coalesce(p.commercial_role, '')) in ('director', 'superintendent', 'manager')
        )
    )
  );

drop policy if exists campaign_assets_leadership_update on public.campaign_assets;
create policy campaign_assets_leadership_update
  on public.campaign_assets for update to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = campaign_assets.organization_id
        and p.active
        and (
          lower(coalesce(p.role, '')) = 'admin'
          or lower(coalesce(p.commercial_role, '')) in ('director', 'superintendent', 'manager')
        )
    )
  )
  with check (organization_id = (select public.current_organization_id()));

revoke all on public.campaign_assets from anon;
grant select, insert, update on public.campaign_assets to authenticated;
grant all on public.campaign_assets to service_role;

comment on table public.campaign_assets is
  'Versioned internal campaign briefings and creatives. Files remain private in Storage.';
