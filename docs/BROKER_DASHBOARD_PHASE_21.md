# Fase 21 — Dashboard diário do corretor

## Missão

O corretor abre o CRM e entende em até um minuto o que precisa fazer. A visão usa somente sua carteira e reduz o dia a uma fila curta, agenda e indicadores acionáveis.

## Priorização

1. Primeiro contato fora do SLA.
2. Follow-up vencido.
3. Tarefa vinculada atrasada.
4. Lead quente ou score elevado.
5. Lead sem próxima ação definida.
6. Demais leads por potencial da carteira.

Cada linha apresenta o motivo, a próxima melhor ação, etapa, score e prazo. A IA organiza; não envia mensagem, não muda etapa e não transfere carteira sem ação humana.

## Escopo e segurança

- Endpoint exclusivo de `broker`.
- Consulta pelo cliente autenticado do Supabase, preservando RLS.
- Filtro explícito `assigned_to = profile.id` como defesa adicional.
- Sem `service_role` ou consulta administrativa.
- Limite por rota e resposta sem cache compartilhado.

## Homologação

Entrar como dois corretores de equipes diferentes e confirmar que cada um vê apenas suas leads, tarefas e agenda. Validar ordenação com SLA vencido, follow-up vencido, lead quente, tarefa atrasada e carteira sem próxima ação.
