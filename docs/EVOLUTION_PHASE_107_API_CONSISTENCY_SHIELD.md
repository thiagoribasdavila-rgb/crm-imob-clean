# ATLAS AI OS — Fase 107/3000

## Objetivo

Corrigir pontos críticos que ainda consultavam tabelas ou campos frágeis diretamente no Supabase, especialmente em telas que afetam uso diário: busca, lembretes, notificações e contexto do Copilot.

## Problema resolvido

O projeto já tinha uma camada compatível para conviver com a base V2/V3, mas alguns módulos ainda pulavam essa camada e tentavam ler:

- `developments`;
- `opportunities`;
- `tasks.due_at`;
- `profiles.full_name`;
- `leads.score`;
- `ai_insights`.

Quando esses campos/tabelas não existem no ambiente atual, a interface abre, mas a experiência fica inconsistente.

## Alterações realizadas

- Busca global passou a usar leitura compatível de leads e projetos, com filtro em memória e sem depender de `developments` ou `profiles.full_name`.
- Lembretes passaram a buscar `task_reminders` e tarefas separadamente, unindo os dados via adapter compatível.
- Central de notificações passou a consumir o snapshot governado de saúde operacional para tarefas e insights.
- Contexto imobiliário da IA passou a usar `readCompatibleDevelopments`, `readCompatibleLeads` e `readCompatiblePipeline`.

## Impacto operacional

- Menos risco de tela quebrada por diferença entre banco legado e modelo V3.
- IA com contexto mais estável.
- Busca mais segura para corretor, gerente e diretor.
- Kanban e relatórios ficam mais alinhados com a mesma fonte compatível.

## Próxima etapa recomendada

Fase 108: elevar o Kanban para operação premium, com foco em:

1. cards mais rápidos de ler;
2. prioridade visual por próxima ação;
3. filtros úteis para corretor/gerente/diretor;
4. estados vazios com orientação;
5. ações rápidas sem excesso de ruído.

## Checklist de validação

- [x] Busca global sem dependência direta de `developments`.
- [x] Busca global sem dependência direta de `profiles.full_name`.
- [x] Lembretes sem join em `tasks.due_at`.
- [x] Contexto IA sem `opportunities` direto.
- [x] Notificações sem `ai_insights` direto.
- [x] Check automático da fase criado.
