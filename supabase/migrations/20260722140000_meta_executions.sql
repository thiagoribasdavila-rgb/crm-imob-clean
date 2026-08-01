-- Idempotência de execução na Meta — guarda o resultado por chave para que um
-- reenvio (duplo clique / retry) devolva o resultado em vez de recriar a
-- campanha. Ver lib/meta/marketing/idempotency.ts.

create table if not exists public.meta_executions (
  idempotency_key text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_meta_executions_org on public.meta_executions (organization_id, created_at desc);

alter table public.meta_executions enable row level security;

-- Leitura: membros da organização. Escrita: só service role (as rotas validam papel).
drop policy if exists meta_executions_select on public.meta_executions;
create policy meta_executions_select on public.meta_executions
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

comment on table public.meta_executions is
  'Idempotência de criação/controle na Meta: resultado por idempotency_key para não recriar em reenvio.';
