begin;

create or replace function public.guard_property_presentation_inventory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  property_id_text text;
  property_status text;
begin
  if new.type <> 'property_presentation' then return new; end if;
  if new.metadata is null
     or jsonb_typeof(new.metadata -> 'propertyIds') is distinct from 'array'
     or jsonb_array_length(new.metadata -> 'propertyIds') < 1
     or jsonb_array_length(new.metadata -> 'propertyIds') > 3 then
    raise exception 'A apresentação deve conter entre uma e três unidades.';
  end if;

  for property_id_text in select jsonb_array_elements_text(new.metadata -> 'propertyIds') loop
    select lower(trim(status)) into property_status
    from public.properties
    where id = property_id_text::uuid and organization_id = new.organization_id;
    if property_status is null or property_status not in ('ativo','available','disponivel','disponível','livre','em estoque') then
      raise exception 'Unidade indisponível ou fora do portfólio; atualize o estoque antes de apresentar.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists activities_guard_property_presentation_inventory on public.activities;
create trigger activities_guard_property_presentation_inventory
before insert or update of type, metadata, organization_id on public.activities
for each row execute function public.guard_property_presentation_inventory();

revoke all on function public.guard_property_presentation_inventory() from public, anon, authenticated;

commit;
