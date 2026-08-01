# Fase 48 — Assistente diário de produtividade

## Resultado

A Central de Tarefas ganhou “Comece por aqui”: no máximo sete passos pessoais que combinam primeiro contato, follow-up, prazo de tarefa, visita, prioridade, temperatura e score.

## Eficiência

A ordenação é determinística, explicável e não chama modelos de IA. Cada item explica por que subiu e qual ação é recomendada. A fila abre o registro correto, mas não executa nem conclui trabalho.

## Segurança

Tarefas e leads exigem `assigned_to` igual ao usuário; visitas exigem `broker_id`. Organização e RLS continuam obrigatórios. Volume de pessoas e comparação entre corretores não entram no cálculo.

## Homologação

Validar quatro perfis, dois tenants, SLA vencido, visita do dia, lead quente, tarefas sem prazo, empates, atualização após conclusão e comportamento móvel. Execute `npm run daily-productivity:check`.
