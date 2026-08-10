# Fase Final 7 — Dashboards e decisões por perfil

## Resultado

O Command Center só renderiza depois de identificar o papel comercial. Isso impede a visão provisória de corretor para gerentes, superintendentes ou diretores e evita uma chamada desnecessária à API de carteira própria.

## Visões

- Corretor: carteira própria, até cinco prioridades, agenda, SLA e próxima melhor ação.
- Gerente: corretores diretamente subordinados, presença, carga, conversão, SLA e intervenções.
- Superintendente: gerentes diretos e os corretores de cada equipe, com reconciliação de totais.
- Diretor: organização inteira, hierarquia, caixa, comissões, forecast, campanhas, incorporadoras, IA e riscos.

Estruturas paralelas permanecem excluídas das visões intermediárias. Um perfil ausente ou inativo recebe uma mensagem segura para corrigir cadastro, em vez de números de outro papel.

## Relatórios

O resumo operacional alterna entre dia, semana e mês. O período escolhido permanece durante a sessão. Indicadores comparam somente o escopo permitido e respeitam amostra mínima antes de classificar conversão ou campanha.

## Decisão assistida

Cada papel recebe uma fila curta com evidência, ação recomendada e link para execução. Forecast informa método e limites. Redistribuição, orçamento, contato e decisões sobre pessoas continuam exigindo aprovação humana.

## Eficiência

A correção elimina a chamada inicial incorreta ao relatório do corretor quando o usuário pertence à liderança. Nenhum novo provedor de IA ou consulta de banco foi adicionado.
