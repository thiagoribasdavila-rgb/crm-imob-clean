# Entrega 05 — IA proativa e informação para conversão

**Branch:** `claude/atlas-v3-entregas` · **Commits:** `57739096`, `c52ea79b`, `115d2d7a` · **Data:** 2026-07-19/20

## Objetivo

A pedido do usuário: evoluir a experiência do corretor com foco em informação que ajude a converter lead em venda, e tornar a IA proativa (sinaliza sozinha, sem o corretor pedir).

## O que foi construído

**1. Objeções de venda** (`57739096`) — `lead_objections` (tabela viva, existente, 0 linhas até então) agora tem rota (`GET/POST/PATCH /api/v1/leads/[id]/objections`) e tela (`/leads/[id]/objections`) onde o corretor registra o que o cliente objetou e pede sugestão de resposta ao Copilot já em produção (reaproveitado, sem alteração). Corretor decide se usa e se funcionou — IA nunca envia nada sozinha.

**2. Sinais proativos de atenção** (`c52ea79b`) — módulo novo `lib/atlas/attention-signals.ts` com 3 sinais reais, calculados sozinhos a cada carregamento de tela (sem o corretor pedir), usando só tabelas confirmadas vivas:
- **Lead parado no estágio** além do limite (por etapa: novo=1 dia, contato=3, qualificação=4, visita=5, proposta=7, contrato=10)
- **Follow-up vencido** (`followups.scheduled_at` no passado, não concluído)
- **Lead quente sem contato** há 3+ dias úteis (cálculo fecha corretamente sexta→segunda)

Integrado em 3 pontos, reaproveitando padrão visual existente: dashboard (nova seção "Leads que precisam de atenção agora"), Lead 360 (banner condicional), e Copilot (sinais entram no contexto/prompt automaticamente).

**3. Achado colateral importante, não corrigido:** `governed-real-estate-context.ts` tinha um bug pré-existente — consultava colunas que não existem no `leads` vivo (`score`, `next_action_at` etc., erro `42703`), com o erro silenciosamente ignorado. O contexto do Copilot vinha **vazio** em produção. Confirmado ao vivo via `execute_sql`. Não corrigido nesta entrega (fora do escopo pedido); os sinais novos foram implementados de forma independente desse bug, então funcionam mesmo sem o fix. Uma tarefa separada foi aberta para isso.

## Arquivos alterados

- `lib/atlas/attention-signals.ts` (novo)
- `app/api/v1/leads/[id]/objections/route.ts` (novo)
- `app/(crm)/leads/[id]/objections/page.tsx` (novo)
- `app/api/v1/analytics/broker-daily/route.ts`
- `app/api/v1/leads/[id]/route.ts`
- `app/(crm)/dashboard/page.tsx`
- `app/(crm)/leads/[id]/page.tsx`
- `lib/ai/governed-real-estate-context.ts`

## Banco de dados

Nenhuma migration nova. Tudo construído sobre tabelas já vivas (`lead_objections`, `pipeline_history`, `followups`, `lead_events`).

## Testes executados

```
npx tsc --noEmit                → 0 erros (repo inteiro, confirmado por mim e pelo workflow)
npx eslint . --max-warnings 0   → 0 erros/warnings
npm run build                    → rodou com sucesso durante a construção (workflow)
```

## Auto-auditoria (Regra 7)

- Tenant scoping (`organization_id`) confirmado explicitamente em toda query nova, individualmente, por revisão adversarial — nenhuma depende só de RLS.
- Fórmulas de negócio testadas manualmente (cálculo de dias úteis com fim de semana) antes de aceitar.
- Nenhuma tabela nova, nenhuma migration, RBAC intocado, arquivos do usuário intocados.

## Pendências

1. Corrigir o bug de colunas inexistentes em `governed-real-estate-context.ts` (achado nesta entrega, tarefa separada aberta).
2. Push real (WhatsApp/e-mail automático) para os sinais de atenção — versão atual é só "na tela", correto para o estágio atual (app ainda não publicada em produção).

## Próxima entrega

Redesign visual (em andamento em paralelo, ver commits `2dd691c1`/`f19bed0f` do Kanban) — Dashboard e Lead 360 agora liberados para a mesma evolução visual.
