# ATLAS AI OS — Fase 21/100

## Recibo sanitizado de observação no Meta Test Events

Esta fase prepara a comprovação do único evento sintético autorizado pela Fase 20. Ela não envia evento, não acessa a Meta e não altera banco, campanha, orçamento ou público.

O ATLAS não executa o evento nesta fase; apenas prepara e valida o recibo sanitizado de uma observação humana futura.

O recibo somente pode ser criado após uma execução manual aprovada e uma observação humana independente na superfície oficial de testes.

## O que o recibo registra

- evento sintético visível na área oficial de testes;
- nome canônico e impressão digital já aprovados na Fase 20;
- uma única entrega;
- horário de execução e observação dentro da janela autorizada;
- confirmação do operador e de um revisor independente;
- resultado normalizado `observed`.

## O que o ATLAS nunca registra

- código temporário de teste;
- token, segredo ou URL do projeto;
- payload ou valores usados para correspondência;
- resposta bruta da Meta;
- captura de tela;
- telefone, e-mail, CPF, endereço, renda ou identificador de projeto;
- alegação de qualidade de correspondência, conversão ou impacto de otimização.

## Comportamento diante de divergência

Se houver alerta, erro, resultado inesperado, evento ausente, impressão digital divergente ou mais de uma entrega, o gate fecha. Não existe repetição automática. O caso volta para revisão humana.

## Condições obrigatórias

1. Evidência aprovada e ainda válida da Fase 20.
2. Registro exclusivamente sintético no branch isolado.
3. Execução manual na superfície oficial de teste.
4. Uma única entrega.
5. Observação em até 30 minutos.
6. Recibo emitido em até 120 minutos.
7. Atestações distintas do operador e do revisor.

## Status desta entrega

- contrato do recibo: **pronto**;
- auditoria estática: **aprovada localmente**;
- autotestes sintéticos: **aprovados localmente**;
- evidência real da Fase 20: **pendente**;
- execução manual oficial: **não executada**;
- recibo oficial observado: **não emitido**;
- produção: **bloqueada**;
- build: **não executado**.

## Uso futuro, após aprovação humana

Preencher uma cópia de `config/fixtures/meta-test-events-observation-input-template.json` somente com referências não pessoais e apontar os três arquivos JSON por variáveis de ambiente:

- `ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE`;
- `ATLAS_PHASE21_OBSERVATION_INPUT_FILE`;
- `ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE`.

O gerador aceita somente caminhos JSON internos ao workspace e grava o recibo com permissão restrita. Nenhum valor sensível deve ser colocado no arquivo de entrada.

## Próxima fase

A Fase 22 reconciliará o recibo observado com os contratos locais das Fases 19 e 20. Mesmo com observação aprovada, entrega automática e produção continuarão bloqueadas até uma decisão executiva explícita e evidências de qualidade suficientes.
