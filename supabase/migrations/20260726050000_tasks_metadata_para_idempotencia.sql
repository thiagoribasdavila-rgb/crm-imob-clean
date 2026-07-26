-- =============================================================================
-- public.tasks ganha metadata: sem ela, o vigia de SLA não consegue ser idempotente
-- =============================================================================
--
-- ERRO MEDIDO EM 2026-07-26, na primeira execução real do vigia pelo executor
-- de workers:
--
--   PGRST204 — Could not find the 'metadata' column of 'tasks' in the schema cache
--
-- O worker de primeiro contato carimba em cada tarefa uma chave
-- `metadata.slaKey = sla:<lead>:<estágio>` e consulta essa chave antes de criar
-- a próxima leva. É o que impede que rodar de 5 em 5 minutos gere uma tarefa
-- nova a cada ciclo para a mesma lead. A coluna simplesmente não existia neste
-- schema — a rota respondia 500 e nenhuma tarefa era criada.
--
-- Vale registrar como o erro passou: na sessão anterior o worker foi medido
-- contando quantas tarefas ELE CRIARIA (207, depois 6 com os limites), e não
-- quantas de fato inseriu. Contagem calculada não é contagem gravada.
--
-- O QUE MUDA
-- Uma coluna jsonb com default '{}', mais um índice para a consulta de
-- idempotência. Nenhuma linha existente é reescrita: o default cobre o que já
-- está lá, e nenhuma outra parte do produto escreve metadata em tasks hoje.
--
-- A RLS de public.tasks não é tocada — acrescentar coluna não altera política, e
-- as políticas existentes seguem valendo para leitura e escrita.
--
-- O código NÃO passa a depender desta migration: o worker detecta a ausência da
-- coluna (PGRST204/42703) e cai para idempotência por prefixo de título. Banco
-- sem esta migration continua funcionando, apenas com uma chave menos precisa.
-- =============================================================================

alter table public.tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.tasks.metadata is
  'Dados estruturados de quem criou a tarefa. O vigia de SLA usa metadata->>slaKey para não recriar a mesma cobrança a cada ciclo.';

-- A consulta de idempotência filtra por metadata->>'slaKey' em lote. Sem índice,
-- cada ciclo do worker varreria a tabela inteira de tarefas.
create index if not exists tasks_metadata_sla_key_idx
  on public.tasks ((metadata ->> 'slaKey'))
  where metadata ? 'slaKey';
