# ATLAS AI OS — Fase 25/100

## Reconfirmação humana no momento do teste

Esta fase prepara o comprovante sanitizado de reconfirmação da segunda amostra. O documento só pode nascer de um rascunho válido da Fase 24 e de quatro confirmações humanas novas. Ele não ativa autorização, não executa o teste e não envia evento.

## Janela curta e subordinada

- validade máxima de cinco minutos;
- vencimento nunca posterior ao rascunho da Fase 24;
- uso único e ainda não consumido;
- diretor, segurança, operador e revisor precisam reconfirmar;
- as quatro referências novas precisam ser diferentes entre si;
- nenhuma referência nova pode repetir as quatro referências do rascunho;
- evento, classificação e impressões digitais precisam coincidir com o rascunho;
- evento e registro sintético continuam diferentes da amostra-base.

## Evidência mínima

Somente impressões digitais SHA-256 são preservadas. Referências humanas brutas, código temporário, payload, resposta do Meta, imagem, identificador de projeto e dado pessoal são proibidos no comprovante.

O resultado aprovado tem o estado `just_in_time_confirmed_activation_gate_closed`. A palavra “confirmado” significa apenas que os quatro responsáveis revisaram o mesmo escopo dentro da janela curta. Não significa que houve ativação ou entrega.

## O que permanece bloqueado

- ativação da autorização: **bloqueada**;
- observação manual: **bloqueada**;
- repetição automática: **bloqueada**;
- entrega automática: **bloqueada**;
- produção: **bloqueada**;
- campanha, orçamento e público: **inalterados**;
- implantação: **bloqueada**.

## Estado desta entrega

- gate just-in-time: **pronto**;
- janela máxima: **cinco minutos**;
- comparação com referências anteriores: **verificada localmente**;
- auditoria estática: **aprovada localmente**;
- testes adversariais: **aprovados localmente**;
- rascunho oficial da Fase 24: **não fornecido**;
- comprovante oficial: **não gerado**;
- autorização ativada: **não**;
- evento Meta enviado: **não**;
- acesso remoto: **não executado**;
- banco: **não alterado**;
- build: **não executado**;
- produção: **bloqueada**.

## Geração futura controlada

O gerador aceita somente caminhos JSON internos ao workspace:

- `ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE`;
- `ATLAS_PHASE25_JIT_CONFIRMATION_REQUEST_FILE`;
- `ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE`.

O resultado é gravado com permissão restrita e falha fechado quando qualquer evidência diverge.

## Próxima fase

A Fase 26 preparará o contrato de uma permissão manual, efêmera e consumível para a observação controlada da segunda amostra. Ela continuará sem executar ou transmitir o evento.
