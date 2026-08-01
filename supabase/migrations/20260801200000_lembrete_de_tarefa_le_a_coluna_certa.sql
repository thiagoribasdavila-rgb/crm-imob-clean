-- LEMBRETE DE TAREFA: a RPC lia uma coluna que não existe.
--
-- ── O que foi medido em 01/08/2026, no banco de produção ─────────────────────
--
-- Dos 13 vigias do produto, 12 responderam HTTP 200 quando chamados à mão.
-- `POST /api/v2/tasks/reminders/process` devolveu **500** com a mensagem
-- genérica "Falha ao gerar lembretes.". Chamando a função direto:
--
--   ERROR 42703: column t.assigned_to does not exist
--
-- `public.tasks` tem **`user_id`** — nunca teve `assigned_to`. A função lê o
-- nome errado desde que foi criada, então o lembrete inteligente de tarefa
-- NUNCA funcionou. Ninguém viu porque o worker nunca era chamado: sem crontab
-- instalado, a rota não rodava, e um erro que não roda não aparece em log.
--
-- É a mesma família de defeito do dono da lead (`assigned_to` vs
-- `assigned_user_id` em `public.leads`), agora entre a função e a tabela.
-- Vale notar a assimetria que confundiu: `task_reminders` REALMENTE tem a
-- coluna `assigned_to` — o destino está certo, a origem é que estava errada.
--
-- ── O que esta migration faz ────────────────────────────────────────────────
--
-- Troca `t.assigned_to` por `t.user_id` na leitura. Nada mais: mesma
-- assinatura, mesmo retorno, mesmo `on conflict`, mesma coluna de destino.
-- Não cria, não apaga e não altera nenhuma tabela; não toca em RLS; não move
-- dado nenhum. O único efeito é a função passar a encontrar as tarefas.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- Reaplicar a versão anterior trocando `t.user_id` de volta por
-- `t.assigned_to`. O efeito de voltar é a função reprovar de novo com 42703 —
-- ou seja, o estado anterior é o defeito. Não há dado a restaurar.
--
-- ── NÃO APLICADA AUTOMATICAMENTE ────────────────────────────────────────────
--
-- O deploy deste produto NÃO roda migrations. Esta precisa de execução
-- deliberada pelo dono do banco. Enquanto não for aplicada, o worker de
-- lembretes continua devolvendo 500 e NÃO deve ser agendado no crontab: um
-- vigia que falha a cada 5 minutos é ruído que treina todo mundo a ignorar
-- alerta.

create or replace function public.generate_smart_task_reminders(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generated integer;
begin
  with candidates as (
    select
      t.id,
      t.organization_id,
      -- ERA `t.assigned_to`, que não existe em public.tasks.
      t.user_id as assigned_to,
      t.due_at,
      lower(coalesce(t.priority, 'normal')) as priority,
      case when t.due_at < now() then 'overdue' else 'upcoming' end as kind
    from public.tasks t
    where t.user_id is not null
      and t.due_at is not null
      and lower(coalesce(t.status, '')) not in ('done', 'concluido', 'concluida', 'completed', 'cancelado', 'cancelled')
      and (
        t.due_at < now()
        or (lower(coalesce(t.priority, '')) in ('alta', 'high', 'critical') and t.due_at <= now() + interval '24 hours')
        or (lower(coalesce(t.priority, '')) in ('media', 'medium', 'normal') and t.due_at <= now() + interval '4 hours')
        or (lower(coalesce(t.priority, '')) in ('baixa', 'low') and t.due_at <= now() + interval '1 hour')
      )
    order by t.due_at
    limit least(greatest(p_limit, 1), 2000)
  ),
  inserted as (
    insert into public.task_reminders (organization_id, task_id, assigned_to, kind, task_due_at, priority)
    select organization_id, id, assigned_to, kind, due_at, priority
    from candidates
    on conflict (task_id, kind, task_due_at) do nothing
    returning 1
  )
  select count(*) into v_generated from inserted;

  return jsonb_build_object('generated', v_generated);
end;
$$;
