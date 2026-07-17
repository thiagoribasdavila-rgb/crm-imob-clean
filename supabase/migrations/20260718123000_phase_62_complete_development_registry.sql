begin;

alter table public.developments
  add column if not exists project_code text,
  add column if not exists slug text,
  add column if not exists address_line text,
  add column if not exists postal_code text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists market_segment text,
  add column if not exists product_type text,
  add column if not exists typologies text[] not null default '{}',
  add column if not exists bedrooms_min smallint,
  add column if not exists bedrooms_max smallint,
  add column if not exists private_area_min numeric(12,2),
  add column if not exists private_area_max numeric(12,2),
  add column if not exists price_min numeric(16,2),
  add column if not exists price_max numeric(16,2),
  add column if not exists total_units integer,
  add column if not exists sales_cycle_status text not null default 'planning',
  add column if not exists sales_start_date date,
  add column if not exists sales_end_date date,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists developments_org_project_code_unique on public.developments(organization_id,project_code) where project_code is not null;
create unique index if not exists developments_org_slug_unique on public.developments(organization_id,slug) where slug is not null;
create index if not exists developments_org_cycle_idx on public.developments(organization_id,sales_cycle_status,developer_id);

create table if not exists public.development_profile_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  event_type text not null check(event_type in('created','updated','cycle_changed')),
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.development_profile_events enable row level security;
drop policy if exists development_profile_events_scope on public.development_profile_events;
create policy development_profile_events_scope on public.development_profile_events for select to authenticated using(organization_id=(select public.current_organization_id()));
revoke all on public.development_profile_events from anon;
revoke insert,update,delete on public.development_profile_events from authenticated;
grant select on public.development_profile_events to authenticated;

