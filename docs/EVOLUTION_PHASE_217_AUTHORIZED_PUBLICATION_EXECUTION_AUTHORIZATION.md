# Fase 217 — Authorized Publication Execution Authorization

## Objetivo

Introduzir uma autorização humana, assinada e auditável para executar uma decisão de publicação previamente aprovada. Esta autorização não executa a publicação e não substitui a decisão da fase 216.

## Contratos entregues

- Política canônica com autorizador de execução independente.
- Memória append-only para autorizações de execução.
- Vínculo exato com a decisão aprovada, o registro dessa decisão, a evidência comprometida, o SHA-256 do pacote e o inventário.
- Assinatura Ed25519, janela temporal curta, validade limitada e motivo obrigatório.
- Bloqueio de autorização duplicada por decisão ou pacote.
- Verificadores para adulteração, validade, colisão de papéis, decisão rejeitada e ausência de registro.

## Cadeia de segregação

O autorizador de execução deve ser diferente do aprovador final, do autorizador/montador do pacote, do custodiante da evidência e do diretor que decidiu publicar. Somente uma decisão `approved` registrada na memória da fase 216 pode originar autorização.

## Estado canônico

Nenhuma identidade foi inventada. Não há decisão de publicação aprovada nem autorização de execução registrada. A prontidão permanece `awaiting_approved_publication_decision_and_independent_execution_authorizer` até que identidades e evidências reais sejam fornecidas fora do código.

## Validação

- autorização válida para decisão aprovada e registrada;
- decisão rejeitada impedida de avançar;
- autorizador em colisão, inativo ou fora da validade bloqueado;
- adulteração de decisão, memória, pacote ou autorização rejeitada;
- memória append-only e autorização única por decisão/pacote;
- regressão completa da cadeia herdada.

## Arquivos principais

- `lib/release/authorized-publication-execution-authorization.mjs`
- `config/authorized-publication-execution-authorization-policy.json`
- `config/authorized-publication-execution-authorization-memory.json`
- `tests/contracts/authorized-publication-execution-authorization.test.mjs`
- `scripts/run-authorized-publication-execution-authorization-phase-217.mjs`
- `scripts/check-evolution-phase-217.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não gerou ZIP; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 218 — `Authorized Publication Execution`: executar somente uma publicação exatamente autorizada, mantendo build, deploy e promoção fora desta etapa.
