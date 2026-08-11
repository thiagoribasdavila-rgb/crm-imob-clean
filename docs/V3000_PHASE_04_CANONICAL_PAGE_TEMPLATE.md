# ATLAS ONE V3000 — Fase 4: template canônico de página

## Resultado

A Fase 4 entrega uma estrutura reutilizável para organizar qualquer página do
Atlas One sem substituir as rotas operacionais atuais. O template consolida a
hierarquia aprovada nas fases anteriores e reduz a chance de cada módulo criar
um layout próprio.

Arquivo principal:

- `components/atlas/v3000-page-template.tsx`

## Ordem de informação

1. **Decisão** — título, contexto necessário e uma ação principal.
2. **Métricas** — até cinco indicadores essenciais; complementares sob demanda.
3. **Prioridade** — fila curta que mostra onde agir agora.
4. **Área de trabalho** — operação principal do módulo.
5. **Contexto lateral** — apoio opcional, sem competir com a operação.
6. **Análise** — profundidade adicional por divulgação progressiva.

O contrato fica registrado pelo atributo:

`decision-metrics-priority-workspace-analysis`

## Contrato dos slots

| Slot | Responsabilidade | Obrigatório |
| --- | --- | --- |
| Cabeçalho | Decisão, explicação e ação principal | Sim |
| `feedback` | Aviso, modo degradado ou erro recuperável | Não |
| `metrics` | Leitura essencial e indicadores complementares | Não |
| `priority` | Próximas ações de maior impacto | Não |
| `workspace` | Conteúdo operacional central | Sim |
| `aside` | Contexto auxiliar | Não |
| `analysis` | Diagnóstico e leitura aprofundada | Não |

## Estados completos sem acoplamento

O template não busca dados e não decide estado de negócio. Cada rota continua
responsável por compor o slot correto:

| Estado | Composição recomendada |
| --- | --- |
| Carregando | `ProgressivePageLoading` em `workspace.content` |
| Vazio | `AtlasEmpty` em `workspace.content` |
| Falha recuperável | `AtlasRecoverableError` em `feedback` |
| Degradado | aviso em `feedback` + área de trabalho segura |
| Pronto | cards, listas, Kanban ou agenda reais no `workspace` |

Isso permite usar o mesmo template em Server Components e manter pequenas ilhas
cliente somente onde há interação real.

## Decisões técnicas

- O template é um Server Component puro por padrão.
- Não possui `use client`, hooks, `fetch`, sessão ou regra de autorização.
- Não renderiza `<main>`; o shell autenticado já possui essa região semântica.
- Reutiliza `PageHeader`, `AtlasMetricDeck`, `AtlasPriorityQueue`,
  `AtlasSection` e `AtlasDetailDisclosure`.
- Não introduz cores, sombras ou tokens visuais paralelos.
- `ReactNode` permite composição com componentes servidor e fronteiras cliente.

## Segurança operacional

Nesta fase não houve alteração em:

- rotas;
- autenticação ou sessão;
- Supabase, schema, migrations ou RLS;
- APIs;
- menu e permissões;
- Command Center, Leads ou Pipeline em produção;
- deploy ou pacote Hostinger.

## Validação

O contrato automatizado garante que:

- a ordem da informação permaneça estável;
- os primitivos canônicos sejam reutilizados;
- não exista `<main>` duplicado;
- o template não seja convertido desnecessariamente em Client Component;
- não sejam introduzidos estilos inline ou cores hardcoded.

## Próxima fase

A Fase 5 deve selecionar uma superfície de baixo risco e aplicar este template
como piloto, comparando antes e depois. A adoção em Command Center, Leads e
Pipeline permanece bloqueada até o piloto comprovar paridade funcional,
responsividade, acessibilidade e ausência de regressão.
