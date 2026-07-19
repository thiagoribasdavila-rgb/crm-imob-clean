begin;

create or replace function public.guard_property_feedback_presentation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  property_id_text text;
  feedback_signal text;
  feedback_reason text;
begin
  if new.type <> 'property_feedback' then return new; end if;
  property_id_text := new.metadata ->> 'propertyId';
  feedback_signal := new.metadata ->> 'signal';
  feedback_reason := new.metadata ->> 'reason';

  if property_id_text is null or feedback_signal not in ('interested', 'rejected') then
    raise exception 'Retorno de imóvel inválido.';
  end if;
  if feedback_signal = 'rejected' and coalesce(feedback_reason, '') not in ('price','location','typology','payment','delivery','product','other') then
    raise exception 'Informe o motivo estruturado da não aderência.';
  end if;
  if not exists (
    select 1 from public.activities presentation
    where presentation.organization_id = new.organization_id
      and presentation.lead_id = new.lead_id
      and presentation.type = 'property_presentation'
      and presentation.metadata -> 'propertyIds' @> jsonb_build_array(property_id_text)
      and presentation.occurred_at <= coalesce(new.occurred_at, now())
  ) then
    raise exception 'Retorno sem apresentação prévia para esta lead e imóvel.';
  end if;
  return new;
end;
$$;

drop trigger if exists activities_guard_property_feedback_presentation on public.activities;
create trigger activities_guard_property_feedback_presentation
before insert or update of type, metadata, organization_id, lead_id, occurred_at on public.activities
for each row execute function public.guard_property_feedback_presentation();

revoke all on function public.guard_property_feedback_presentation() from public, anon, authenticated;

commit;
