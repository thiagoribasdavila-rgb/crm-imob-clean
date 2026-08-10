# Fase 216 — Authorized Package Publication Decision

## Objetivo

Introduzir a decisão humana, assinada e auditável que aprova ou rejeita a publicação de um pacote autorizado cuja evidência já tenha sido comprometida. Autorizar publicação não significa executar publicação.

## Contratos entregues

- Política canônica de decisão com diretor de publicação independente.
- Memória append-only para decisões aprovadas ou rejeitadas.
- Vínculo exato com o compromisso de evidência, a memória de evidência, o SHA-256 do pacote e o inventário.
- Assinatura Ed25519, validade temporal, motivo obrigatório e bloqueio de decisões duplicadas.
- Verificadores que detectam adulteração, ausência de registro, colisão de papéis e identidade inválida.

## Separação de responsabilidades

O diretor de publicação deve ser diferente do aprovador final, do autorizador/montador do pacote e do custodiante da evidência. Uma decisão aprovada somente grava `publicationAuthorized: true`; os campos `publicationExecuted`, `buildExecuted`, `deployExecuted` e `releasePromoted` permanecem falsos.

## Estado canônico

Nenhuma identidade foi inventada. Não há diretor de publicação cadastrado, evidência comprometida nem decisão registrada. A prontidão permanece `awaiting_committed_package_evidence_and_independent_publication_director` até que evidências e identidades reais sejam fornecidas fora do código.

## Validação

- decisão aprovada e rejeitada com assinatura válida;
- adulteração do compromisso, pacote ou memória rejeitada;
- diretor em colisão, inativo ou fora da validade bloqueado;
- memória append-only e decisão única por evidência/pacote;
- regressão completa da cadeia herdada.

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não gerou ZIP; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 217 — `Authorized Publication Execution Authorization`: autorizar separadamente a execução de uma publicação aprovada, ainda sem publicar, compilar, implantar ou promover automaticamente.
