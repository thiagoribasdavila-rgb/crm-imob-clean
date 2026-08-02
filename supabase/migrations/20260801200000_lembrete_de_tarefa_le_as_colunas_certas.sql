-- LEMBRETE DE TAREFA: a RPC lia DUAS colunas que não existem.
--
-- ── Medido em 01/08/2026, no banco de produção ──────────────────────────────
--
-- Dos 13 vigias, 12 respondiam HTTP 200. `tasks/reminders/process` devolvia
-- 500. Chamando a função direto:
--
--   ERROR 42703: column t.assigned_to does not exist   → a tabela tem `user_id`
--   ERROR 42703: column t.due_at does not exist        → a tabela tem `due_date`
--
-- Consertar a primeira só revelou a segunda. Da segunda vez eu conferi o schema
-- INTEIRO antes de reescrever, em vez de descobrir uma coluna por vez:
--   id, title, description, status, user_id, lead_id, created_at,
--   organization_id, priority, due_date, recurrence_id, recurrence_occurrence,
--   metadata
--
-- O lembrete inteligente de tarefa NUNCA funcionou desde que nasceu. Ninguém
-- viu porque o worker nunca era chamado: sem agendador instalado, a rota não
-- roda, e erro que não roda não aparece em log. A ausência de automação
-- escondia o defeito que a automação revelaria.
--
-- ── Duas armadilhas encontradas no caminho ──────────────────────────────────
--
-- 1. `DEFAULT 500` no parâmetro. Omiti-lo faz o Postgres recusar com 42P13
--    ("cannot remove parameter defaults") e sugerir DROP FUNCTION. Derrubar
--    para recriar revogaria os GRANTs junto — o erro protegeu o que eu ia
--    quebrar.
-- 2. `task_reminders` REALMENTE tem a coluna `assigned_to`. O destino sempre
--    esteve certo; a origem é que estava errada. Foi essa assimetria que fez o
--    defeito parecer implausível.
--
-- APLICADA em 01/08/2026 com autorização explícita do dono. Depois dela:
-- `POST /api/v2/tasks/reminders/process` → HTTP 200, `generated: 7`.
--
-- Não cria, não apaga e não altera tabela; não toca RLS; não move dado.
--
-- ROLLBACK: reaplicar a versão anterior (t.assigned_to / t.due_at). O efeito é
-- a função voltar a reprovar com 42703 — o estado anterior é o defeito. Não há
-- dado a restaurar.
create or replace function public.generate_smart_task_reminders(p_limit integer default 500)
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
      t.user_id as assigned_to,
      t.due_date as due_at,
      lower(coalesce(t.priority, 'normal')) as priority,
      case when t.due_date < now() then 'overdue' else 'upcoming' end as kind
    from public.tasks t
    where t.user_id is not null
      and t.due_date is not null
      and lower(coalesce(t.status, '')) not in ('done', 'concluido', 'concluida', 'completed', 'cancelado', 'cancelled')
      and (
        t.due_date < now()
        or (lower(coalesce(t.priority, '')) in ('alta', 'high', 'critical') and t.due_date <= now() + interval '24 hours')
        or (lower(coalesce(t.priority, '')) in ('media', 'medium', 'normal') and t.due_date <= now() + interval '4 hours')
        or (lower(coalesce(t.priority, '')) in ('baixa', 'low') and t.due_date <= now() + interval '1 hour')
      )
    order by t.due_date
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
