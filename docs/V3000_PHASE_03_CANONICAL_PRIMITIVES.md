# ATLAS ONE V3000 — Fase 3: primitives canônicos

## Objetivo

Definir a biblioteca visual canônica que sustentará o template V3000 sem substituir fluxos, APIs ou telas operacionais já validadas. Esta fase consolida o que já existe e cria uma rota segura para reduzir duplicidade.

## Resultado da auditoria

O projeto já possui uma base visual madura. Os dois núcleos com maior adoção são:

- `components/ui/AtlasUI.tsx`: 85 importações;
- `components/ui/AtlasCard.tsx`: 73 importações.

Esses arquivos são a base oficial. Wrappers existentes continuam válidos quando acrescentam semântica operacional, mas não devem criar uma segunda aparência.

## Mapa canônico

| Necessidade | Componente canônico | Regra V3000 |
| --- | --- | --- |
| Superfície, painel e card | `AtlasCard` | Todo agrupamento visual relevante deve informar `purpose`, `density` e `emphasis`. |
| Cabeçalho de card | `AtlasCardHeader` | Um título, uma descrição curta e no máximo uma ação contextual visível. |
| Métrica | `AtlasMetric` | Métrica principal deve usar `relevance="primary"`; as demais ficam como apoio. |
| Métrica compatível com telas atuais | `components/atlas/metric-card.tsx` | Wrapper oficial enquanto houver chamadas com tons operacionais antigos. |
| Badge genérico | `AtlasBadge` | Estado visual simples sem interpretação de negócio. |
| Estado operacional | `StatusBadge` | Usar quando o estado possuir significado, tom e explicação definidos no domínio. |
| Estado vazio | `AtlasEmpty` | Base oficial; o wrapper `EmptyState` permanece para compatibilidade. |
| Erro recuperável | `AtlasRecoverableError` | Preferido quando existe tentativa segura de recuperação. Nunca expor erro técnico. |
| Erro estático | `ErrorState` | Somente quando a tela não dispõe de retry controlado. |
| Skeleton inline | `AtlasSkeleton` | Conteúdo pequeno ou parte de um card. |
| Loading de página | `ProgressivePageLoading` | Preserva hierarquia visual e escolhe variante por tipo de tela. |
| Loading de detalhe | `LoadingState` | Lista curta ou bloco secundário já montado. |
| Progresso | `AtlasProgress` | Sempre com limite de 0 a 100 e rótulo acessível. |
| Cabeçalho de página | `PageHeader` | Título decisório, contexto progressivo e no máximo uma ação principal. |
| Link de ação | `AtlasActionLink` | Links com semântica de ação primária ou secundária. |
| Botão de formulário | `components/ui/button.tsx` | Base para ações mutáveis, submissões e controles locais. |
| Campo de formulário | `components/ui/input.tsx` | Base para inputs; validação e rótulo continuam no formulário de domínio. |
| Seção informacional | `AtlasSection` | Agrupa uma responsabilidade clara da página. |
| Faixa de decisão | `AtlasDecisionStrip` | Até cinco sinais principais, sem repetir o dashboard inteiro. |
| Deck de métricas | `AtlasMetricDeck` | Indicadores secundários entram em disclosure progressivo. |
| Fila prioritária | `AtlasPriorityQueue` | Ações ordenadas por impacto, SLA ou risco, nunca por decoração. |
| Detalhe progressivo | `AtlasDetailDisclosure` | Conteúdo analítico que não precisa competir com a decisão principal. |

## Duplicidades classificadas

### Aposentadoria programada

- `components/atlas/MetricCard.tsx`: implementação antiga com nome conflitante por diferença de maiúsculas. Ainda é usada somente por `app/(atlas)/dashboard/page.tsx`.
- `components/analytics/MetricCard.tsx`: componente inline, tipagem `any`, aparência desconectada e sem adoção confirmada.
- `components/analytics/StartCard.tsx`: arquivo chamado `StartCard`, mas exporta `StatCard`; aparência inline e sem adoção confirmada.
- `components/core/StatCard.tsx`: arquivo vazio.
- `components/core/DataTable.tsx`: arquivo vazio.
- `components/core/Loading.tsx` e `components/core/LoadingSkeleton.tsx`: não devem competir com os estados canônicos.

Nenhum desses arquivos será removido antes de a referência ativa do dashboard alternativo ser migrada e os testes de importação confirmarem ausência de consumo.

### Compatibilidade preservada

- `components/atlas/metric-card.tsx` adapta tons antigos para `AtlasMetric`; é um wrapper útil e não uma implementação concorrente.
- `components/atlas/empty-state.tsx` delega integralmente a `AtlasEmpty`.
- `StatusBadge` delega a `AtlasBadge`, acrescentando a semântica de `OperationalState`.

## Contrato visual V3000

1. Uma página apresenta primeiro a decisão, depois a ação e somente então a análise.
2. No máximo cinco métricas ficam expostas na primeira leitura.
3. Cada card deve ter uma responsabilidade: decisão, fila, trabalho ou análise.
4. Cor representa estado; não é usada apenas como ornamentação.
5. Emojis ou símbolos só aparecem quando aceleram reconhecimento e sempre recebem alternativa textual ou `aria-hidden`.
6. Loading preserva o formato do conteúdo que chegará.
7. Estado vazio explica por que não há dados e qual é o próximo passo possível.
8. Erro nunca expõe banco, schema, stack ou provedor ao usuário.
9. Toda ação mutável deve ter estado desabilitado, ocupado e retorno de sucesso ou falha.
10. Componentes canônicos recebem tokens visuais; páginas não criam novas cores locais.

## Estratégia de adoção sem risco

### Onda 1 — compatibilidade

- manter todos os wrappers já adotados;
- bloquear a criação de novos cards locais;
- usar os primitives canônicos apenas em novas intervenções sobre telas existentes.

### Onda 2 — consolidação

- migrar o dashboard alternativo de `components/atlas/MetricCard.tsx` para `components/atlas/metric-card.tsx`;
- substituir cards analíticos inline por `AtlasMetric`;
- retirar arquivos vazios após prova de ausência de referências.

### Onda 3 — normalização

- mover estilos repetidos de cards, métricas, estados e botões para os tokens e classes canônicas;
- eliminar redefinições posteriores de `.atlas-panel`, `.atlas-metric`, `.atlas-button-*` e `.atlas-empty-state` em `app/globals.css` somente depois de comparação visual automatizada.

## Critérios de aceite para futuras migrações

- mesma ação e mesma persistência de antes;
- nenhuma mudança de API ou contrato de dados;
- foco visível e navegação por teclado;
- estados loading, vazio, erro e sucesso comprovados;
- contraste e legibilidade preservados;
- nenhuma nova cor hardcoded no componente de página;
- build, lint e testes do módulo aprovados no fechamento do pacote.

## Fora do escopo desta fase

- exclusão de componentes antigos;
- alteração das telas operacionais;
- mudança em APIs, banco ou Supabase;
- alteração do shell em produção;
- build completo, pois esta entrega é exclusivamente documental.

## Próxima fase

Fase 4 — criar o template canônico de página V3000 usando esses primitives: cabeçalho decisório, indicadores essenciais, fila de ação, área de trabalho, detalhes progressivos e estados completos. A primeira aplicação deverá ocorrer em uma rota de baixo risco antes de migrar Command Center, Leads e Pipeline.
