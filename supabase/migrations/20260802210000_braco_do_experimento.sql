-- O BRAÇO DO EXPERIMENTO COMO COLUNA DE PRIMEIRA CLASSE.
--
-- ── ESCRITA E NÃO APLICADA ─────────────────────────────────────────────────
--
-- Aplicar migration em produção é decisão do dono. Enquanto ela não entrar, o
-- código NÃO depende dela: `lib/ai/jornada-em-sombra.ts` grava o braço dentro
-- de `context_snapshot` (jsonb que já existe e é NOT NULL com default), e a
-- jornada nasce funcionando contra o banco que existe hoje.
--
-- ── POR QUE A COLUNA MESMO ASSIM ───────────────────────────────────────────
--
-- Dentro do jsonb o braço é gravável, legível e INCONFERÍVEL pelo banco: nada
-- impede uma escrita futura pôr "IA", "ia " ou "teste" ali, e o dia em que a
-- comparação for lida ninguém vai saber que metade das linhas está fora do
-- vocabulário. O CHECK abaixo é o que transforma o braço em fato do esquema.
--
-- O índice existe porque a única leitura que este campo vai receber é
-- "agrupe por braço dentro da organização" — que é a consulta da comparação.
--
-- ── O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO ─────────────────────────────
--
-- Não faz backfill. O braço é função pura do id da lead
-- (`lib/ai/braco-do-experimento.ts`), então preencher a coluna exige rodar o
-- MESMO hash que o código roda — e um backfill escrito em SQL seria uma segunda
-- implementação da mesma regra, que é a classe de defeito que este repositório
-- mais pagou (duas verdades que divergem em silêncio). O preenchimento das
-- linhas já existentes é trabalho de um passo de código que lê o
-- `context_snapshot` que já está lá.
--
-- Não mexe em RLS: `ai_sales_journeys` já tem `enable row level security`, a
-- policy `ai_sales_journeys_scope` e os grants revogados desde
-- 20260717002420_nightly_ai_sales_journeys.sql. Coluna nova herda a cerca da
-- tabela.

begin;

alter table public.ai_sales_journeys
  add column if not exists braco text,
  add column if not exists coorte text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_sales_journeys'::regclass
      and conname = 'ai_sales_journeys_braco_check'
  ) then
    alter table public.ai_sales_journeys
      add constraint ai_sales_journeys_braco_check
      check (braco is null or braco in ('ia', 'humano'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_sales_journeys'::regclass
      and conname = 'ai_sales_journeys_coorte_check'
  ) then
    alter table public.ai_sales_journeys
      add constraint ai_sales_journeys_coorte_check
      check (coorte is null or coorte in ('entrada', 'acervo'));
  end if;
end
$$;

-- `braco is null` é aceito pelo CHECK porque as linhas que já existirem quando
-- esta migration entrar terão o braço só no `context_snapshot`. NOT NULL aqui
-- derrubaria a migration sobre dado vivo — e "a coluna existe e ainda não foi
-- preenchida" é um estado honesto, enquanto uma migration que falha no meio não
-- é nada.

create index if not exists ai_sales_journeys_braco_idx
  on public.ai_sales_journeys (organization_id, braco, coorte);

comment on column public.ai_sales_journeys.braco is
  'ia | humano — sorteio CEGO e determinístico sobre o id da lead (lib/ai/braco-do-experimento.ts). Ninguém escolhe qual lead vai para a IA.';
comment on column public.ai_sales_journeys.coorte is
  'entrada = lead chegou depois do início do experimento e conta na comparação; acervo = já estava na base e NÃO conta.';

commit;
