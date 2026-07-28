-- ── O CAMPO QUE FECHA O CICLO ────────────────────────────────────────────────
--
-- `lib/integrations/meta/capi-feedback.ts` lê `lead.sale_value_brl` para emitir
-- o evento de venda para a Meta. A coluna NUNCA existiu: `Number(undefined)` é
-- NaN, o evento era suprimido e contado em `saleWithoutMeasuredValue`, e o
-- worker respondia — com toda honestidade — "venda_sem_valor_apurado".
--
-- Efeito medido em 2026-07-28: o ciclo fechado era ESTRUTURALMENTE impossível.
-- Não importava quantas vendas o corretor registrasse; nenhuma voltaria para a
-- Meta, porque não havia por onde o valor entrar. Mais uma da classe "código e
-- banco divergiram" que atravessou esta sessão inteira.
--
-- POR QUE NÃO REUSAR budget_min/budget_max: são o orçamento DECLARADO pelo
-- cliente na qualificação — intenção, não fato. O próprio código recusa
-- estimar a venda a partir deles, e essa recusa está certa: mandar intenção
-- como se fosse venda ensina o algoritmo com número inventado, e o aprendizado
-- não tem desfazer.
--
-- ROLLBACK (sem perda de dado histórico além do que foi apurado aqui):
--   alter table public.leads drop column if exists sale_value_brl;
--   alter table public.leads drop column if exists sale_value_recorded_at;

alter table public.leads
  add column if not exists sale_value_brl numeric(14, 2),
  add column if not exists sale_value_recorded_at timestamptz;

comment on column public.leads.sale_value_brl is
  'Valor APURADO da venda em BRL — o que de fato foi vendido, não o orçamento declarado (budget_min/max). Alimenta o evento de venda da CAPI. Nulo = ainda não apurado; o evento fica suprimido, nunca estimado.';
comment on column public.leads.sale_value_recorded_at is
  'Quando o valor foi apurado. Distingue "vendeu e ainda não informou" de "vendeu por zero" — sem isso as duas situações são o mesmo NULL.';

-- Valor negativo é erro de digitação, não desconto: barra na entrada em vez de
-- virar evento de conversão negativo na Meta.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_sale_value_brl_nao_negativo'
  ) then
    alter table public.leads
      add constraint leads_sale_value_brl_nao_negativo
      check (sale_value_brl is null or sale_value_brl >= 0);
  end if;
end $$;

-- Consulta do worker da CAPI: ganhos com valor apurado, por organização.
create index if not exists leads_venda_apurada_idx
  on public.leads (organization_id, status)
  where sale_value_brl is not null;
