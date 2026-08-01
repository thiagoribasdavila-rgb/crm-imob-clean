-- ── ROLLBACK de 20260730010000_oferta_ativa_do_acervo_de_resgate ────────────
--
-- ⚠ POR QUE ESTE ARQUIVO NÃO MORA EM `supabase/migrations/` ────────────────────
-- Um `.down.sql` ao lado da migration cria uma VERSÃO DUPLICADA (o `db push`
-- deriva a versão do prefixo do nome) e o push ABORTA no último arquivo — depois
-- de já ter aplicado os anteriores. Medido em 2026-07-29. Rollback vive fora.
--
-- ── O QUE ELE DESFAZ ────────────────────────────────────────────────────────
-- Devolve `apply_first_contact_sla` ao texto EXATO lido de `pg_get_functiondef`
-- em 2026-07-30 (a versão de 20260726020000, vocabulário de origem), remove as
-- duas funções novas, o predicado, o índice e a coluna `rescue_minutes`.
--
-- ── O QUE ELE REABRE, E POR ISSO NÃO É POSIÇÃO DE REPOUSO ───────────────────
-- 1) Volta a carimbar prazo de primeiro contato em lead de ACERVO. Medido: as 13
--    leads já migradas nasceram com prazo VENCIDO (06/06 a 14/07) por causa
--    desse cálculo. Com as 16.721 que faltam, a central passa a mostrar ~17 mil
--    violações de gente que nunca pediu contato.
-- 2) O corretor perde o auto-atendimento em LOTE — e continua com o
--    auto-atendimento UMA POR VEZ que já existe hoje pelo fallback de
--    `action=accept_assignment`, que grava só `assigned_user_id` e passa por
--    baixo do teto de carteira. Ou seja: o rollback não fecha a porta errada,
--    só fecha a porta certa.
--
-- ── O QUE ELE NÃO TOCA, DE PROPÓSITO ────────────────────────────────────────
-- Nada de dado: as leads já pegadas FICAM com seus donos, seus prazos de 24h,
-- seu `metadata.acervo`, seu rastro em `lead_distribution_history`,
-- `lead_events` e `lead_assignment_reservations`. Devolver leads pegas ao balcão
-- tiraria da carteira de alguém trabalho que ele já assumiu.

begin;

drop function if exists public.reservar_leads_do_acervo(uuid, uuid, integer);
drop function if exists public.oferta_do_acervo(uuid, uuid, integer);

-- O texto restaurado é o de 20260726020000, palavra por palavra.
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

revoke all on function public.apply_first_contact_sla() from public, anon, authenticated;

-- O predicado sai por último: as duas funções acima dependiam dele.
drop function if exists private.lead_esta_no_acervo_de_resgate(public.leads);
drop index if exists public.leads_acervo_de_resgate_idx;

alter table public.first_contact_sla_policies
  drop constraint if exists first_contact_sla_policies_rescue_minutes_check;
alter table public.first_contact_sla_policies
  drop column if exists rescue_minutes;

commit;
