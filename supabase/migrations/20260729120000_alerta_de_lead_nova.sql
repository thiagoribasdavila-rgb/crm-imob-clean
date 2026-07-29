-- ── AVISAR QUANDO CHEGA LEAD NOVA ───────────────────────────────────────────
--
-- O CRM não tinha como avisar ninguém. O aparato existente se APRESENTA como
-- ligado e não está: a publicação `supabase_realtime` contém uma única tabela
-- (`task_reminders`, zero linhas desde sempre), e cinco telas mostram "tempo
-- real ativo" em verde assinando tabelas que não estão publicadas.
--
-- ── POR QUE UMA TABELA, E NÃO UM CURSOR EM leads.created_at ─────────────────
--
-- Porque `created_at` NÃO é monotônico nesta base. O caminho da Meta grava
-- `created_at = leadData.created_time` — a data em que a pessoa preencheu o
-- formulário no Facebook, não a data em que a lead chegou aqui. As 3 leads da
-- Meta entraram com 341 a 363 horas de defasagem. Um cursor por `created_at`
-- diria "nenhuma lead nova" com três leads pagas recém-chegadas: falha
-- silenciosa E plausível, a pior combinação possível.
--
-- `detectado_em default now()` é carimbado pelo BANCO no instante do evento.
-- É monotônico por construção, independente do que a origem diga.
--
-- ── POR QUE TAMBÉM NO UPDATE ────────────────────────────────────────────────
--
-- Para o corretor, a lead "entra" quando ela cai na carteira dele — o que é um
-- UPDATE de `assigned_user_id`, não um INSERT. As 443 leads nunca contatadas
-- de hoje vão ser DISTRIBUÍDAS amanhã, não criadas. Contar só INSERT deixaria
-- o alerta mudo exatamente no cenário mais provável do primeiro dia.
--
-- ── POR QUE IMPORTAÇÃO NÃO AVISA ────────────────────────────────────────────
--
-- Em 2026-07-28 22:06 entraram 269 leads em um minuto, e 270 das 470 da base
-- vieram de importação. Um aviso por linha importada é a bolinha vermelha
-- permanente em forma de número — a pessoa aprende a ignorar em dois dias, e
-- junto com ela ignora a lead paga que chegou de verdade.
--
-- ROLLBACK:
--   drop trigger if exists leads_avisa_chegada on public.leads;
--   drop trigger if exists leads_avisa_atribuicao on public.leads;
--   drop function if exists public.registra_alerta_de_lead();
--   drop table if exists public.lead_alerts;

create table if not exists public.lead_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Nulo = ninguém tem a lead ainda; quem lê é a liderança, porque lead sem
  -- dono é problema de distribuição, não de um corretor específico.
  destinatario_id uuid,
  motivo text not null check (motivo in ('criacao', 'atribuicao')),
  -- Carimbado pelo banco. É a única data confiável aqui — ver o cabeçalho.
  detectado_em timestamptz not null default now(),
  visto_em timestamptz
);

comment on table public.lead_alerts is
  'Chegadas de lead que ainda não foram vistas por quem precisa agir. Uma linha por evento (criação ou atribuição), com detectado_em carimbado pelo banco — leads.created_at não serve porque o caminho da Meta grava a data de origem, retrodatada em até 15 dias.';

create index if not exists lead_alerts_pendentes_idx
  on public.lead_alerts (organization_id, destinatario_id, detectado_em desc)
  where visto_em is null;

-- ── O GATILHO ───────────────────────────────────────────────────────────────

create or replace function public.registra_alerta_de_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Importação em lote não avisa: 269 linhas em um minuto viram ruído
    -- permanente e matam a credibilidade do aviso legítimo.
    if new.import_batch_id is not null then
      return new;
    end if;
    insert into public.lead_alerts (organization_id, lead_id, destinatario_id, motivo)
    values (new.organization_id, new.id, new.assigned_user_id, 'criacao');
    return new;
  end if;

  -- UPDATE: só quando a lead REALMENTE mudou de dono e passou a ter um.
  -- `is distinct from` cobre o caso nulo → dono, que é a distribuição.
  if new.assigned_user_id is not null
     and new.assigned_user_id is distinct from old.assigned_user_id then
    insert into public.lead_alerts (organization_id, lead_id, destinatario_id, motivo)
    values (new.organization_id, new.id, new.assigned_user_id, 'atribuicao');
  end if;
  return new;
end;
$$;

drop trigger if exists leads_avisa_chegada on public.leads;
create trigger leads_avisa_chegada
  after insert on public.leads
  for each row execute function public.registra_alerta_de_lead();

drop trigger if exists leads_avisa_atribuicao on public.leads;
create trigger leads_avisa_atribuicao
  after update of assigned_user_id on public.leads
  for each row execute function public.registra_alerta_de_lead();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Fechado para o navegador. A rota lê com service_role e aplica o recorte por
-- papel em código (lib/crm/escopo-de-leitura.ts), que é onde o piso de carteira
-- já vive e já é testado. Deixar o navegador ler direto repetiria o defeito de
-- `/customers`: a política por organização é PERMISSIVE e faz OR com a de dono,
-- então "por organização" vence e o corretor enxerga a carteira dos colegas.
alter table public.lead_alerts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_alerts'
      and policyname = 'lead_alerts_sem_acesso_direto'
  ) then
    create policy lead_alerts_sem_acesso_direto
      on public.lead_alerts
      for all to authenticated
      using (false) with check (false);
  end if;
end $$;
