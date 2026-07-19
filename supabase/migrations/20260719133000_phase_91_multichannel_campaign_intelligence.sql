-- Fase 91: fatos multicanal versionados; sem PII e sem misturar conversao declarada com resultado do CRM.
create table if not exists public.multichannel_campaign_daily_facts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check(platform in('meta','google_ads','youtube','tiktok_ads','portal')), account_key text not null, campaign_key text not null,
  campaign_name text not null, reference_date date not null, development_id uuid references public.developments(id) on delete set null,
  currency text not null default 'BRL' check(currency='BRL'), spend numeric(16,2) not null default 0, impressions bigint not null default 0,
  clicks bigint not null default 0, platform_leads bigint not null default 0, crm_leads bigint not null default 0,
  qualified_leads bigint not null default 0, visits bigint not null default 0, proposals bigint not null default 0, wins bigint not null default 0,
  revenue numeric(16,2) not null default 0, attribution_model text not null check(attribution_model in('platform_reported','first_touch','last_touch','crm_outcome')),
  snapshot_version integer not null, is_current boolean not null default true, source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  imported_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  check(spend>=0 and impressions>=0 and clicks>=0 and platform_leads>=0 and crm_leads>=0 and qualified_leads>=0 and visits>=0 and proposals>=0 and wins>=0 and revenue>=0),
  unique(organization_id,platform,account_key,campaign_key,reference_date,snapshot_version)
);
create unique index if not exists multichannel_campaign_fact_current_uidx on public.multichannel_campaign_daily_facts(organization_id,platform,account_key,campaign_key,reference_date) where is_current;
create index if not exists multichannel_campaign_fact_reporting_idx on public.multichannel_campaign_daily_facts(organization_id,reference_date desc,platform) where is_current;
alter table public.multichannel_campaign_daily_facts enable row level security;
drop policy if exists multichannel_campaign_fact_management_read on public.multichannel_campaign_daily_facts;
create policy multichannel_campaign_fact_management_read on public.multichannel_campaign_daily_facts for select to authenticated using(
  organization_id=(select public.current_organization_id()) and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end) in('director','superintendent','manager'))
);
revoke all on public.multichannel_campaign_daily_facts from anon, authenticated;
grant select on public.multichannel_campaign_daily_facts to authenticated;

create or replace function public.ingest_multichannel_campaign_fact(p_actor_id uuid,p_organization_id uuid,p_platform text,p_account_key text,p_campaign_key text,p_campaign_name text,p_reference_date date,p_development_id uuid,p_spend numeric,p_impressions bigint,p_clicks bigint,p_platform_leads bigint,p_crm_leads bigint,p_qualified_leads bigint,p_visits bigint,p_proposals bigint,p_wins bigint,p_revenue numeric,p_attribution_model text,p_source_hash text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_version integer;v_role text;
begin
 select coalesce(commercial_role,case when role='admin' then 'director' else role end) into v_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 if v_role not in('director','superintendent') then raise exception 'campaign_ingest_forbidden';end if;
 if p_platform not in('meta','google_ads','youtube','tiktok_ads','portal') or p_attribution_model not in('platform_reported','first_touch','last_touch','crm_outcome') or p_source_hash !~ '^[a-f0-9]{64}$' then raise exception 'campaign_fact_invalid';end if;
 if least(p_spend,p_impressions,p_clicks,p_platform_leads,p_crm_leads,p_qualified_leads,p_visits,p_proposals,p_wins,p_revenue)<0 then raise exception 'campaign_metric_negative';end if;
 if p_reference_date>current_date or p_reference_date<current_date-730 then raise exception 'campaign_date_out_of_range';end if;
 if p_development_id is not null and not exists(select 1 from public.developments where id=p_development_id and organization_id=p_organization_id) then raise exception 'campaign_development_out_of_scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_platform||p_account_key||p_campaign_key||p_reference_date::text,0));
 select coalesce(max(snapshot_version),0)+1 into v_version from public.multichannel_campaign_daily_facts where organization_id=p_organization_id and platform=p_platform and account_key=p_account_key and campaign_key=p_campaign_key and reference_date=p_reference_date;
 update public.multichannel_campaign_daily_facts set is_current=false where organization_id=p_organization_id and platform=p_platform and account_key=p_account_key and campaign_key=p_campaign_key and reference_date=p_reference_date and is_current;
 insert into public.multichannel_campaign_daily_facts(organization_id,platform,account_key,campaign_key,campaign_name,reference_date,development_id,spend,impressions,clicks,platform_leads,crm_leads,qualified_leads,visits,proposals,wins,revenue,attribution_model,snapshot_version,source_hash,imported_by) values(p_organization_id,p_platform,p_account_key,p_campaign_key,p_campaign_name,p_reference_date,p_development_id,p_spend,p_impressions,p_clicks,p_platform_leads,p_crm_leads,p_qualified_leads,p_visits,p_proposals,p_wins,p_revenue,p_attribution_model,v_version,p_source_hash,p_actor_id) returning id into v_id;
 return v_id;
end$$;
revoke all on function public.ingest_multichannel_campaign_fact(uuid,uuid,text,text,text,text,date,uuid,numeric,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,text,text) from public,anon,authenticated;
grant execute on function public.ingest_multichannel_campaign_fact(uuid,uuid,text,text,text,text,date,uuid,numeric,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,text,text) to service_role;
