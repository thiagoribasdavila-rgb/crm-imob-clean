# Fase 021 — Inventário da arquitetura de navegação

## Resultado

A Onda 002 começou com um mapa verificável da navegação do Atlas V3. Foram identificadas **141 rotas CRM rastreadas**, sem consultar dados comerciais, variáveis secretas ou usuários.

Esta fase não redesenha, remove ou redireciona rotas. Ela cria a base para reduzir ambiguidade com segurança nas próximas etapas.

## Topologia medida

| Camada de rota | Quantidade | Decisão nesta fase |
| --- | ---: | --- |
| Destinos canônicos | 25 | Preservar; todos existem |
| Rotas dinâmicas de contexto | 29 | Preservar dentro das jornadas |
| Rotas profundas de apoio | 71 | Manter endereçáveis e revisar descoberta |
| Rotas de topo fora do catálogo | 15 | Classificar antes de consolidar |
| Entrada com redirecionamento | 1 | Preservar `/` → `/dashboard` |

Após a consolidação da Fase 93, os 25 destinos canônicos são formados por 19 itens principais e 6 comandos contextuais. O dock móvel deriva quatro itens desse mesmo catálogo; ele não cria uma quarta fonte de verdade.

## Como o App Router está organizado

- `app/(crm)/layout.tsx` mantém autenticação, shell e superfícies globais entre as páginas.
- `app/(crm)/page.tsx` leva a entrada autenticada para `/dashboard`.
- `AppShell` preserva sidebar, topbar, dock e centros globais; o conteúdo da página reinicia quando o caminho muda.
- Não há layouts aninhados dentro do grupo CRM. Loading e recuperação de erro são compartilhados no nível do grupo.

Essa leitura evita o erro de colocar todas as 141 páginas na sidebar. Rotas de detalhe e de fluxo continuam contextuais; somente destinos recorrentes pertencem à navegação principal.

## Superfícies de topo fora do catálogo

As seguintes rotas foram classificadas, não removidas:

- **Ativas por contexto:** `/intelligence`, `/notifications`, `/search` e `/approvals`.
- **Candidatas à consolidação:** `/agents`, `/ai-insights`, `/analytics`, `/chat`, `/creatives` e `/kanban`.
- **Sobreposição a decidir:** `/automation` e `/automations`.
- **Compatibilidade ou legado:** `/atlas-v2` e `/pipedrive`.
- **Superfície interna de evolução:** `/atlas-v3`, preservada fora da navegação operacional diária.

Antes de qualquer redirecionamento, a Fase 022 deverá provar qual tarefa comercial cada superfície resolve e se há links, favoritos ou integrações dependentes.

## Riscos encontrados

1. Quinze páginas de topo existem fora da navegação governada; uma delas é a superfície interna `/atlas-v3`, e as demais ainda exigem descoberta contextual consistente.
2. Três grupos apresentam sobreposição semântica clara: automação, pipeline/kanban e criativos.
3. Um único limite de erro e carregamento atende 141 rotas; o isolamento por domínio deverá depender de evidência real de falha.
4. Oito superfícies globais persistem no shell; novos overlays só devem entrar após auditoria de foco, teclado e camadas.

## Proteções mantidas

- Nenhuma rota foi excluída.
- Nenhum redirecionamento novo foi criado.
- Nenhum dado de produção foi lido ou alterado.
- Nenhuma chave de ambiente foi consultada.
- O bloqueio da Fase 020 continua ativo: este inventário não equivale a homologação de staging.

## Evidência reproduzível

O comando `npm run navigation-architecture:inventory` recompõe o mapa a partir das páginas rastreadas pelo Git e do catálogo em `lib/atlas/navigation.ts`. O comando `npm run navigation-architecture:check` compara essa medição com o contrato desta fase.

## Próxima fase

Fase 022 — **Arquitetura de navegação · Definir o resultado comercial**.

Ela deverá estabelecer a decisão ou tarefa atendida por cada camada e pelos grupos ambíguos, sem iniciar ainda uma remoção em massa.
