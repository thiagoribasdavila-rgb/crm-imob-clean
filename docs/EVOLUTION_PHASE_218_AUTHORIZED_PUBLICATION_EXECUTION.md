# Fase 218 — Authorized Publication Execution

## Objetivo

Introduzir uma execução controlada e verificável para uma autorização de publicação previamente aprovada. Nesta fase, “execução” significa exclusivamente uma prova local isolada do contrato; não significa publicar externamente, compilar, implantar ou promover uma release.

## Contratos entregues

- Política canônica com executor independente e handler local explicitamente confiável.
- Vínculo exato com a autorização da fase 217, a decisão de publicação, o SHA-256 do pacote e o inventário.
- Consumo atômico e único da autorização antes de acionar o handler.
- Recibo Ed25519 assinado pelo executor e memória append-only da prova.
- Evidências locais limitadas, caminhos relativos protegidos e hashes obrigatórios.
- Falha do handler registrada de forma controlada, sem reuso da autorização.

## Isolamento operacional

O handler recebe somente metadados imutáveis do pacote e executa no modo `isolated-local-publication-proof`. A política proíbe rede, mutação de banco, comandos arbitrários, publicação externa, geração automática de pacote, build, deploy e promoção.

## Segregação de funções

O executor deve ser diferente do aprovador final, do autorizador e montador do pacote, do custodiante da evidência, do diretor de publicação e do autorizador da execução. O identificador e o digest do handler também precisam corresponder exatamente à lista de confiança.

## Estado canônico

Nenhuma identidade ou evidência real foi inventada. As listas de executores e handlers estão vazias, não há autorização consumida e não existe recibo registrado. Por isso, nenhuma prova, publicação, geração de pacote, build, deploy ou promoção aparece como realizada.

## Validação

- prova local válida gera recibo assinado e entrada append-only;
- reuso de autorização é bloqueado pela memória e pela reivindicação atômica;
- executor ou handler não confiável é rejeitado antes do consumo;
- janela expirada é rejeitada;
- falha do handler produz evidência controlada e não causa efeito externo;
- adulteração de recibo ou memória e recibo não registrado são detectados;
- regressão completa da cadeia herdada permanece válida.

## Arquivos principais

- `lib/release/authorized-publication-execution.mjs`
- `config/authorized-publication-execution-policy.json`
- `config/authorized-publication-execution-memory.json`
- `tests/contracts/authorized-publication-execution.test.mjs`
- `scripts/run-authorized-publication-execution-phase-218.mjs`
- `scripts/check-evolution-phase-218.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não gerou ZIP; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 219 — `Publication Execution Evidence Adjudication`: julgar a integridade e a suficiência da prova local antes de qualquer efeito externo.
