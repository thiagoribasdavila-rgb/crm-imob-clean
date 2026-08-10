-- Explicit responsible developer for each campaign.
-- Additive and idempotent; legacy campaigns continue to inherit the developer
-- from their linked development in application reports.

alter table public.campaigns
  add column if not exists developer_id uuid references public.developers(id) on delete set null;

create index if not exists idx_campaigns_org_developer
  on public.campaigns (organization_id, developer_id)
  where developer_id is not null;

comment on column public.campaigns.developer_id is
  'Incorporadora responsável pela campanha. When null, reports may inherit the linked development developer.';
