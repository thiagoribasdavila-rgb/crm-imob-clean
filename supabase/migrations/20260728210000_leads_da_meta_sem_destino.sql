-- ── LEAD QUE CHEGA SEM DESTINO NÃO PODE VIRAR SÓ UM LOG ──────────────────────
--
-- Quando o webhook da Meta recebe uma lead de uma PÁGINA que o CRM não conhece,
-- o código atual conta `unmapped += 1`, escreve um `logger.warn` e segue com
-- `continue`. O próprio comentário admite: "Best-effort: persiste o payload no
-- log estruturado para replay manual". Log rotaciona. A lead some.
--
-- Isso deixou de ser hipótese em 2026-07-28: as 4 campanhas ATIVAS da conta
-- Inside - Senna usam a página 1115087091694606, e o System User administra
-- apenas a 582258611872380 (DA'Vila Consultoria). No dia em que a verba for
-- liberada, TODA lead dessas campanhas cai neste caminho.
--
-- Por que tabela nova e não `dead_letter_events`: aquela exige
-- `organization_id NOT NULL`, e o problema aqui é exatamente NÃO SABER a
-- organização — a página é desconhecida. Forçar um id qualquer para caber na
-- tabela seria inventar o dado que falta.
--
-- ROLLBACK:
--   drop table if exists public.meta_leads_sem_destino;

create table if not exists public.meta_leads_sem_destino (
  id uuid primary key default gen_random_uuid(),
  -- O que a Meta mandou. `leadgen_id` é único: a Meta reentrega o mesmo evento
  -- quando não recebe 200 a tempo, e sem isto a mesma lead entraria N vezes.
  leadgen_id text not null unique,
  page_id text,
  form_id text,
  ad_id text,
  campaign_external_id text,
  motivo text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  -- Preenchidos quando alguém cadastra a fonte e reprocessa.
  resolvido boolean not null default false,
  resolvido_em timestamptz,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.meta_leads_sem_destino is
  'Leads que a Meta entregou e o CRM não soube onde colocar (página ou formulário sem cadastro em meta_lead_sources). Guardadas para reprocessar depois de configurar a fonte — sem isto elas existiriam apenas no log e se perderiam na rotação.';
comment on column public.meta_leads_sem_destino.motivo is
  'Por que não teve destino: unknown_page, missing_page_id, source_lookup_failed.';

create index if not exists meta_leads_sem_destino_pendentes_idx
  on public.meta_leads_sem_destino (received_at desc)
  where resolvido = false;
create index if not exists meta_leads_sem_destino_page_idx
  on public.meta_leads_sem_destino (page_id) where resolvido = false;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- A tabela não tem organization_id (é o dado que falta), então não há como
-- escrever uma política por organização. A decisão é NEGAR tudo por padrão:
-- só o service_role (webhook e worker de reprocessamento) enxerga. Um dia,
-- se isto virar tela, a política será por papel executivo — mas fechado é o
-- estado certo para uma tabela que guarda PII sem dono definido.
alter table public.meta_leads_sem_destino enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meta_leads_sem_destino'
      and policyname = 'meta_leads_sem_destino_sem_acesso_direto'
  ) then
    create policy meta_leads_sem_destino_sem_acesso_direto
      on public.meta_leads_sem_destino
      for all to authenticated
      using (false) with check (false);
  end if;
end $$;
