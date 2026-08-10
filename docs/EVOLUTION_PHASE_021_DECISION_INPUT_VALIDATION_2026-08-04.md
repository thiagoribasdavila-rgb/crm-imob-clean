# Fase 21 — Validação antes do registro de decisão

## Objetivo

Evitar chamadas inválidas à API e registros de baixa qualidade no ciclo de aprendizado humano.

## Entregue

- O registro de decisão exige responsável e justificativa com conteúdo mínimo.
- Quando um cenário real é ativado, premissa e resultado esperado também são obrigatórios.
- O resultado observado exige uma descrição mínima antes de encerrar o ciclo.
- O botão de confirmação só fica disponível quando os dados necessários estão completos.
- Os textos enviados ao servidor são normalizados sem espaços excedentes nas extremidades.

## Proteções preservadas

- A validação do servidor permanece como fonte de verdade.
- Nenhum dado é salvo automaticamente ou modificado fora de confirmação explícita.
- Não houve mudança em banco, RLS, autenticação ou integrações externas.

## Validação esperada

1. Tentar confirmar uma decisão sem responsável ou justificativa.
2. Ativar cenário real e deixar premissa ou resultado esperado vazio.
3. Confirmar que os botões permanecem desabilitados com orientação clara.
4. Preencher os campos e validar o registro normal da decisão e do resultado.
