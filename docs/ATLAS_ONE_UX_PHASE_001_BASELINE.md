# Atlas One — Fase 1: baseline operacional e visual

Data de conclusão: 04/08/2026  
Status: **aprovada**

## Resultado

A Fase 1 congelou a linha de verdade necessária para evoluir a experiência sem trocar fórmulas, fontes, rotas ou escopos silenciosamente. O baseline verificável contém:

- 19 destinos canônicos do produto;
- 5 rotas contextuais existentes;
- 15 contratos de métricas críticas;
- 10 invariantes de decisão, segurança e comunicação;
- o snapshot operacional usado pelo plano de 60 fases;
- 3 riscos que precisam permanecer visíveis durante o redesenho.

Fonte de verdade: `config/operational-ux-phase-001-baseline.json`  
Verificador: `scripts/check-operational-ux-phase-001.mjs`  
Comando: `npm run ux:phase-001:check`

## Rotas congeladas

| Destino | Rota | Estado físico | Observação |
|---|---|---:|---|
| Command Center | `/dashboard` | colisão | 4 implementações físicas |
| Leads | `/leads` | única | contrato preservado |
| Pipeline | `/pipeline` | única | contrato preservado |
| Tarefas | `/tasks` | única | contrato preservado |
| Agenda | `/calendar` | única | contrato preservado |
| Atividades | `/activity` | única | contrato preservado |
| Clientes 360 | `/customers` | única | contrato preservado |
| Projetos | `/developments` | única | contrato preservado |
| Reativação | `/leads/import` | única | contrato preservado |
| Copilot | `/ai-dashboard` | colisão | 2 implementações físicas |
| Corretores | `/brokers` | única | contrato preservado |
| Distribuição | `/distribution` | única | contrato preservado |
| Vendas | `/sales` | colisão | 2 implementações físicas |
| Relatórios | `/reports` | única | contrato preservado |
| Revenue Engine | `/revenue-engine` | colisão | 2 implementações físicas |
| Usuários e acessos | `/users` | única | contrato preservado |
| Vendas externas | `/external-sales` | única | contrato preservado |
| Integrações | `/integrations` | única | contrato preservado |
| Configurações | `/settings` | única | contrato preservado |

As colisões são tratadas como risco P0. Elas não foram removidas nesta fase porque a escolha da implementação canônica exige prova funcional de autenticação, API, persistência, permissões e navegação. Até essa decisão, nenhum redesign deve copiar componentes entre essas versões.

## Contratos de métricas congelados

Cada contrato declara fórmula, base monetária, origem, API, implementação, período, frescor, cobertura, política de comparação e lacuna conhecida.

| Grupo | Métricas protegidas | Limite atual que deve continuar explícito |
|---|---|---|
| Entrada e distribuição | leads criados hoje; recebidos por corretor | importações podem contaminar “hoje”; fallback não recompõe transferências antigas |
| SLA e rotina | primeiro contato da diretoria e gerência; follow-ups vencidos; sem próxima ação | leituras usam escopos e critérios diferentes; recuperação ainda não é medida |
| Qualificação | leads quentes | score e temperatura podem ter metodologias distintas |
| Pipeline e forecast | pipeline bruto; forecast executivo; forecast canônico | orçamento não é receita; forecasts usam bases e probabilidades diferentes |
| Conversão e campanhas | conversão executiva; conversão observada; aquisição semanal | não é análise de coorte nem prova de incrementalidade; custo Meta pode estar ausente |
| Produtividade e IA | revisão semanal; uso de IA em 30 dias | zero só vale quando a fonte foi medida; uso não prova impacto comercial |

## Snapshot preservado

Os números abaixo foram registrados pelo diagnóstico de 04/08/2026 e **não foram consultados novamente nesta fase**:

- 21 tarefas vencidas;
- 77 leads com próxima ação;
- 406 leads sem projeto;
- concentração de distribuição registrada qualitativamente;
- baixo retorno estruturado de campanhas registrado qualitativamente.

Eles são referência de planejamento, não um painel em tempo real. Antes de qualquer exibição ao usuário, precisam ser recalculados com escopo, período e frescor visíveis.

## Regras que o redesign não pode violar

1. Toda leitura respeita organização, papel e hierarquia.
2. Importação histórica não é entrada operacional diária.
3. Não declarar melhora ou piora sem snapshot comparável.
4. Forecast não é receita realizada.
5. Não declarar precisão da IA sem resultado observado.
6. Atribuição não é incrementalidade.
7. Zero sem fonte medida deve aparecer como indisponível.
8. Ações sensíveis continuam exigindo aprovação humana.
9. Uma rota canônica precisa de contrato explícito.
10. Mudança de contrato exige nova versão do baseline.

## Riscos priorizados

### P0 — colisões de rotas canônicas

`/dashboard`, `/ai-dashboard`, `/sales` e `/revenue-engine` possuem mais de uma implementação física. O risco é o build ou uma consolidação futura selecionar uma experiência diferente sem preservar os contratos reais.

### P1 — divergência de forecast

Há cálculo executivo sobre leads, forecast canônico sobre oportunidades e cálculo local em relatórios. Eles não podem receber o mesmo rótulo visual antes da reconciliação de base, fórmula e cobertura.

### P1 — contaminação da entrada diária

“Leads criados hoje” usa `created_at`; lotes importados no mesmo período podem inflar a leitura operacional.

## Validação

O verificador aprovado confirma automaticamente:

- presença e unicidade dos contratos;
- correspondência entre menu e rotas físicas;
- registro explícito das quatro colisões conhecidas;
- existência das APIs e implementações das métricas;
- completude dos campos metodológicos;
- presença das invariantes, riscos e snapshot.

## Impacto e segurança

Esta fase não alterou páginas, cálculos, APIs, migrations, Supabase, usuários, dados, RLS, integrações, credenciais ou deploy. Ela cria a proteção necessária para que as próximas melhorias sejam mensuráveis e não quebrem a operação existente.

## Próxima etapa recomendada

Executar a Fase 2: medir as rotinas críticas por papel — tempo, cliques, trocas de contexto, conclusão e erro — usando este baseline como referência. O redesenho só deve começar depois dessa medição.
