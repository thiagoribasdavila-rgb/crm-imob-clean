# Fase 221 — Controlled External Publication Authorization Grant

## Objetivo

Criar uma concessão externa separada, independente, assinada, curta e de uso único. A concessão só pode existir para uma revisão elegível já registrada e não consome a autorização nem executa publicação.

## Contratos entregues

- Política canônica com concedente independente de todos os atores das fases anteriores.
- Validação integral da revisão de elegibilidade e de sua memória append-only.
- Vínculo exato com revisão, adjudicação, recibo, pacote e inventário.
- Concessão Ed25519 assinada com resultados limitados a `granted` e `denied`.
- Concessão positiva permitida somente para revisão elegível e registrada.
- Validade máxima canônica de cinco minutos e exatamente um uso disponível.
- Memória append-only que impede repetição da revisão, do identificador e do nonce.
- Separação explícita entre conceder, consumir e executar uma publicação externa.

## Segregação de funções

O concedente deve ser diferente do revisor, adjudicador, executor, autorizador da execução, diretor de publicação, custodiante de evidências, montador e autorizador do pacote. O revisor não pode conceder a própria revisão.

## Estado canônico

Nenhum concedente, revisão ou concessão real foi inventado. As listas de confiança e as memórias permanecem vazias; portanto, nenhuma autorização externa está ativa.

## Validação

- revisão elegível e registrada pode receber concessão positiva assinada;
- revisão inelegível admite apenas negação registrada;
- concedente não confiável, em colisão, inativo ou fora da validade é recusado;
- concessão expirada, longa, repetida ou não registrada é recusada;
- o mesmo hash de revisão, identificador ou nonce não pode ser reutilizado;
- adulteração da concessão, assinatura ou memória é detectada;
- toda a regressão contratual herdada permanece válida.

## Arquivos principais

- `lib/release/controlled-external-publication-authorization-grant.mjs`
- `config/controlled-external-publication-authorization-grant-policy.json`
- `config/controlled-external-publication-authorization-grant-memory.json`
- `tests/contracts/controlled-external-publication-authorization-grant.test.mjs`
- `scripts/run-controlled-external-publication-authorization-grant-phase-221.mjs`
- `scripts/check-evolution-phase-221.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não consumiu autorização; não gerou pacote; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 222 — `Controlled External Publication Authorization Consumption`: consumir atomicamente uma concessão válida exatamente uma vez, ainda sem executar publicação, build, deploy ou promoção.
