# Fase Final 2 — Design system e identidade única

## Resultado

O Atlas V3 passa a usar uma base visual canônica para superfícies, métricas, status, estados vazios, progresso e cabeçalhos. As telas que ainda importam nomes históricos continuam funcionando por adaptadores finos, mas renderizam os componentes oficiais.

## Identidade

- Fundo escuro espacial com azul Atlas como cor de orientação.
- Hierarquia tipográfica limpa, números tabulares e densidade compatível com operação comercial.
- Movimento sutil e desativado quando o dispositivo solicita movimento reduzido.
- Foco de teclado visível, estados sem dependência exclusiva de cor e textos de apoio legíveis.
- Cards sem desfoque contínuo pesado, preservando fluidez em notebooks e celulares.

## Componentes oficiais

| Função | Componente |
| --- | --- |
| Superfície | `AtlasCard` |
| Métrica | `AtlasMetric` |
| Status | `AtlasBadge` |
| Estado vazio | `AtlasEmpty` |
| Progresso | `AtlasProgress` |
| Cabeçalho | `PageHeader` |

## Consolidação

`MetricCard`, `StatusBadge` e `EmptyState`, usados em módulos operacionais existentes, agora são adaptadores para a base oficial. Isso aplica a mesma linguagem a dezenas de páginas sem uma reescrita arriscada e impede divergências futuras.

## Critério de aceite

A verificação automática reprova a fase se os adaptadores deixarem de apontar para os componentes canônicos, se os controles de foco ou movimento reduzido desaparecerem, ou se a configuração do programa não registrar a conclusão da fase 2.
