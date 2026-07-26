-- =============================================================================
-- SLA de primeiro contato: reconhecer o vocabulário de origem que o produto usa
-- =============================================================================
--
-- PROBLEMA MEDIDO EM 2026-07-26
-- A função apply_first_contact_sla escolhia o prazo curto comparando:
--     lower(source) in ('meta lead ads','meta','facebook','instagram')
-- Mas o valor que o produto grava é 'meta_ads' — usado pelo webhook da Meta,
-- pelos importadores e pelo campaign-performance. Resultado: das 201 leads de
-- meta_ads na base, ZERO recebeu o prazo de 5 minutos; todas caíram no padrão
-- de 15. Lead de Lead Ads tem meia-vida curta: 5 contra 15 minutos é a
-- diferença entre falar com a pessoa e cair na caixa postal.
--
-- O QUE MUDA
-- Só a normalização da origem. A política, os prazos e o cálculo continuam os
-- mesmos; passa a existir uma função dedicada para classificar a origem, o que
-- evita repetir a lista literal em cada lugar que precise dela.
--
-- O QUE NÃO MUDA
-- Nenhum dado é reescrito. Os first_contact_due_at já calculados permanecem:
-- recalcular prazo de lead vencida há dois meses não recupera nada e falsearia
-- o histórico de cumprimento. A correção vale das próximas leads em diante.
-- =============================================================================

create or replace function public.is_paid_social_source(p_source text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  -- Aceita as grafias legadas e as que o produto realmente grava hoje.
  -- Normaliza separador para que 'meta_ads', 'meta-ads' e 'meta ads' casem.
  select replace(replace(lower(coalesce(p_source, '')), '_', ' '), '-', ' ') in (
    'meta lead ads', 'meta ads', 'meta',
    'facebook', 'facebook ads', 'fb',
    'instagram', 'instagram ads', 'ig'
  );
$$;

comment on function public.is_paid_social_source(text) is
  'Origem de mídia social paga, com SLA de primeiro contato curto. Normaliza _ e - para espaço, de modo que meta_ads e meta-ads casem com "meta ads".';

create or replace function public.apply_first_contact_sla()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  policy_row public.first_contact_sla_policies%rowtype;
  minutes_value integer;
begin
  if new.first_contacted_at is not null or new.last_interaction_at is not null then
    return new;
  end if;

  select * into policy_row
  from public.first_contact_sla_policies
  where organization_id = new.organization_id;

  if policy_row.organization_id is null then
    policy_row.enabled := true;
    policy_row.default_minutes := 15;
    policy_row.meta_minutes := 5;
  end if;

  if not coalesce(policy_row.enabled, true) then
    return new;
  end if;

  -- Única alteração de comportamento: a classificação da origem passa pela
  -- função, em vez da lista literal que não reconhecia 'meta_ads'.
  minutes_value := case
    when public.is_paid_social_source(new.source) then coalesce(policy_row.meta_minutes, 5)
    else coalesce(policy_row.default_minutes, 15)
  end;

  new.first_contact_sla_minutes := coalesce(new.first_contact_sla_minutes, minutes_value);
  new.first_contact_due_at := coalesce(
    new.first_contact_due_at,
    coalesce(new.created_at, now()) + make_interval(mins => new.first_contact_sla_minutes)
  );

  return new;
end
$function$;
