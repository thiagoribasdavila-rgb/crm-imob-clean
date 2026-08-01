-- Invariante que o código do webhook passa a depender: no máximo UMA tarefa VIVA
-- por (organização, tópico, agregado).
--
-- app/api/webhooks/meta/route.ts agora GARANTE a tarefa quando o insert em
-- meta_lead_events bate no unique (o lead já tinha sido recebido, mas a tarefa
-- do outbox podia nunca ter sido criada). A garantia é select → insert, e esse
-- padrão só evita duplicata quando o BANCO rejeita o segundo insert: dois
-- reenvios simultâneos da Meta passam pelo select ao mesmo tempo e criam duas
-- tarefas, fazendo o worker buscar o mesmo lead duas vezes.
--
-- O índice é PARCIAL sobre os estados vivos ('pending','processing','failed') de
-- propósito: reprocessar deliberadamente um agregado depois de terminal
-- (delivered/blocked/dead_letter) continua permitido — é o que /api/v3/dlq/retry
-- faz, e ele reaproveita a linha existente em vez de inserir outra. O que a
-- invariante proíbe é DUAS tarefas disputando o mesmo agregado ao mesmo tempo.
--
-- aggregate_id nulo fica de fora: são eventos sem agregado, que não têm chave
-- natural para deduplicar.
--
-- Nada é deduplicado em silêncio: se já houver duplicata viva, a migration PARA
-- e diz quantos grupos encontrou. Reconciliar é decisão humana — a consulta de
-- leitura está na mensagem. Idempotente: sai cedo se a tabela ou o índice não
-- existirem/já existirem.

do $$
declare
  grupos_duplicados bigint;
begin
  if to_regclass('public.integration_outbox') is null then
    return;
  end if;

  if to_regclass('public.integration_outbox_live_task_uidx') is not null then
    return;
  end if;

  select count(*) into grupos_duplicados
    from (
      select 1
        from public.integration_outbox
       where aggregate_id is not null
         and status in ('pending', 'processing', 'failed')
       group by organization_id, topic, aggregate_id
      having count(*) > 1
    ) d;

  if grupos_duplicados > 0 then
    raise exception
      'integration_outbox tem % grupo(s) vivos duplicados por (organization_id, topic, aggregate_id). Liste-os com: select organization_id, topic, aggregate_id, count(*), min(created_at) from public.integration_outbox where aggregate_id is not null and status in (''pending'',''processing'',''failed'') group by 1,2,3 having count(*) > 1; e encerre as tarefas excedentes (a mais antiga fica) antes de criar o índice',
      grupos_duplicados;
  end if;

  create unique index integration_outbox_live_task_uidx
    on public.integration_outbox (organization_id, topic, aggregate_id)
    where aggregate_id is not null and status in ('pending', 'processing', 'failed');
end $$;
