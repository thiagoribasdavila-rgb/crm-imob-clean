# Fase 51 — Motor de distribuição por disponibilidade

## Evolução

O RPC v2 mantém trava por organização/projeto, `SKIP LOCKED` e atualização condicionada a `assigned_to is null`. Cada atribuição retorna e registra corretor, carga anterior, peso, carga ponderada, última atribuição e critérios elegíveis.

## Regra

Participam somente corretores ativos, online há no máximo 90 segundos, disponíveis, habilitados no projeto e visíveis na hierarquia do gestor. Vence a menor carga do projeto dividida pelo peso; empate usa a atribuição mais antiga e depois ID estável.

## Homologação

Aplicar migration e validar dois gestores concorrentes, dois tenants, dois projetos, corretor offline durante lote, lead previamente atribuída, pesos 1 e 10 e lote de 100. Execute `npm run explainable-distribution:check`.
