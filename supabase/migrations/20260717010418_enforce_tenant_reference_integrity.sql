begin;

create or replace function private.enforce_atlas_relationship_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.atlas_entities entity
    where entity.id = new.from_entity_id
      and entity.organization_id = new.organization_id
  ) or not exists (
    select 1 from public.atlas_entities entity
    where entity.id = new.to_entity_id
      and entity.organization_id = new.organization_id
  ) then
    raise exception 'Relacionamento entre empresas diferentes não é permitido.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_atlas_relationship_tenant() from public, anon, authenticated;

drop trigger if exists enforce_atlas_relationship_tenant on public.atlas_relationships;
create trigger enforce_atlas_relationship_tenant
before insert or update of organization_id, from_entity_id, to_entity_id
on public.atlas_relationships
for each row execute function private.enforce_atlas_relationship_tenant();

create or replace function private.enforce_inventory_reservation_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.property_id is not null and not exists (
    select 1 from public.properties property
    where property.id = new.property_id
      and property.organization_id = new.organization_id
  ) then
    raise exception 'Unidade fora da empresa da reserva.' using errcode = '23514';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'Cliente fora da empresa da reserva.' using errcode = '23514';
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads lead
    where lead.id = new.lead_id
      and lead.organization_id = new.organization_id
  ) then
    raise exception 'Lead fora da empresa da reserva.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_inventory_reservation_tenant() from public, anon, authenticated;

drop trigger if exists enforce_inventory_reservation_tenant on public.atlas_inventory_reservations;
create trigger enforce_inventory_reservation_tenant
before insert or update of organization_id, property_id, customer_id, lead_id
on public.atlas_inventory_reservations
for each row execute function private.enforce_inventory_reservation_tenant();

commit;
