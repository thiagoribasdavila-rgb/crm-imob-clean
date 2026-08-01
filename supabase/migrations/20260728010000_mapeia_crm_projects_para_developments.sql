-- ═══════════════════════════════════════════════════════════════════════════
-- MAPEIA crm_projects → developments: uma costura explícita entre as duas
-- identidades do mesmo empreendimento.
--
-- ── O problema, medido em 2026-07-28 no banco vivo ──────────────────────────
--
-- Os MESMOS 4 empreendimentos existem em `crm_projects` E em `developments`,
-- com ids diferentes. E as FKs se dividem por convenção de nome:
--
--   project_id      → crm_projects   (leads, marketing_campaigns, inventory_units…)
--   development_id  → developments   (28 tabelas: materiais, tipologias, visitas…)
--
-- com UMA exceção traiçoeira: `meta_lead_sources.development_id` chama-se
-- development_id mas referencia crm_projects.
--
-- A ingestão (outbox meta.lead.fetch) copiava o development_id da fonte — um id
-- de crm_projects — para AS DUAS colunas da lead. Na coluna certa (project_id)
-- funcionava; na errada (development_id, FK → developments) estourava 23503 e
-- A LEAD INTEIRA SE PERDIA. Dormente enquanto nenhuma fonte tinha
-- development_id; armado desde que os formulários com qualificação foram
-- vinculados aos seus empreendimentos.
--
-- ── Por que um MAPEAMENTO e não uma fusão ───────────────────────────────────
--
-- Fundir as duas tabelas exigiria decidir a canônica e reescrever quem escreve
-- em cada uma (127 migrations, 124 arquivos com service_role) — mudança de
-- identidade de produto na véspera da operação começar. O mapeamento é o menor
-- corte que fecha o vão: uma coluna anulável, backfill determinístico por
-- nome+organização (4 linhas hoje), e a ingestão passa a resolver o lado certo
-- para cada FK. Nada é apagado, nenhum id muda, nenhuma linha existente é
-- tocada além do preenchimento da coluna nova.
--
-- ── Idempotência e reversão ─────────────────────────────────────────────────
--
-- Reexecutar é seguro: ADD COLUMN IF NOT EXISTS, e o backfill só preenche onde
-- está nulo. Rollback completo (nenhum dado original é alterado):
--
--   alter table public.crm_projects drop column if exists development_id;
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.crm_projects
  add column if not exists development_id uuid references public.developments(id);

comment on column public.crm_projects.development_id is
  'Elo com public.developments: o MESMO empreendimento vive nas duas tabelas com ids diferentes (drift medido em 2026-07-28). project_id→crm_projects e development_id→developments por convenção; esta coluna é a ponte. Preenchida por nome+organização; conferir ao cadastrar empreendimento novo.';

-- Backfill determinístico: nome normalizado + mesma organização. Só onde ainda
-- não há vínculo, e só quando o casamento é ÚNICO — ambiguidade fica nula e
-- aparece no diagnóstico, em vez de virar vínculo errado em silêncio.
update public.crm_projects p
set development_id = d.id
from public.developments d
where p.development_id is null
  and d.organization_id = p.organization_id
  and lower(trim(d.name)) = lower(trim(p.name))
  and (
    select count(*) from public.developments d2
    where d2.organization_id = p.organization_id
      and lower(trim(d2.name)) = lower(trim(p.name))
  ) = 1;
