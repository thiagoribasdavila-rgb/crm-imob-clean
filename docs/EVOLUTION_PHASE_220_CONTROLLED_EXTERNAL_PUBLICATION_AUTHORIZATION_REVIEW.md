# Fase 220 — Controlled External Publication Authorization Review

## Objetivo

Criar uma revisão independente entre a adjudicação da prova local e qualquer futura concessão de autorização externa. A revisão decide apenas se a prova aceita é elegível para a etapa seguinte; ela não autoriza nem executa publicação.

## Contratos entregues

- Política canônica com revisor independente de todos os atores das fases anteriores.
- Validação integral da decisão de adjudicação e de sua memória append-only.
- Vínculo exato com decisão, política de adjudicação, recibo, pacote e inventário.
- Revisão Ed25519 assinada com resultados limitados a `eligible` e `ineligible`.
- Elegibilidade permitida somente para evidência aceita e registrada.
- Memória append-only que impede repetição da decisão, do identificador e do nonce.
- Separação explícita entre elegibilidade e concessão de autorização externa.

## Segregação de funções

O revisor deve ser diferente do adjudicador, executor, autorizador da execução, diretor de publicação, custodiante de evidências, montador e autorizador do pacote. O adjudicador também não pode revisar a própria decisão.

## Estado canônico

Nenhum revisor ou decisão real foi inventado. A lista de confiança e a memória estão vazias; portanto, nenhuma prova foi revisada e nenhuma autorização externa existe.

## Validação

- prova aceita e registrada pode gerar revisão elegível assinada;
- prova rejeitada jamais pode ser declarada elegível;
- decisão não registrada, tardia ou revisada por ator não confiável é recusada;
- o mesmo hash de decisão, identificador ou nonce não pode ser reutilizado;
- adulteração da revisão, assinatura ou memória é detectada;
- toda a regressão contratual herdada permanece válida.

## Arquivos principais

- `lib/release/controlled-external-publication-authorization-review.mjs`
- `config/controlled-external-publication-authorization-review-policy.json`
- `config/controlled-external-publication-authorization-review-memory.json`
- `tests/contracts/controlled-external-publication-authorization-review.test.mjs`
- `scripts/run-controlled-external-publication-authorization-review-phase-220.mjs`
- `scripts/check-evolution-phase-220.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não gerou pacote; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 221 — `Controlled External Publication Authorization Grant`: conceder, em contrato separado e de uso único, autorização externa estritamente vinculada a uma revisão elegível registrada, ainda sem executar qualquer publicação.
