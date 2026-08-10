# ATLAS AI OS — Fase 24/100

## Autorização descartável da segunda amostra

Esta fase prepara o rascunho sanitizado de autorização para a posição `repeatability_02` do plano da Fase 23. O rascunho não ativa autorização, não envia evento e não agenda execução.

## Proteções obrigatórias

- validade máxima de 30 minutos;
- uso único;
- mesmo evento canônico da amostra-base;
- novo identificador não pessoal de evento;
- novo registro sintético;
- comparação independente das duas novas impressões digitais com a amostra-base;
- evento e classificação validados no contrato canônico do ATLAS;
- nenhuma informação de cliente real;
- diretor, segurança, operador e revisor com referências independentes;
- referências humanas transformadas em impressões digitais antes da persistência;
- código temporário mantido somente na superfície oficial do Meta;
- interrupção sem repetição automática diante de qualquer divergência.

## Duas etapas humanas

1. **Rascunho:** registra escopo, prazo e concordância dos quatro papéis sem liberar o teste.
2. **Confirmação no momento do teste:** todos precisam reconfirmar o rascunho ainda válido antes que uma permissão de uso único possa ser considerada.

Nesta entrega existe somente a primeira etapa. O estado final é `awaiting_just_in_time_confirmation`.

## Limite explícito da prova humana

A independência entre os quatro papéis desta segunda amostra é verificada pelas quatro impressões digitais distintas. A Fase 22 preservou somente a prova agregada das referências da amostra-base; por isso, a não reutilização entre amostras permanece uma atestação humana, não uma comparação criptográfica individual. A reconfirmação da Fase 25 será nova, curta e obrigatória.

## O que permanece bloqueado

- ativação da autorização: **bloqueada**;
- observação manual: **bloqueada**;
- repetição automática: **bloqueada**;
- entrega automática: **bloqueada**;
- produção: **bloqueada**;
- campanha, orçamento e público: **inalterados**;
- implantação: **bloqueada**.

## Estado desta entrega

- contrato do rascunho: **pronto**;
- validador fail-closed: **pronto**;
- auditoria estática: **aprovada localmente**;
- testes adversariais: **aprovados localmente**;
- plano oficial da Fase 23: **não fornecido**;
- rascunho oficial: **não gerado**;
- autorização ativada: **não**;
- evento Meta enviado: **não**;
- acesso remoto: **não executado**;
- banco: **não alterado**;
- build: **não executado**;
- produção: **bloqueada**.

## Geração futura controlada

O gerador aceita somente três caminhos JSON internos ao workspace:

- `ATLAS_PHASE23_REPEATABILITY_PLAN_FILE`;
- `ATLAS_PHASE24_AUTHORIZATION_REQUEST_FILE`;
- `ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE`.

O arquivo de saída é gravado com permissão restrita. Nenhuma referência humana bruta aparece no resultado.

## Próxima fase

A Fase 25 preparará o gate de reconfirmação no momento do teste. Sem quatro confirmações novas, rascunho válido e evidência oficial do plano, nenhuma permissão de uso único poderá existir.
