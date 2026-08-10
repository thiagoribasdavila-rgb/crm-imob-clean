# ATLAS ONE — Fase 42: síntese numérica da etapa

## Objetivo

Combinar volume, VGV e probabilidade em uma leitura curta e explícita no cabeçalho da coluna, sem adicionar indicadores ou mudar os cálculos existentes.

## Entrega

- contador isolado, valor solto e barra sem legenda foram reunidos;
- volume aparece como `leads`;
- valor permanece identificado como `VGV`;
- probabilidade passa a dizer `chance da etapa`, evitando interpretação ambígua;
- a mesma probabilidade canônica continua alimentando a barra;
- a síntese usa uma linha compacta também em telas menores;
- leitores de tela recebem a descrição completa da etapa.

## Segurança preservada

Nenhuma API, tabela, migration, RLS, permissão, autenticação, integração, fórmula ou movimentação foi modificada.

## Validação

- contrato específico da fase: 5/5 testes aprovados;
- typecheck: aprovado sem erros;
- lint: aprovado sem avisos;
- regressão completa: 197/197 testes aprovados.

## Próxima fase

Reduzir a competição visual entre o comando da etapa e o contexto progressivo, mantendo o comando principal sempre evidente.