create or replace function public.upsert_complete_development(
  p_actor_id uuid,p_organization_id uuid,p_development_id uuid,p_developer_id uuid,p_name text,p_project_code text,
  p_address_line text,p_neighborhood text,p_city text,p_state text,p_postal_code text,p_latitude numeric,p_longitude numeric,
  p_market_segment text,p_product_type text,p_typologies text[],p_bedrooms_min smallint,p_bedrooms_max smallint,
  p_private_area_min numeric,p_private_area_max numeric,p_price_min numeric,p_price_max numeric,p_total_units integer,
  p_status text,p_sales_cycle_status text,p_launch_date date,p_sales_start_date date,p_sales_end_date date,p_delivery_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; developer public.developers; target public.developments; normalized_slug text; event_name text;
begin
  select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  if actor_role not in('director','superintendent') then raise exception 'development_actor_forbidden'; end if;
  select * into developer from public.developers where id=p_developer_id and organization_id=p_organization_id and status in('active','onboarding');
  if developer.id is null then raise exception 'development_developer_invalid'; end if;
  if char_length(trim(coalesce(p_name,'')))<2 or char_length(trim(coalesce(p_project_code,'')))<2 then raise exception 'development_identity_invalid'; end if;
  if p_state is not null and char_length(trim(p_state))<>2 then raise exception 'development_state_invalid'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) or p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'development_coordinates_invalid'; end if;
  if coalesce(p_bedrooms_min,0)<0 or coalesce(p_bedrooms_max,0)<0 or p_bedrooms_min is not null and p_bedrooms_max is not null and p_bedrooms_min>p_bedrooms_max then raise exception 'development_bedrooms_range_invalid'; end if;
  if coalesce(p_private_area_min,0)<0 or coalesce(p_private_area_max,0)<0 or p_private_area_min is not null and p_private_area_max is not null and p_private_area_min>p_private_area_max then raise exception 'development_area_range_invalid'; end if;
  if coalesce(p_price_min,0)<0 or coalesce(p_price_max,0)<0 or p_price_min is not null and p_price_max is not null and p_price_min>p_price_max then raise exception 'development_price_range_invalid'; end if;
  if p_total_units is not null and p_total_units<0 then raise exception 'development_units_invalid'; end if;
  if p_sales_start_date is not null and p_sales_end_date is not null and p_sales_start_date>p_sales_end_date then raise exception 'development_sales_dates_invalid'; end if;
  if p_sales_cycle_status not in('planning','pre_launch','launch','sales','sold_out','delivered','suspended','cancelled') then raise exception 'development_cycle_invalid'; end if;
  normalized_slug:=trim(both '-' from lower(regexp_replace(trim(p_name),'[^a-zA-Z0-9]+','-','g')));
  if p_development_id is null then
    insert into public.developments(organization_id,developer_id,developer_name,name,project_code,slug,address_line,neighborhood,city,state,postal_code,latitude,longitude,market_segment,product_type,typologies,bedrooms_min,bedrooms_max,private_area_min,private_area_max,price_min,price_max,total_units,status,sales_cycle_status,launch_date,sales_start_date,sales_end_date,delivery_date)
    values(p_organization_id,developer.id,developer.trade_name,trim(p_name),upper(trim(p_project_code)),normalized_slug,nullif(trim(p_address_line),''),nullif(trim(p_neighborhood),''),nullif(trim(p_city),''),nullif(upper(trim(p_state)),''),nullif(regexp_replace(coalesce(p_postal_code,''),'\D','','g'),''),p_latitude,p_longitude,nullif(trim(p_market_segment),''),nullif(trim(p_product_type),''),coalesce(p_typologies,'{}'),p_bedrooms_min,p_bedrooms_max,p_private_area_min,p_private_area_max,p_price_min,p_price_max,p_total_units,p_status,p_sales_cycle_status,p_launch_date,p_sales_start_date,p_sales_end_date,p_delivery_date) returning * into target;
    event_name:='created';
  else
    update public.developments set developer_id=developer.id,developer_name=developer.trade_name,name=trim(p_name),project_code=upper(trim(p_project_code)),slug=normalized_slug,address_line=nullif(trim(p_address_line),''),neighborhood=nullif(trim(p_neighborhood),''),city=nullif(trim(p_city),''),state=nullif(upper(trim(p_state)),''),postal_code=nullif(regexp_replace(coalesce(p_postal_code,''),'\D','','g'),''),latitude=p_latitude,longitude=p_longitude,market_segment=nullif(trim(p_market_segment),''),product_type=nullif(trim(p_product_type),''),typologies=coalesce(p_typologies,'{}'),bedrooms_min=p_bedrooms_min,bedrooms_max=p_bedrooms_max,private_area_min=p_private_area_min,private_area_max=p_private_area_max,price_min=p_price_min,price_max=p_price_max,total_units=p_total_units,status=p_status,sales_cycle_status=p_sales_cycle_status,launch_date=p_launch_date,sales_start_date=p_sales_start_date,sales_end_date=p_sales_end_date,delivery_date=p_delivery_date,updated_at=now() where id=p_development_id and organization_id=p_organization_id returning * into target;
    if target.id is null then raise exception 'development_not_found'; end if; event_name:='updated';
  end if;
  insert into public.development_profile_events(organization_id,development_id,actor_id,event_type,changed_fields) values(p_organization_id,target.id,p_actor_id,event_name,array['commercial_profile']);
  return jsonb_build_object('development',to_jsonb(target),'canonicalDeveloper',jsonb_build_object('id',developer.id,'tradeName',developer.trade_name),'completeRegistry',true,'auditable',true);
end $$;
revoke all on function public.upsert_complete_development(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,numeric,numeric,text,text,text[],smallint,smallint,numeric,numeric,numeric,numeric,integer,text,text,date,date,date,date) from public,anon,authenticated;
grant execute on function public.upsert_complete_development(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,numeric,numeric,text,text,text[],smallint,smallint,numeric,numeric,numeric,numeric,integer,text,text,date,date,date,date) to service_role;
commit;
