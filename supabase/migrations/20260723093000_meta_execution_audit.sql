-- Auditoria de execução na Meta — quem pausou, ativou, mudou verba ou criou
-- campanha, sob qual aprovação, com que valor antes e depois.
--
-- Até aqui a frase "executado sob aprovação X por Y" existia apenas no corpo da
-- resposta HTTP e morria ali: nenhuma tabela guardava ator, ação ou objeto
-- (meta_executions é cache de idempotência — chave, org, result e data).
-- Depois de uma ativação cara, "quem mudou o quê e quando" era irrespondível.
--
-- DDL ANTES DO CÓDIGO (docs/POST_DEPLOY_CHECKLIST.md): a rota
-- app/api/v1/marketing/execute/route.ts falha FECHADA (503) quando esta tabela
-- não existe — sem registro de auditoria não há execução real.

create table if not exists public.meta_execution_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- ator: quem apertou o botão. on delete set null preserva a linha de auditoria.
  actor_profile_id uuid references public.profiles(id) on delete set null,
  -- aprovação que autorizou. SEM foreign key de propósito: approval_requests
  -- pode não existir ainda no alvo, e a auditoria não pode depender disso.
  approval_id uuid,
  action text not null check (action in ('create', 'pause', 'activate', 'set_daily_budget')),
  object_type text,
  object_id text,
  -- null = NÃO LIDO (leitura falhou ou não se aplica), nunca "era zero".
  previous_value_cents bigint,
  requested_value_cents bigint,
  outcome text not null default 'attempted' check (outcome in ('attempted', 'succeeded', 'failed')),
  step_results jsonb not null default '[]'::jsonb,
  error_message text,
  -- observações honestas (ex.: "verba anterior não lida: token expirado").
  note text,
  occurred_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_meta_execution_audit_org
  on public.meta_execution_audit (organization_id, occurred_at desc);
create index if not exists idx_meta_execution_audit_object
  on public.meta_execution_audit (organization_id, object_id, occurred_at desc);
create index if not exists idx_meta_execution_audit_approval
  on public.meta_execution_audit (approval_id) where approval_id is not null;

alter table public.meta_execution_audit enable row level security;

-- Leitura: membros da organização. Escrita: só service role (a rota valida alçada).
drop policy if exists meta_execution_audit_select on public.meta_execution_audit;
create policy meta_execution_audit_select on public.meta_execution_audit
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

comment on table public.meta_execution_audit is
  'Auditoria de escrita na Meta: ator, aprovação, ação, objeto, valor antes/depois e desfecho.';
comment on column public.meta_execution_audit.previous_value_cents is
  'Verba diária vigente lida na Meta ANTES da execução. null = não lida (jamais interpretar como zero).';
comment on column public.meta_execution_audit.outcome is
  'attempted = gravado antes da chamada; succeeded/failed = desfecho confirmado. attempted parado significa desfecho não registrado.';
