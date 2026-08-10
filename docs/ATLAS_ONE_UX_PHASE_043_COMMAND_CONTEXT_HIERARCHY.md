# ATLAS ONE — Fase 43: hierarquia entre comando e contexto

## Objetivo

Evitar que o contexto progressivo concorra visualmente com a ação principal da etapa, preservando todo o conteúdo e o acesso sob demanda.

## Entrega

- o comando da etapa passa a ser a superfície dominante;
- uma marca lateral curta reforça a continuidade entre comando e prioridade;
- o contexto fechado deixa de parecer um segundo card;
- o resumo secundário ocupa menos altura e usa contraste reduzido;
- foco e hover recuperam contraste antes da abertura;
- ao abrir, o contexto recebe contorno e fundo suficientes para leitura;
- modo compacto e preferência por movimento reduzido permanecem atendidos.

## Segurança preservada

Nenhuma API, tabela, migration, RLS, permissão, cálculo, integração, comando ou movimentação foi modificada.

## Validação

- contrato específico da fase: 5/5 testes aprovados;
- typecheck: aprovado sem erros;
- lint: aprovado sem avisos;
- regressão completa: 202/202 testes aprovados.

## Próxima fase

Simplificar a passagem visual entre o cabeçalho da etapa e o primeiro card, reduzindo superfícies encaixadas sem perder a prioridade.
