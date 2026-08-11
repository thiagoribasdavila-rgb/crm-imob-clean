# ATLAS ONE V3000 — Fase 37: inventário factual dos cards

## Resultado

A Fase 37 estabelece uma fonte verificável para o próximo ciclo visual sem alterar interface, APIs, banco, autenticação ou operação. O inventário distingue quatro superfícies operacionais, duas primitivas canônicas e quatro resíduos que não devem orientar o redesenho.

## Superfícies que realmente sustentam decisões

| Área | Rota canônica | Base visual | Dados reais | Decisão apoiada | Status |
| --- | --- | --- | --- | --- | --- |
| Sala de Comando | `/dashboard` | `MetricCard`, `DecisionContractStrip`, `AtlasMetricDeck` | intake diário, dashboards por papel, SLA da equipe e briefing | onde agir agora e por quê | Operacional |
| Leads | `/leads` | `MetricCard`, `AtlasDetailDisclosure` | perfil autenticado, carteira, transferência e primeira ação | qual cliente atender e qual ação executar | Operacional |
| Pipeline | `/pipeline` | `AtlasCard`, `AtlasMetric` e cards de oportunidade da própria página | API do pipeline com atualização de etapa | qual negócio mover, com projeto, risco, SLA e próxima ação | Operacional |
| Relatórios | `/reports` | `WeeklyDeveloperPerformance` | aquisição semanal, produtividade e briefing | qual incorporador, campanha e corretor geram avanço | Operacional |

As evidências de arquivo, rota, papel, endpoint e marcador de implementação estão registradas em `config/v3000-phase-37-card-inventory.json` e são validadas por script.

## Primitivas canônicas

### `AtlasCard`

`components/ui/AtlasCard.tsx` já oferece o contrato visual necessário para consolidação:

- densidade `compact` ou `comfortable`;
- ênfase `standard`, `primary` ou `quiet`;
- propósito `work`, `decision`, `queue` ou `analysis`;
- cabeçalho com título, descrição e ação;
- métrica com tom e relevância.

### `MetricCard`

`components/atlas/metric-card.tsx` é o adaptador canônico de métricas. Ele normaliza os tons sem duplicar marcação ou estilo.

## Resíduos identificados

| Item | Evidência | Situação | Conduta nesta fase |
| --- | --- | --- | --- |
| Dashboard duplicado | `app/(atlas)/dashboard/page.tsx` | valores fixos como `12.540`, `R$85M` e `42` | identificar, não promover e não remover ainda |
| Kanban antigo | `components/crm/KanbanBoard.tsx` | cadeia interna sem referência externa encontrada | manter isolado até decisão de remoção segura |
| Card de lead direto no Supabase | `components/crm/leads/LeadCard.tsx` | operação direta e sem import externo encontrado | não usar como referência do V3000 |
| Card de pipeline inline | `components/pipeline/KanbanCard.tsx` | card mínimo, inline e sem import externo encontrado | não usar como referência do V3000 |

O inventário não apaga esses arquivos. A remoção, se aprovada, precisa de uma fase própria com prova de rotas e regressão.

## Achados principais

1. **A base moderna já existe.** O trabalho seguinte deve consolidar o contrato decisório, não criar outro sistema de cards.
2. **Há duas ideias de dashboard no código.** Somente `app/(crm)/dashboard/page.tsx` está registrado como Command Center operacional.
3. **Os principais cards de oportunidade vivem dentro de páginas grandes.** Isso preserva riqueza funcional, mas aumenta risco de divergência visual e justifica a extração progressiva — sem reescrever dados ou fluxos.
4. **Os dados críticos já estão conectados.** Dashboard, Leads, Pipeline e Relatórios possuem endpoints reais e não devem ser substituídos por mocks durante o refinamento.
5. **O ruído vem mais da hierarquia do que da falta de informação.** A próxima fase deve organizar identidade, sinal, evidência, ação e confiança numa leitura única.

## Base objetiva para a Fase 38

A Fase 38 deve definir um contrato único de card de decisão com estes campos, preservando todas as APIs atuais:

1. identidade: cliente, campanha, projeto ou incorporador;
2. contexto: responsável, etapa e período;
3. sinal principal: risco, oportunidade, SLA ou conversão;
4. evidência: dado que sustenta o sinal;
5. próxima ação: verbo, destino e prazo;
6. confiança: origem e atualização do dado.

Não é objetivo da Fase 38 remover informações. O objetivo é exibir primeiro o que muda uma decisão e revelar o restante sob demanda.

## Limites comprovados

- nenhuma tabela, migration, policy ou dado foi alterado;
- nenhuma rota ou componente de runtime foi alterado;
- nenhuma dependência foi adicionada;
- nenhum resíduo foi removido;
- nenhum dado fixo foi incorporado à base canônica.

## Verificação

```bash
npm run v3000:phase-37:check
npm run v3000:phase-37:test
```

O teste negativo também comprova que o gate falha se uma superfície perde evidência operacional, se o dashboard fixo é promovido como canônico ou se um componente legado passa a ter referência externa sem atualização do inventário.
