# ATLAS ONE — Fase 41: ritmo semântico das colunas

## Objetivo

Reduzir divisórias e espaçamentos que não representam mudança de decisão, deixando a coluna mais contínua e rápida de percorrer.

## Entrega

- cada coluna passou a ter duas zonas claras: decisão da etapa e oportunidades;
- a linha decorativa sob o cabeçalho foi removida;
- o espaço entre comando, contexto e carteira foi reduzido;
- a primeira oportunidade conserva uma transição ligeiramente maior por representar a prioridade;
- cards seguintes usam ritmo mais curto e uniforme;
- a visão compacta reduz novamente o intervalo sem comprometer foco ou toque;
- loading e colunas vazias seguem a mesma grade, evitando saltos visuais.

## Segurança preservada

Nenhuma API, tabela, migration, RLS, permissão, autenticação, integração ou regra comercial foi modificada.

## Validação

- contrato específico da fase: 5/5 testes aprovados;
- typecheck: aprovado sem erros;
- lint: aprovado sem avisos;
- regressão completa: 192/192 testes aprovados.

## Próxima fase

Simplificar a leitura numérica do cabeçalho da coluna, combinando volume, valor e probabilidade sem criar novos indicadores.
