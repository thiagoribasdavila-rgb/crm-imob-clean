# ATLAS ONE — Fase 40: comando até a prioridade

## Objetivo

Eliminar a repetição entre o cabeçalho da etapa e a primeira oportunidade, mantendo uma sequência única de situação, pessoa e ação.

## Entrega

- comando da etapa e lead prioritário agora pertencem à mesma ponte de decisão;
- o bloco intermediário de “próxima melhor ação” foi removido da coluna;
- nome, score, valor e ação principal do lead prioritário continuam imediatos;
- “Focar etapa” preserva a leitura completa quando o usuário precisa ampliar o recorte;
- o primeiro card recebe uma marca estrutural e visual discreta como continuidade da prioridade;
- diagnóstico e saúde continuam sob demanda no contexto progressivo da Fase 39;
- cards seguintes, movimentação, teclado, histórico e desfazer permanecem intactos.

## Segurança preservada

Nenhuma API, tabela, migration, RLS, permissão, autenticação ou integração foi modificada.

## Validação

Executar `npm run ux:phase-040:check`, seguido de typecheck, lint e testes completos.

## Próxima fase

Reorganizar a informação dentro da coluna por ritmo de leitura, reduzindo divisórias e espaçamentos que não representam uma mudança de decisão.
