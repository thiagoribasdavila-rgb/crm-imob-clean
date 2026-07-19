# Fase 022 — Resultado comercial da navegação

## Resultado

Os 25 destinos canônicos do Atlas agora possuem um contrato de produto com três respostas obrigatórias. São 19 módulos operacionais e 6 comandos contextuais; a superfície interna de evolução (`/atlas-v3`) permanece disponível fora da navegação diária.

1. Qual pergunta comercial a tela responde?
2. Qual é a ação principal esperada?
3. Qual evidência comprova que a tarefa avançou?

A navegação deixa de ser apenas um catálogo de páginas e passa a representar decisões e tarefas reais. Nenhuma rota foi removida, redirecionada ou modificada nesta fase.

## Resultados por área

| Área | Pergunta central | Resultado esperado |
| --- | --- | --- |
| Command Center | O que exige atenção agora? | Prioridade aberta e tratada |
| Leads e Cliente 360 | Quem atender e com qual contexto? | Próxima ação registrada |
| Pipeline, tarefas e agenda | O que precisa avançar? | Etapa ou compromisso atualizado |
| Projetos e imóveis | Qual oferta atende o cliente? | Projeto, unidade ou material selecionado |
| Gestão e distribuição | Onde apoiar e quem deve assumir? | Responsável único e decisão rastreável |
| Vendas e relatórios | Qual ação protege receita? | Forecast, fechamento ou decisão documentados |
| Marketing e Revenue Engine | Qual campanha gera resultado real? | Custo, origem, etapa e receita atribuídos |
| IA e Centro de Decisão | Qual recomendação merece revisão? | Decisão humana registrada |
| Integrações e evolução | O que está pronto ou bloqueado? | Teste e gate com evidência real |

O contrato detalhado por rota está em `config/evolution-phase-022-navigation-commercial-outcomes.json`.

## Jornadas críticas

Foram definidos limites de até três ações para seis jornadas essenciais:

- cadastrar uma nova lead;
- agir na prioridade do dia;
- avançar uma oportunidade;
- localizar material vigente;
- distribuir uma lead;
- diagnosticar uma integração.

Esses limites são objetivos de design, não métricas de uso inventadas. A confirmação comportamental dependerá da telemetria real já governada pelo Atlas.

## Decisões sobre nomes ambíguos

O inventário da Fase 021 foi convertido em decisões de produto:

| Conceito | Destino principal | Compatibilidade preservada |
| --- | --- | --- |
| Automações | `/automations` | `/automation` |
| Pipeline visual | `/pipeline` | `/kanban` |
| Inteligência de criativos | `/marketing/creatives` | `/creatives` |
| Agentes especializados | `/atlas-v3/agents` | `/agents` |
| Inteligência operacional | `/intelligence` | `/ai-insights` |
| Relatórios | `/reports` | `/analytics` |
| Conversas | `/conversations` | `/chat` |

As rotas de compatibilidade ainda não foram redirecionadas. A próxima medição deverá identificar links, favoritos, integrações e uso antes dessa mudança.

## Política das rotas de apoio

- Rotas dinâmicas abrem a entidade dentro da jornada; não viram itens da sidebar.
- Rotas profundas aparecem por contexto, busca ou ação da área responsável.
- Rotas históricas permanecem fora da navegação ativa até existir plano seguro de compatibilidade.
- Aprovações, notificações, busca e inteligência continuam como utilidades contextuais.

## Segurança e honestidade

- Nenhuma decisão automática sobre pessoas foi autorizada.
- Nenhuma métrica comportamental foi inventada.
- Nenhum dado de produção foi consultado ou alterado.
- Nenhum redirecionamento foi criado.
- O bloqueio da Fase 020 continua ativo e independente desta evolução documental.

## Próxima fase

Fase 023 — **Arquitetura de navegação · Medir a linha de base**.

Ela deverá medir descoberta, profundidade estrutural e dependências internas das jornadas definidas aqui, sem confundir objetivo de design com uso real comprovado.
