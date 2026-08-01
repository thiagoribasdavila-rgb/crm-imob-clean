# Fase 035 — Dashboard orientado à decisão

## Resultado

O Command Center passa a abrir com uma pergunta prática: **qual decisão ou ação exige atenção agora?** O primeiro bloco combina uma prioridade explicável, sua evidência e um destino operacional. A fila é resolvida dentro do escopo já autorizado de cada papel.

- Diretoria recebe riscos e decisões da organização.
- Superintendência recebe intervenções sobre seus gerentes diretos.
- Gerência recebe intervenções sobre seus corretores diretos.
- Corretor recebe prioridades da própria carteira.

Não foi criada uma visão paralela nem uma nova regra de permissão.

## Foco diário e análise completa

O modo **Foco diário** agora é realmente curto. Ele mantém o comando principal, filtros, briefing de decisão, alertas recuperáveis e a fila de até três ações do papel. Diagnósticos dos módulos, painéis completos por papel, métricas históricas e análises extensas ficam ocultos nesse modo.

O modo **Análise completa** preserva todo o conteúdo existente. Assim, a compactação não apaga informação e não remove a capacidade de auditoria da operação.

## Verdade dos indicadores

Foi removido o percentual sintético de “saúde comercial” que descontava pontos por atraso e leads sem responsável. Esse cálculo não possuía calibração nem contrato de negócio suficiente para aparecer como indicador validado.

O novo painel exibe somente contagens observáveis: prioridades visíveis, leads quentes, ações atrasadas e leads sem corretor. O número de prioridades é identificado como volume de fila, não como desempenho, conversão ou precisão.

Redução real de tempo para decisão depende de telemetria e homologação. Nenhuma melhoria comportamental foi publicada como resultado medido.

## IA supervisionada

O Copilot explica a prioridade e prepara um plano curto com o contexto já visível. A instrução proíbe execução automática. Mensagens, transferências, mudanças de etapa e decisões sensíveis continuam exigindo ação humana.

## Experiência e acessibilidade

- A ação principal usa link nativo para o destino operacional.
- A atualização mantém um nome acessível mesmo usando um ícone compacto.
- A região da próxima decisão anuncia atualização de forma não intrusiva.
- Os modos continuam operáveis com botões nativos e `aria-pressed`.
- A preferência por movimento reduzido permanece intacta.

## Segurança

Não houve alteração em banco, schema, APIs, busca de dados, credenciais, usuários, RBAC, isolamento entre tenants ou rotas. O bloqueio de homologação da Fase 020 não foi contornado.

## Revisão React

- Nenhum estado, efeito, listener ou pedido de rede foi adicionado.
- A prioridade principal é derivada das fontes já carregadas por papel.
- Links preservam destinos estáveis e a fila mantém chaves existentes.
- A apresentação progressiva reutiliza os modos já persistidos pelo dashboard.

## Próxima fase

Fase 036 — **Melhorar leads**.

O próximo avanço deve transformar a lista de leads em uma superfície de trabalho mais compacta e orientada à próxima ação, preservando paginação, filtros, escopo e dados reais.
