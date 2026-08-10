# Fase 41 — recuperação da leitura principal

## Objetivo

Permitir que a Diretoria recupere a leitura de leads e sinais do Centro de Decisão após uma falha temporária, sem recarregar toda a aplicação.

## Ajuste entregue

- A carga principal volta a informar estado de atualização durante uma nova tentativa.
- O aviso de indisponibilidade ganhou ação direta **Atualizar sinais**.
- Dados já exibidos permanecem na tela enquanto a nova leitura é solicitada.
- O botão previne tentativas concorrentes durante a atualização.

## Impacto operacional

Uma falha pontual de conexão deixa de interromper a rotina decisória ou exigir que a Diretoria navegue novamente para recuperar os sinais.

## Limites da fase

Não altera dados comerciais, regras de priorização, banco, permissões, integrações nem automações.

## Validação prevista

- Typecheck.
- Lint.
- Contrato do gate de liberação.
- Contrato de governança da interação assistida.
