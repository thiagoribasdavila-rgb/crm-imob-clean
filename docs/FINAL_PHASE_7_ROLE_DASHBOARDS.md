# Fase Final 7 — Dashboards e decisões por perfil

## Resultado

O Command Center só renderiza depois de identificar o papel comercial. Isso impede a visão provisória de corretor para gerentes, superintendentes ou diretores e evita uma chamada desnecessária à API de carteira própria.

## Onde cada propriedade mora

Registrado em 2026-07-29 porque a ausência disto fez o portão desta fase cobrar por dez controles de uma tela aposentada.

- Dashboards por papel: `app/(crm)/command-center/page.tsx`. A casa de decisão passou a ser o Command Center na fusão Início + Command Center; `app/(crm)/dashboard/page.tsx` restou apenas como redirect de compatibilidade para deep links antigos e não deve voltar a ter estado, efeito ou busca próprios — dois painéis sobre os mesmos números viram duas verdades.
- Recorte do resumo operacional e sua memória: `lib/dashboards/periodo-do-resumo.ts`, consumido por `app/(crm)/reports/page.tsx`. O mesmo vocabulário desenha as pastilhas, valida o valor lido da sessão, define o padrão e recorta os números.

## Visões

- Corretor: carteira própria, até cinco prioridades, agenda, SLA e próxima melhor ação.
- Gerente: corretores diretamente subordinados, presença, carga, conversão, SLA e intervenções.
- Superintendente: gerentes diretos e os corretores de cada equipe, com reconciliação de totais.
- Diretor: organização inteira, hierarquia, caixa, comissões, forecast, campanhas, incorporadoras, IA e riscos.

Estruturas paralelas permanecem excluídas das visões intermediárias. Um perfil ausente ou inativo recebe uma mensagem segura para corrigir cadastro, em vez de números de outro papel.

## Relatórios

O resumo operacional alterna entre dia, semana e mês — mais histórico, sem recorte. O período escolhido permanece durante a sessão. Indicadores comparam somente o escopo permitido e respeitam amostra mínima antes de classificar conversão ou campanha.

A permanência entrou em 2026-07-29, e até então esta linha era promessa não cumprida: as pastilhas existiam e recortavam de verdade, mas o estado nascia no padrão a cada montagem, então quem escolhia "Hoje", abria uma lead e voltava reencontrava "30 dias" sem nenhum aviso de que o recorte havia sumido. A escolha vive em `sessionStorage` sob chave versionada, e não em `localStorage`: recorte de relatório é postura do momento, não preferência de usuário. Sem escolha salva — primeira visita, valor corrompido ou vocabulário de outra versão — o padrão continua "30 dias", o mesmo comportamento anterior à mudança.

## Decisão assistida

Cada papel recebe uma fila curta com evidência, ação recomendada e link para execução. Forecast informa método e limites. Redistribuição, orçamento, contato e decisões sobre pessoas continuam exigindo aprovação humana.

## Eficiência

A correção elimina a chamada inicial incorreta ao relatório do corretor quando o usuário pertence à liderança. Nenhum novo provedor de IA ou consulta de banco foi adicionado.
