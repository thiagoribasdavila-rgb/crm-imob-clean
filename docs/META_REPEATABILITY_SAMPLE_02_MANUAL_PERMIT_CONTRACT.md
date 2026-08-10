# ATLAS AI OS — Fase 26/100

## Contrato da permissão manual efêmera

Esta fase prepara o contrato que uma futura permissão manual deverá cumprir. O contrato não emite, não ativa e não torna utilizável nenhuma permissão. Nenhuma observação ou entrega é executada.

## Vínculos imutáveis

O contrato fica preso a:

- comprovante válido da Fase 25;
- mesmo evento canônico e mesmo registro sintético;
- operador que reconfirmou a Fase 25;
- nonce exclusivo;
- chave de idempotência exclusiva;
- janela futura entre 15 e 120 segundos, sempre menor que a validade restante do comprovante.

## Antirrepetição

Uma futura emissão precisará registrar e consumir a permissão atomicamente antes de qualquer ação. O nonce e a chave de idempotência precisam ser diferentes entre si e de todas as evidências anteriores. Arquivo copiado, clique repetido ou nova tentativa não poderão gerar uma segunda autorização.

O estado produzido nesta fase é `contract_prepared_not_issued`:

- emitida: **não**;
- utilizável: **não**;
- consumida: **não**;
- executada: **não**;
- evento entregue: **não**.

## Proteção de dados

Somente impressões digitais SHA-256 podem aparecer no contrato. Referência bruta do operador, nonce bruto, chave bruta de idempotência, código temporário, payload, resposta do Meta, imagem, projeto ou dado pessoal não são persistidos.

## Estado desta entrega

- contrato efêmero: **pronto**;
- consumo atômico obrigatório: **definido**;
- proteção antirrepetição: **validada localmente**;
- auditoria estática: **aprovada localmente**;
- testes adversariais: **aprovados localmente**;
- comprovante oficial da Fase 25: **não fornecido**;
- contrato oficial: **não gerado**;
- permissão emitida: **não**;
- evento Meta enviado: **não**;
- acesso remoto: **não executado**;
- banco: **não alterado**;
- build: **não executado**;
- produção: **bloqueada**.

## Geração futura controlada

O gerador aceita somente caminhos JSON internos ao workspace:

- `ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE`;
- `ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_REQUEST_FILE`;
- `ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE`.

O resultado é gravado com permissão restrita e falha fechado diante de qualquer divergência.

## Próxima fase

A Fase 27 preparará o ledger de emissão e consumo atômico da permissão, ainda sem emitir permissão e sem transmitir evento.
