# Fase 222 — Controlled External Publication Authorization Consumption

## Objetivo

Consumir uma concessão externa válida de forma atômica, assinada e exatamente uma vez. O consumo registra o esgotamento da autorização, mas continua separado de qualquer publicação ou execução externa.

## Contratos entregues

- Política canônica com consumidor independente de todos os atores anteriores.
- Validação integral da concessão, da memória de concessões e de toda a cadeia de revisão.
- Exigência de concessão positiva, registrada, não expirada e com um uso restante.
- Vínculo exato com concessão, revisão, adjudicação, recibo, pacote e inventário.
- Recibo Ed25519 assinado com `authorizationConsumed: true` e `remainingUses: 0`.
- Memória append-only vinculada atomicamente ao hash do estado imediatamente anterior.
- Rejeição da segunda tentativa de consumo da mesma concessão.
- Separação explícita entre consumir autorização e executar publicação externa.

## Segregação de funções

O consumidor deve ser diferente do concedente, revisor, adjudicador, executor, autorizador da execução, diretor de publicação, custodiante de evidências, montador e autorizador do pacote. O concedente não pode consumir a própria concessão.

## Estado canônico

Nenhum consumidor, concessão ou consumo real foi inventado. As listas de confiança e as memórias permanecem vazias; portanto, nenhuma autorização foi consumida e nenhuma publicação foi executada.

## Validação

- concessão positiva, registrada, válida e não consumida pode ser consumida uma vez;
- concessão negada, expirada ou ausente da memória é recusada;
- consumidor não confiável, em colisão, inativo ou fora da validade é recusado;
- reutilização do hash da concessão, identificador ou nonce é recusada;
- o recibo registra zero usos restantes sem executar qualquer efeito externo;
- adulteração do recibo, assinatura, entrada ou cabeça da memória é detectada;
- toda a regressão contratual herdada permanece válida.

## Arquivos principais

- `lib/release/controlled-external-publication-authorization-consumption.mjs`
- `config/controlled-external-publication-authorization-consumption-policy.json`
- `config/controlled-external-publication-authorization-consumption-memory.json`
- `tests/contracts/controlled-external-publication-authorization-consumption.test.mjs`
- `scripts/run-controlled-external-publication-authorization-consumption-phase-222.mjs`
- `scripts/check-evolution-phase-222.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não consumiu uma autorização real; não gerou pacote; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 223 — `Controlled External Publication Execution Handoff`: preparar um handoff assinado do recibo de consumo para um executor externo separado, ainda sem executar publicação, rede, build, deploy ou promoção.
