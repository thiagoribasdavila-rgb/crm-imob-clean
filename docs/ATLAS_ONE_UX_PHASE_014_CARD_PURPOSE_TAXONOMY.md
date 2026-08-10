# Atlas One — Fase 14: cards organizados por função

Data: 04/08/2026

## Objetivo

Reduzir o esforço de leitura fazendo cada card declarar sua função antes do conteúdo. A mudança reaproveita os componentes existentes e não cria módulos, dados ou fluxos novos.

## Taxonomia canônica

| Função | Uso | Peso visual |
|---|---|---|
| Métrica | Número, contexto e tendência | Compacto e comparável |
| Decisão | Evidência, decisão pedida e ação | Maior prioridade |
| Trabalho | Kanban, formulário ou operação contínua | Estrutura principal |
| Fila | Lista ordenada por urgência ou prazo | Densa e escaneável |
| Análise | Investigação e contexto secundário | Discreto |
| Estado vazio | Ausência explicada e próximo passo | Neutro e orientativo |

## Alterações

- `AtlasCard` recebe `purpose`, mantendo `work` como padrão compatível.
- `AtlasMetric` e `AtlasEmpty` declaram suas funções automaticamente.
- Decisão, fila, trabalho e análise recebem hierarquia visual própria via CSS semântico.
- O Kanban foi classificado como trabalho; a inteligência de compradores, como análise.
- Tokens de dimensão e densidade evitam novos valores isolados.

## Impacto operacional

- O usuário diferencia execução, prioridade e investigação com menos leitura.
- Análises secundárias deixam de competir com o Kanban.
- Novas superfícies passam a reutilizar uma gramática única.
- APIs, banco, autenticação, RLS e dados permanecem inalterados.

## Validação

```text
npm run ux:phase-014:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Compactar o cabeçalho das telas mantendo título, contexto e uma ação principal.
