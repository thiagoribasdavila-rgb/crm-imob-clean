# Atlas One — Reestruturação operacional e visual em 60 fases

Data da revisão: 04/08/2026

## Progresso de execução

- **Fase 1 — concluída em 04/08/2026.** Foram congelados 19 destinos canônicos, 15 contratos de métricas e 10 invariantes operacionais em `config/operational-ux-phase-001-baseline.json`.
- A verificação repetível está em `scripts/check-operational-ux-phase-001.mjs` e pode ser executada com `npm run ux:phase-001:check`.
- A fase não alterou interface, APIs, banco, autenticação, RLS, dados reais ou integrações.
- Riscos preservados para correção controlada: colisões físicas em `/dashboard`, `/ai-dashboard`, `/sales` e `/revenue-engine`; metodologias distintas de forecast; possível mistura de importação em “leads do dia”.
- **Fase 2 — instrumentada em 04/08/2026 e aguardando amostra real.** As seis jornadas críticas agora medem tempo, cliques acionáveis, navegações internas e intenção de envio por rota e papel, sem capturar identidade, conteúdo digitado, query string ou IDs reais.
- O contrato está em `config/operational-ux-phase-002-journeys.json`, o medidor em `scripts/measure-operational-ux-phase-002.mjs` e o gate em `scripts/check-operational-ux-phase-002.mjs`.
- A consulta local não encontrou credenciais operacionais disponíveis. Por isso, taxa de conclusão, mediana e p95 permanecem nulos; nenhuma métrica foi estimada.
- A fase reutiliza o endpoint autenticado e o ledger tenant-safe já existentes. Não alterou schema, autenticação, RLS ou dados reais.
- **Fase 3 — concluída em 04/08/2026.** Entrada operacional, importação histórica e registros de origem ambígua foram separados na leitura diária; eventos de distribuição de bases históricas também deixam de contaminar o recebimento operacional.
- O snapshot executivo diário está definido em `config/operational-ux-phase-003-data-boundaries.json`, com implementação em `lib/analytics/lead-intake.ts`, prova em `tests/contracts/lead-intake-analytics.test.mjs` e gate em `scripts/check-operational-ux-phase-003.mjs`.
- A Sala de Comando agora exibe “amostra insuficiente” quando faltam evidência, volume mínimo ou ledger auditável. Nenhuma métrica desconhecida é apresentada como zero conclusivo.
- A fase não alterou schema, RLS, autenticação ou dados reais.
- **Fase 4 — concluída em 04/08/2026.** Foi criado um dicionário único de oito estados operacionais, reconciliando aliases legados com cor, símbolo, severidade, significado e decisão esperada.
- O contrato está em `lib/ui/operational-state.ts`, sua primeira aplicação real está no selo de entrada e distribuição da Sala de Comando e a prova repetível está em `scripts/check-operational-ux-phase-004.mjs`.
- Estado desconhecido nunca vira saudável; amostra insuficiente não é tratada como erro; bloqueio e risco crítico permanecem distinguíveis sem depender apenas de cor.
- A fase não alterou schema, RLS, autenticação, integrações ou dados reais.
- **Fase 5 — concluída em 04/08/2026.** Nove superfícies canônicas agora compartilham a matriz tela × papel × decisão principal, responsável, prazo, resultado esperado e comprovação.
- A Sala de Comando é a primeira aplicação real: a prioridade dinâmica passa a exibir o contrato de fechamento correspondente a Diretor, Superintendente, Gerente ou Corretor.
- Papel desconhecido recebe o escopo de menor privilégio; rotas de detalhe herdam a decisão da área canônica; nenhuma ação sensível é executada automaticamente.
- O contrato está em `lib/ui/screen-decision-contract.ts`, a prova em `tests/contracts/screen-decision-contract.test.mjs` e o gate em `scripts/check-operational-ux-phase-005.mjs`.
- A fase não alterou schema, dados, RLS, autenticação ou integrações.
- **Fase 6 — concluída em 04/08/2026.** A navegação inicial agora apresenta uma rotina ordenada para Corretor, Gerente, Superintendente e Diretor; administrador segue a visão executiva e papel desconhecido recebe a rotina de Corretor.
- As rotas existentes continuam acessíveis nos grupos canônicos e na busca; nenhum destino, controle RBAC ou contrato de dados foi removido. O dock móvel também prioriza quatro destinos próprios do papel.
- O contrato está em `lib/atlas/navigation.ts`, a prova em `tests/contracts/role-navigation-priority.test.mjs` e o gate em `scripts/check-operational-ux-phase-006.mjs`.
- A fase não alterou schema, dados, RLS, autenticação ou integrações.
- **Fase 7 — concluída em 04/08/2026.** Destinos fora da rotina e dos favoritos agora ficam compactados em “Mais”; a área abre automaticamente quando contém a rota atual e o botão mantém o nome da tela atual visível.
- A busca continua consultando todas as rotas permitidas e mostra resultados diretamente, sem exigir abertura de “Mais”. Rotina, favoritos, links profundos, dock móvel e RBAC foram preservados.
- O contrato de partição está em `lib/atlas/navigation.ts`, a prova em `tests/contracts/navigation-progressive-disclosure.test.mjs` e o gate em `scripts/check-operational-ux-phase-007.mjs`.
- A fase não alterou schema, dados, RLS, autenticação ou integrações.
- **Fase 8 — concluída em 04/08/2026.** A barra lateral agora assume somente descoberta e troca de contexto: rótulos, rotina, favoritos e busca. O resultado comercial de cada destino permanece pesquisável e acessível, mas sua explicação visual fica exclusivamente no topo da tela.
- Selos redundantes de estado e o marcador textual “Agora” saíram da leitura visual; o estado ativo continua inequívoco por contraste, indicador lateral e `aria-current`. O rodapé foi reduzido a um único estado “Protegido”, mantendo a explicação completa para tecnologia assistiva.
- O contrato está em `config/operational-ux-phase-008-information-ownership.json`, a prova em `tests/contracts/navigation-information-ownership.test.mjs` e o gate em `scripts/check-operational-ux-phase-008.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Fase 9 — concluída em 04/08/2026.** Dashboard, Leads, Pipeline, Tarefas, Clientes 360, Projetos e Vendas passam a compartilhar o contrato de leitura contexto → título → orientação decisória → ação principal.
- Leads, Pipeline, Tarefas, Clientes 360 e Projetos aderem ao contrato sem perder filtros, sinais ou ações secundárias; o Pipeline agora possui `h1` semanticamente correto.
- O contrato está em `config/operational-ux-phase-009-page-header-hierarchy.json`, a prova em `tests/contracts/page-header-hierarchy.test.mjs` e o gate em `scripts/check-operational-ux-phase-009.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Fase 10 — concluída em 04/08/2026.** Busca global, criação contextual, Copilot e notificações foram reunidos em uma única faixa de comando, com somente a criação contextual recebendo peso primário.
- O estado “Operação segura” permanece disponível para tecnologia assistiva sem disputar espaço visual. No desktop, o Copilot deixa de duplicar seu lançador flutuante e passa a abrir pela faixa global; no celular, o lançador existente continua disponível.
- O contrato está em `config/operational-ux-phase-010-global-command-rail.json`, a prova em `tests/contracts/global-command-rail.test.mjs` e o gate em `scripts/check-operational-ux-phase-010.mjs`.
- **Fase 11 — concluída em 04/08/2026.** Busca global, notificações, criação rápida, feedback e Copilot agora carregam somente no primeiro uso, preservando cliques, atalhos e contexto; saúde, memória e presença continuam monitorando desde a entrada.
- O contrato está em `config/operational-ux-phase-011-lazy-global-surfaces.json`, a prova em `tests/contracts/lazy-global-surfaces.test.mjs` e o gate em `scripts/check-operational-ux-phase-011.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Fase 12 — concluída em 04/08/2026.** Tipografia, espaçamento, densidade, raios e sombras agora derivam de uma fonte semântica única; aliases legados preservam compatibilidade sem manter um segundo sistema visual.
- Painéis, métricas, botões e cabeçalhos canônicos usam a escala compartilhada. O modo compacto redefine somente tokens de densidade e o modo confortável permanece como padrão.
- O contrato está em `config/operational-ux-phase-012-decisive-design-tokens.json`, a prova em `tests/contracts/decisive-design-tokens.test.mjs` e o gate em `scripts/check-operational-ux-phase-012.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Fase 13 — concluída em 04/08/2026.** Azul foi concentrado em ação, foco e navegação; verde, amarelo e vermelho permanecem reservados aos estados operacionais, enquanto estrutura e conteúdo secundário passam a ser neutros.
- Gradientes azul-violeta foram removidos das superfícies canônicas de ação, progresso, cabeçalho, empty state e marca do shell. Compatibilidade legada foi preservada sem criar significado cromático novo.
- O contrato está em `config/operational-ux-phase-013-semantic-color-discipline.json`, a prova em `tests/contracts/semantic-color-discipline.test.mjs` e o gate em `scripts/check-operational-ux-phase-013.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Fase 14 — concluída em 04/08/2026.** Cards agora declaram uma das seis funções canônicas: métrica, decisão, trabalho, fila, análise ou estado vazio. A função controla hierarquia e densidade sem alterar o conteúdo.
- **Fase 15 — concluída em 04/08/2026.** Cabeçalhos canônicos foram compactados para contexto, título, orientação curta e uma única ação visível. O conteúdo operacional começa mais cedo sem alterar fluxos.
- **Fase 16 — concluída em 04/08/2026.** Decisão, estado e ação permanecem visíveis; explicações complementares e diagnósticos recuperáveis passam a abrir sob demanda com semântica nativa e foco acessível.
- **Fase 17 — concluída em 04/08/2026.** A Sala de Comando mostra cinco métricas essenciais na primeira leitura e preserva visitas, Meta/CAPI e recebíveis em análise sob demanda. A antiga ocultação posicional foi removida para que nenhum indicador desapareça silenciosamente.
- **Fase 18 — concluída em 04/08/2026.** As visões de corretor, gerente, superintendente e diretor agora apresentam cinco métricas decisórias na primeira leitura. Agenda, equilíbrio de carga/equipes e eficiência da IA permanecem disponíveis como contexto complementar sob demanda.
- O contrato está em `config/operational-ux-phase-018-role-metric-hierarchy.json`, a prova em `tests/contracts/role-metric-hierarchy.test.mjs` e o gate em `scripts/check-operational-ux-phase-018.mjs`.
- **Fase 19 — concluída em 04/08/2026.** Entrada diária e SLA do time agora priorizam decisão e exceção: quatro métricas de entrada, cinco métricas de SLA e quatro alertas urgentes permanecem visíveis; histórico, proveniência, distribuição detalhada, tempo médio e alertas adicionais abrem sob demanda.
- O contrato está em `config/operational-ux-phase-019-sla-intake-disclosure.json`, a prova em `tests/contracts/sla-intake-disclosure.test.mjs` e o gate em `scripts/check-operational-ux-phase-019.mjs`.
- **Fase 20 — concluída em 04/08/2026.** O Pipeline preserva decisão, próximo movimento, prioridades, controles e cartões na primeira leitura; diagnósticos, saúde, resumo das etapas, lentes, gargalos e ações avançadas permanecem no mesmo contexto sob demanda.
- O contrato está em `config/operational-ux-phase-020-kanban-decision-density.json`, a prova em `tests/contracts/kanban-decision-density.test.mjs` e o gate em `scripts/check-operational-ux-phase-020.mjs`.
- **Fase 21 — concluída em 04/08/2026.** Leads e Lead 360 mantêm identificação, contato, prioridade, próxima ação, filtros, tabela, edição e acompanhamento na primeira leitura; diagnóstico da carteira, contexto consolidado, qualidade da memória, explicação do score, histórico e matching permanecem sob demanda.
- O contrato está em `config/operational-ux-phase-021-leads-lead360-density.json`, a prova em `tests/contracts/leads-lead360-density.test.mjs` e o gate em `scripts/check-operational-ux-phase-021.mjs`.
- O componente compartilhado foi evoluído sem duplicação; métricas e estados vazios se classificam automaticamente. O Kanban foi marcado como trabalho e a inteligência de compradores como análise secundária.
- O contrato está em `config/operational-ux-phase-014-card-purpose-taxonomy.json`, a prova em `tests/contracts/card-purpose-taxonomy.test.mjs` e o gate em `scripts/check-operational-ux-phase-014.mjs`.
- A fase não alterou schema, dados, RLS, autenticação, integrações ou release.
- **Próxima fase:** compactar Tarefas e Agenda, mantendo hoje, atrasos, criação e conclusão visíveis; planejamento e contexto complementar ficam sob demanda.

## Objetivo

Reorganizar o produto existente para reduzir ruído, acelerar a próxima ação e aumentar a qualidade das decisões comerciais. Esta etapa não cria novos destinos primários no menu: consolida o shell, a Sala de Comando, o pipeline, leads, tarefas, projetos, campanhas, integrações e IA que já existem. Capacidades executivas novas entram como camadas de decisão nas telas atuais, sem aumentar a navegação.

## Diagnóstico factual que orienta o redesign

- O shell global monta sete superfícies auxiliares além do conteúdo principal. Elas precisam ser coordenadas para não competir pela atenção.
- A Sala de Comando possui múltiplas leituras por perfil, oito chamadas de dados e modos de visualização; a informação relevante precisa aparecer antes da análise detalhada.
- O pipeline concentra mais de 3.000 linhas e diversas filas, radares, mapas, lotes, briefs, matrizes, guias e painéis antes ou ao redor do Kanban. As capacidades são úteis, mas devem ser progressivas.
- A navegação canônica possui quatro grupos e até dezenove destinos dependendo do perfil. O usuário deve ver primeiro sua rotina, não todo o produto.
- A base real confirma que a maior necessidade é operacional: 21 tarefas vencidas, apenas 77 leads com próxima ação, 406 leads sem projeto, forte concentração de distribuição e baixo retorno estruturado de campanhas.

## Princípios de produto

1. Uma tela, uma decisão principal.
2. Três níveis de informação: agora, contexto e análise.
3. No máximo cinco indicadores primários por visão.
4. A IA explica e recomenda; a pessoa aprova ações sensíveis.
5. O papel do usuário altera a prioridade, não duplica a interface.
6. Dados importados e operação diária nunca aparecem misturados.
7. Cor comunica estado, não decoração.
8. Detalhes aparecem sob demanda em painel lateral, aba ou expansão.
9. Toda métrica precisa oferecer uma ação ou explicar por que é apenas informativa.
10. Desktop, tablet e celular preservam a mesma ordem de decisão.

## Arquitetura visual proposta

### Camada 1 — Agora

- Uma recomendação principal.
- Até três prioridades secundárias.
- Contagem de novos leads reais do dia, pendências e risco imediato.
- Ação direta sem navegar entre módulos.

### Camada 2 — Trabalho

- Kanban, carteira, agenda ou fila correspondente ao papel.
- Filtros persistentes e compactos.
- Edição e execução sem perder o contexto.

### Camada 3 — Análise

- Tendências, campanhas, distribuição, qualidade, memória e explicações da IA.
- Aberta somente quando o usuário pede detalhe.
- Sempre separa amostra insuficiente de recomendação confiável.

## Experiência por papel

### Corretor

Ordem: próxima ação, leads novos, follow-ups, agenda e materiais do projeto.

### Gerente

Ordem: gargalos, leads sem atendimento, distribuição, corretores sobrecarregados e conversão do time.

### Diretor

Ordem: riscos que exigem decisão, receita/forecast, campanhas, capacidade da operação e integridade Meta/CAPI.

## Dez diferenciais executivos que ainda não fecham o ciclo

O projeto contém partes importantes — decisões, gêmeos digitais, limites de capacidade, experimentos, orçamento e calibração — mas elas ainda não formam uma experiência executiva contínua. Portanto, “ausente” abaixo significa ausente **como capacidade funcional ponta a ponta para o Diretor**, e não necessariamente ausência total de tabela ou arquivo.

| #   | Capacidade executiva                         | Situação factual atual                                                                                                                                                                | Decisão que passa a ser possível                                                                            | Como entrar sem gerar ruído                                                                        |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Precisão histórica do forecast               | O forecast calcula o cenário atual, mas não há snapshot nem medição de `previsto × realizado`; a própria tela informa que não afirma evolução sem histórico.                          | Saber se a previsão é confiável, otimista ou conservadora por gerente, projeto e campanha.                  | Um indicador de precisão junto ao forecast e histórico em expansão lateral.                        |
| 2   | Meta, ritmo e “quanto falta”                 | Não há quota/meta operacional nem pacing comercial ligado ao realizado.                                                                                                               | Saber hoje se o mês está no ritmo e qual volume diário de visitas, propostas e vendas é necessário.         | Um único card “Meta do período”, com realizado, tendência e ritmo necessário.                      |
| 3   | Livro executivo de decisões                  | A base `atlas_decisions` e APIs existem, mas o Centro de Decisão atual monta uma fila temporária no navegador e não consolida responsável, prazo e resultado na experiência canônica. | Aprovar, delegar, acompanhar e medir cada decisão relevante.                                                | A recomendação principal vira uma decisão rastreável, sem criar outro módulo.                      |
| 4   | Simulador real da operação                   | A tela de cenários é uma calculadora manual sem API ou persistência; a tela de gêmeo digital lê listas brutas e não utiliza `digital_twin_snapshots`.                                 | Comparar redistribuição de leads, mudança de verba, reforço de escala ou foco de estoque antes de executar. | Botão “Simular impacto” dentro da decisão, abrindo um drawer com base real e premissas explícitas. |
| 5   | Economia unitária e margem de contribuição   | Há VGV, comissão, CPL e ROI, mas não existe visão de margem de contribuição, ponto de equilíbrio ou payback por projeto/campanha.                                                     | Separar volume aparente de resultado econômico real.                                                        | Substituir métricas financeiras redundantes por margem, payback e comissão líquida esperada.       |
| 6   | Custo da demora e receita em risco           | O sistema mostra atraso e SLA, mas não converte demora de contato, tarefa vencida ou proposta parada em impacto financeiro estimado.                                                  | Priorizar pelo dinheiro e conversão em risco, não apenas pela idade da pendência.                           | “Receita em risco agora” com os três maiores causadores e ação imediata.                           |
| 7   | Capacidade preditiva e risco de concentração | Existem limites estáticos por corretor, porém não há projeção de demanda futura versus escala, projeto e capacidade; a concentração atual também precisa virar alerta executivo.      | Antecipar sobrecarga, corrigir a roleta e decidir quem deve receber cada projeto antes da campanha escalar. | Heatmap compacto de capacidade futura; detalhes somente sob demanda.                               |
| 8   | Inteligência de ganho e perda                | Há rótulo final de ganho/perda para IA, mas não há taxonomia executiva completa de motivo, evitabilidade, concorrente, objeção e receita recuperável.                                 | Entender por que se perde e qual perda pode ser evitada por marketing, produto, gestão ou corretor.         | Pareto de cinco motivos e valor recuperável, com acesso ao recorte.                                |
| 9   | Incrementalidade de marketing                | Existem experimentos governados e atribuição, mas não há prova consolidada do que a mídia realmente causou versus o que apenas acompanhou a venda.                                    | Realocar verba por impacto incremental, não por último clique ou CPL isolado.                               | Campanhas exibem “atribuído”, “incremental estimado” e “amostra insuficiente” separadamente.       |
| 10  | Confiança, frescor e linhagem de cada KPI    | Há sinais pontuais de completude e ideias no roadmap, mas não uma camada transversal que explique cobertura, atualização, fonte e lacunas de cada número.                             | Decidir sabendo quais indicadores são sólidos e quais ainda exigem validação humana.                        | Selo discreto de confiança em cada KPI; fonte e cobertura aparecem ao abrir detalhes.              |

## Sala de Comando do Diretor — hierarquia aprimorada

### Primeira dobra: decidir

Exibir somente cinco indicadores:

1. Meta do período e ritmo necessário.
2. Forecast comprometido, provável e em risco, acompanhado de precisão histórica.
3. Margem/comissão líquida esperada.
4. Receita em risco pelo custo da demora.
5. Confiança geral dos dados usados na leitura.

Ao lado, mostrar **uma decisão recomendada**, contendo evidência, impacto, confiança, responsável sugerido, prazo e as ações “Aprovar”, “Delegar” e “Simular impacto”.

### Segunda dobra: controlar exceções

- Concentração e capacidade futura por projeto/equipe.
- Ganhos e perdas evitáveis.
- Campanhas por impacto incremental e qualidade do sinal Meta/CAPI.
- Decisões vencidas, executadas e sem resultado registrado.

### Terceira dobra: investigar

Forecast detalhado, coortes, distribuição, inventário, campanhas e memória da IA ficam em abas ou painéis laterais. Nenhum gráfico entra na primeira dobra se não mudar uma decisão naquele período.

## Regra de composição executiva

Cada insight deve seguir o mesmo contrato:

**Mudança observada → impacto estimado → evidência e confiança → decisão pedida → responsável e prazo → resultado medido.**

Se não houver evidência suficiente, o Atlas deve pedir coleta ou validação; nunca apresentar tendência, causalidade ou precisão como fato.

## Plano de 60 fases

### Ciclo 1 — Verdade visual e linha de base

1. Congelar métricas, rotas e contratos atuais antes do redesign, incluindo fórmula, fonte, frescor e cobertura.
2. Registrar o tempo e os cliques dos fluxos essenciais.
3. Separar dado operacional, importação histórica e amostra insuficiente; definir o snapshot executivo diário.
4. Definir o dicionário único de estados, cores e severidades.
5. Criar a matriz tela × papel × decisão principal, responsável, prazo e resultado esperado.

### Ciclo 2 — Shell mais leve

6. Reduzir a navegação inicial à rotina relevante para cada papel.
7. Mover destinos menos frequentes para busca e área "Mais".
8. Remover textos repetidos entre barra lateral, topo e cabeçalho.
9. Unificar busca, criação rápida, notificações e Copilot em uma faixa coordenada.
10. Carregar superfícies globais pesadas somente quando abertas.

### Ciclo 3 — Design system decisivo

11. Consolidar espaçamentos, raios, sombras, tipografia e densidade.
12. Limitar a paleta a neutros, azul de ação e cores de estado.
13. Padronizar cards de métrica, prioridade, fila e estado vazio.
14. Criar cabeçalho compacto com título, contexto e uma ação primária.
15. Aplicar disclosure progressivo a textos, explicações e diagnósticos.

### Ciclo 4 — Sala de Comando: primeira dobra

16. Trocar o hero amplo pelo cockpit executivo compacto descrito acima.
17. Exibir uma decisão recomendada persistente e até três sinais comprovados.
18. Limitar a primeira dobra às cinco métricas executivas acionáveis.
19. Separar "leads de hoje" de importações e bases antigas.
20. Exibir confiança, atualização, escopo e fonte do dado sem linguagem técnica.

### Ciclo 5 — Sala de Comando por papel

21. Corretor: ordenar ações por atraso, intenção e oportunidade.
22. Gerente: priorizar SLA, distribuição, carga e ausência de próxima ação.
23. Diretor: priorizar meta/ritmo, precisão do forecast, margem, receita em risco e decisões pendentes.
24. Manter uma mesma estrutura visual com conteúdo adaptativo.
25. Salvar a preferência de foco sem esconder alertas críticos.

### Ciclo 6 — Entrada e distribuição de leads

26. Mostrar entradas por dia sem misturar lotes importados.
27. Exibir recebidos por corretor com capacidade atual, capacidade projetada e participação percentual.
28. Destacar concentração excessiva, risco futuro de sobrecarga e fila sem responsável.
29. Simplificar seleção de corretores por projeto em uma única mesa de distribuição.
30. Exigir confirmação antes de mudanças em massa e registrar o resultado.

### Ciclo 7 — Pipeline orientado à ação

31. Colocar o Kanban como superfície central, não como último bloco da página.
32. Manter apenas uma fila curta de prioridades acima do quadro.
33. Mover radares, mapas, lotes e briefs para um painel de análise.
34. Reduzir o card a nome, projeto, urgência, valor/score e próxima ação.
35. Abrir histórico, qualificação e roteiro em painel lateral persistente.

### Ciclo 8 — Movimento e produtividade do Kanban

36. Preservar drag-and-drop, teclado, desfazer e histórico com feedback único.
37. Mostrar regra de avanço somente no momento da movimentação.
38. Ocultar colunas vazias por padrão sem perder acesso a elas.
39. Virtualizar ou paginar cards para manter fluidez com grandes carteiras.
40. Criar modo móvel de uma etapa por vez com gesto e ação fixa.

### Ciclo 9 — Lead 360 e rotina

41. Organizar Lead 360 em resumo, ação, histórico e matching.
42. Fixar a próxima ação no topo e evitar edição espalhada.
43. Unificar tarefas, agenda e follow-up em uma linha do tempo operacional.
44. Criar recuperação visual para lead sem projeto, sem orçamento ou sem consentimento.
45. Mostrar a completude mínima necessária para avançar a venda.

### Ciclo 10 — Projetos e materiais

46. Priorizar busca por projeto, incorporadora, região e tipologia.
47. Exibir estoque, preço e material vigente antes de análises secundárias.
48. Agrupar book, tabela, plantas, imagens e espelho em uma biblioteca única.
49. Mostrar versão e validade de arquivos no ponto de uso.
50. Levar material ao atendimento sem abrir várias telas.

### Ciclo 11 — Campanhas, Meta e IA

51. Mostrar campanha → lead → atendimento → resultado, sem chamar correlação de causalidade.
   **Concluída:** o relatório semanal agora mostra uma jornada factual por campanha, preserva custo ausente, mantém o detalhamento sob demanda e declara explicitamente que atribuição observada não prova causalidade.
52. Separar atribuição observada, impacto incremental estimado e amostra insuficiente.
   **Concluída:** atribuição, impacto incremental não estimado e suficiência descritiva agora aparecem como estados independentes; 30 leads sinalizam somente leitura descritiva e nunca causalidade.
53. Transformar falhas Meta/CAPI e dead letters em uma fila operacional clara.
   **Concluída:** a Saúde das Integrações agora consolida dead letters em uma fila sanitizada, prioriza Meta/CAPI, explica o motivo operacional e permite reprocessamento supervisionado exclusivo da diretoria sem expor payloads ou segredos.
54. Exibir recomendação da IA com evidência, confiança e ação supervisionada.
   **Concluída:** o Centro de Decisão agora mostra evidências observadas, separa regra determinística de confiança calibrada, declara quando a confiança não foi calibrada e encaminha toda recomendação para revisão humana contextual sem executar contatos, etapas ou orçamento.
55. Registrar decisão humana, responsável, prazo e resultado para fechar o aprendizado e o livro executivo.
   **Concluída:** o Centro de Decisão agora registra aceite, adaptação ou rejeição com justificativa, responsável e prazo; o resultado observado fecha o ciclo em um livro executivo isolado por organização, sem transformar recomendação em ação automática.

### Ciclo 12 — Performance e homologação

56. Persistir snapshots de forecast e medir previsto × realizado antes de declarar tendência.
   **Concluída:** o forecast canônico agora pode ser congelado em horizontes de 30, 60 ou 90 dias e aferido contra vendas observadas da mesma coorte; tendência só é declarada após três janelas independentes, comparáveis e com amostra mínima.
57. Adicionar loading local para manter navegação percebida como instantânea.
   **Concluída:** Sala de Comando, leads, pipeline, tarefas, agenda, Clientes 360, projetos e campanhas agora possuem fallbacks locais com geometria contextual; o shell permanece interativo e nenhum progresso ou dado fictício é exibido.
58. Validar cenários com dados reais, premissas explícitas e comparação com o resultado posterior.
   **Concluída:** decisões ligadas a leads reais agora podem congelar uma métrica-base, registrar premissa e resultado esperado e comparar a mesma fonte somente após a janela definida; ausência de evidência não é tratada como acerto e nenhuma ação comercial é automática.
59. Medir tempo, cliques, erro, leitura, conclusão e qualidade das decisões antes/depois.
   **Concluída:** sessões operacionais agora separam linha de base e experiência F59, medem seis dimensões sem conteúdo pessoal e só liberam comparação com amostra mínima; leitura é proxy declarado e qualidade vem de avaliação humana, sem alegação causal.
60. Liberar o redesign por gate, com rollback, checklist e aceite do Diretor sobre a utilidade das decisões.
   **Concluída:** o Centro de Decisão agora impede liberação sem amostra e critérios operacionais suficientes, exige utilidade e justificativa explícitas da Diretoria e registra aprovação ou rollback no `feature_flags` isolado por organização, sem alegação causal nem publicação automática.

## Metas mensuráveis

- Próxima ação visível em menos de 3 segundos.
- Fluxos principais concluídos com no máximo 3 interações após localizar o registro.
- Primeira dobra com no máximo 5 métricas e 4 ações.
- Redução de pelo menos 40% dos blocos simultâneos no dashboard e pipeline.
- Redução de pelo menos 30% do JavaScript inicial das rotas críticas.
- Mais de 80% dos leads ativos com próxima ação.
- Mais de 85% dos leads vinculados a um projeto.
- Distribuição dentro da capacidade configurada por corretor.
- Mais de 80% das leads de campanha com atribuição estruturada.
- Mais de 60% das recomendações de IA com decisão humana e resultado registrados.
- 100% das decisões executivas com responsável, prazo, evidência e resultado.
- Pelo menos 90% das perdas novas com motivo estruturado e evitabilidade classificada.
- Erro do forecast medido por período, projeto e liderança; nenhuma alegação de melhora sem snapshot comparável.
- Toda métrica executiva com fonte, atualização, cobertura e nível de confiança acessíveis.
- Campanhas sem base causal suficiente identificadas como “atribuição”, nunca como ganho incremental comprovado.

## Ordem recomendada de execução

Executar primeiro as fases 1–15 como fundação comum. Em seguida, fazer 16–30 para tornar a Sala de Comando e a distribuição imediatamente úteis. Nessa etapa, integrar a base já existente de `atlas_decisions`, `digital_twin_snapshots`, limites de capacidade, orçamento e experimentos antes de criar novas tabelas. Só então aplicar 31–45 ao Kanban e ao Lead 360. Projetos, campanhas, Meta e IA entram depois porque dependem da disciplina operacional construída nos ciclos anteriores.

## Critério de aprovação

O novo layout não será aprovado apenas por aparência. Ele deve reduzir tempo, cliques e erros sem remover acesso às capacidades atuais, preservar RBAC/RLS e demonstrar melhoria nos fluxos reais de corretor, gerente e diretor.

## Progresso desta sequência

- Fase 21 concluída: Leads e Lead 360 orientados à decisão, com profundidade sob demanda.
- Fase 22 concluída: Tarefas e Agenda priorizam atrasos, hoje e próxima ação; carga da equipe e composição detalhada permanecem sob demanda.
- Fase 23 concluída: Lead 360 reúne próxima ação, tarefas abertas, visitas e histórico recente em uma linha operacional, sem duplicar dados.
- Fase 24 concluída: dados essenciais ausentes são recuperáveis no ponto de uso, com prioridade e acesso ao cadastro canônico.
- Fase 25 concluída: a prontidão mínima para avançar ficou explícita, explicável e acionável, sem bloquear automaticamente o funil.
- Fase 26 concluída: o Hub de Materiais localiza projeto e oferta por incorporadora, região e tipologia, preservando o projeto vindo do atendimento e o kit vigente no ponto de uso.
- Fase 27 concluída: estoque disponível, preço de entrada e kit vigente agora aparecem antes das análises secundárias, usando `properties` e `project_materials` como fontes canônicas e sem apresentar ausência de preço como `R$ 0`.
- Fase 28 concluída: book, tabela, espelho, plantas, imagens, vídeos e documentos foram reunidos em uma biblioteca operacional compacta por projeto, preservando busca, filtros, validação, compartilhamento e versionamento.
- Fase 29 concluída: versões vencidas, próximas do vencimento e pendentes de validação agora formam uma fila curta por prioridade, reutilizando a validação auditável e o upload versionado existentes.
- Fase 30 concluída: campanhas agora priorizam vendas e receita observadas, investimento realmente conhecido e uma decisão contextual; custo ausente não vira zero e cadastro, briefings e criativos permanecem acessíveis sob demanda.
- Fase 31 concluída: o Kanban virou a superfície canônica do Pipeline; somente a fila curta `Comece por aqui` permanece aberta antes do quadro, enquanto briefings e diagnósticos redundantes continuam acessíveis sob demanda.
- Fase 32 concluída: `Comece por aqui` tornou-se a única fila prioritária visível, limitada a três decisões e ordenada pela lente ativa, SLA, próxima ação, temperatura, score, valor e etapa; o restante permanece no quadro e nas análises progressivas.
- Fase 33 concluída: briefing, diagnóstico, saúde, etapas, lentes, radar, mapas e ações em lote agora pertencem ao mesmo painel secundário coordenado; apenas uma análise pode permanecer aberta por vez e o Kanban continua como workspace principal.
- Fase 34 concluída: cada card do Kanban mostra primeiro somente identidade, urgência, próxima ação e um comando principal; score, sinais, fatos, preview, resumo IA, Lead 360 e avanço de etapa permanecem no contexto sob demanda.
- Fase 35 concluída: toda movimentação do Kanban usa um feedback único com origem, destino e estados `movendo`, `etapa atualizada` ou `movimento não confirmado`; rollback, confirmação terminal, histórico e desfazer permanecem preservados.
- Fase 36 concluída: arrastar, teclado, seletor, avanço rápido, decisão confirmada e desfazer agora declaram o método usado e convergem no mesmo recibo acessível de movimento; API, confirmação, rollback, histórico e responsividade permanecem preservados.
- Fase 37 concluída: a orientação de avanço deixou de ocupar espaço permanente e aparece somente quando um card recebe foco ou começa a ser arrastado; limites da primeira etapa, destino anterior/próximo e confirmação terminal surgem no momento da decisão.
- Fase 38 concluída: colunas realmente vazias agora ocupam menos espaço sem desaparecer; foco, ação, vizinhança de movimento e arraste restauram a largura operacional para preservar leitura, teclado, drop e estrutura do funil.
- Fase 39 concluída: identidade, volume e comando da etapa permanecem imediatos, enquanto saúde, diagnóstico, prioridade da lente e microcopy foram reunidos em um contexto nativo e acessível aberto somente sob demanda.
- Fase 40 concluída: comando da etapa e lead prioritário foram unidos em uma ponte única de decisão; o bloco intermediário repetido saiu da coluna, a ação principal permaneceu imediata e o primeiro card passou a continuar visualmente a prioridade.
- Fase 41 concluída: o ritmo semântico das colunas passou a separar melhor entrada, avanço, negociação e fechamento sem alterar as etapas reais do funil.
- Fase 42 concluída: o resumo numérico das etapas foi compactado para apoiar comparação rápida sem competir com os cards.
- Fase 43 concluída: contexto e comando da etapa foram reorganizados para manter a ação decisiva antes da explicação complementar.
- Fase 44 concluída: cabeçalho e primeiro card passaram a formar uma continuidade visual única, preservando foco, arraste e leitura da prioridade.
- Fase 45 concluída: a ação comercial principal permaneceu imediata e utilidades repetidas de execução, Copilot e contato foram consolidadas sob demanda.
- Fase 46 concluída: situação comercial, última interação e próxima ação agora formam uma leitura operacional única no Lead 360; cockpit analítico e histórico completo permanecem acessíveis sob demanda.
- Fase 47 concluída: a linha operacional do Lead 360 mostra apenas os três registros mais relevantes; atrasos e compromissos mantêm prioridade, enquanto o restante e o histórico completo continuam acessíveis sob demanda.
- Fase 48 concluída: a edição do perfil comercial mantém etapa, temperatura, orçamento máximo e região na primeira leitura; identidade, contato, origem, faixa mínima, dormitórios e observações continuam editáveis sob demanda, com um único salvamento preservado.
- Fase 49 concluída: perfil, evidências de qualificação e rotina passaram a ter responsabilidades distintas; a recomendação repetida saiu dos painéis analíticos e permanece no resumo operacional e na linha do tempo canônica.
- Fase 50 concluída: o Lead 360 abre um kit único já filtrado pelo projeto e preserva o retorno à lead; estoque, simulação, perfil e Copilot permanecem sob demanda, sem duplicar biblioteca ou alterar governança.
- Fase 41 concluída: as colunas passaram a separar apenas decisão da etapa e carteira; a linha decorativa saiu, os intervalos repetidos diminuíram e a prioridade conserva uma transição própria antes dos cards comuns.
- Fase 42 concluída: volume, VGV e chance configurada da etapa agora formam uma única síntese numérica rotulada, acessível e compacta, preservando a mesma fonte e os mesmos cálculos.
- Fase 43 concluída: o comando da etapa tornou-se a superfície dominante e o contexto fechado deixou de competir como outro card; foco, abertura e leitura completa continuam preservados.
- Fase 44 concluída: a decisão da etapa e o primeiro lead agora formam uma sequência visual contínua; a prioridade permanece marcada sem criar uma terceira superfície pesada.
- Fase 45 concluída: cada card mantém uma ação comercial dominante, oferece decisões secundárias no primeiro nível e reúne execução, Copilot e contato em uma única área progressiva, sem remover atalhos.
