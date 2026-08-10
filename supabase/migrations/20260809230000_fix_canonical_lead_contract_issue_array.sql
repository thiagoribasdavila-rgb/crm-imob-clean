begin;

create or replace function private.apply_canonical_lead_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  score integer := 0;
  issues text[] := array[]::text[];
  digits text;
begin
  new.email_normalized := nullif(lower(trim(coalesce(new.email, ''))), '');

  digits := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  if length(digits) in (10, 11) then
    digits := '55' || digits;
  end if;

  new.phone_normalized := case
    when length(digits) between 10 and 15 then digits
    else null
  end;
  new.source_normalized := nullif(lower(trim(coalesce(new.source, ''))), '');
  new.identity_key := case
    when new.phone_normalized is not null then 'phone:' || new.phone_normalized
    when new.email_normalized is not null then 'email:' || new.email_normalized
    else null
  end;
  new.canonical_contract_version := 1;

  if length(trim(coalesce(new.name, ''))) >= 2 then
    score := score + 10;
  else
    issues := array_append(issues, 'name');
  end if;

  if new.phone_normalized is not null or new.email_normalized is not null then
    score := score + 15;
  else
    issues := array_append(issues, 'contact');
  end if;

  if new.source_normalized is not null then
    score := score + 10;
  else
    issues := array_append(issues, 'source');
  end if;

  if new.purpose is not null then
    score := score + 10;
  else
    issues := array_append(issues, 'purpose');
  end if;

  if new.budget_min is not null or new.budget_max is not null then
    score := score + 10;
  else
    issues := array_append(issues, 'budget');
  end if;

  if coalesce(array_length(new.preferred_regions, 1), 0) > 0 then
    score := score + 10;
  else
    issues := array_append(issues, 'regions');
  end if;

  if new.bedrooms is not null then
    score := score + 5;
  else
    issues := array_append(issues, 'bedrooms');
  end if;

  if new.development_id is not null then
    score := score + 10;
  else
    issues := array_append(issues, 'development');
  end if;

  if new.next_action_at is not null then
    score := score + 10;
  else
    issues := array_append(issues, 'next_action');
  end if;

  if coalesce(new.metadata, '{}'::jsonb) ? 'qualification'
    or coalesce(length(trim(new.notes)), 0) > 10 then
    score := score + 10;
  else
    issues := array_append(issues, 'commercial_context');
  end if;

  new.data_quality_percent := score;
  new.data_quality_status := case
    when score >= 90 then 'complete'
    when score >= 70 then 'usable'
    when score >= 40 then 'incomplete'
    else 'critical'
  end;
  new.data_quality_issues := issues;
  new.quality_calculated_at := now();

  return new;
end;
$$;

comment on function private.apply_canonical_lead_contract() is
  'Normaliza o contrato canônico do lead e calcula qualidade sem coerções inválidas entre text e text[].';

commit;
