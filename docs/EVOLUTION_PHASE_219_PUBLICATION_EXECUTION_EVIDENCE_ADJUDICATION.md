# Fase 219 — Publication Execution Evidence Adjudication

## Objetivo

Criar uma barreira independente que aceite ou rejeite a prova local produzida pela fase 218. A adjudicação confirma integridade, vínculo e suficiência da evidência, mas não autoriza publicação externa nem produz efeito operacional.

## Contratos entregues

- Política canônica de adjudicação com identidade independente do executor e de todos os responsáveis anteriores.
- Validação integral do recibo assinado, da autorização consumida e da memória append-only de execução.
- Vínculo exato com decisão, pacote, inventário, política e registro da execução.
- Decisão Ed25519 assinada, limitada aos resultados `accepted` e `rejected`.
- Aceitação permitida somente para prova bem-sucedida, registrada, íntegra e com evidência suficiente.
- Rejeição obrigatória para execução falha ou prova insuficiente.
- Memória append-only que impede adjudicação duplicada do mesmo recibo.

## Segregação de funções

O julgador deve ser diferente do executor, autorizador da execução, diretor de publicação, custodiante de evidências, montador e autorizador do pacote. A própria identidade do executor também é verificada novamente no momento da decisão.

## Estado canônico

Nenhum julgador ou recibo real foi inventado. A lista de confiança e a memória estão vazias; portanto, não existe prova adjudicada ou aceita. O sistema permanece bloqueado para qualquer publicação externa.

## Validação

- prova local válida e registrada pode gerar decisão aceita assinada;
- prova de execução falha só pode ser rejeitada;
- recibo adulterado ou não registrado é bloqueado;
- decisão tardia, julgador não confiável e colisão com executor são rejeitados;
- o mesmo recibo, identificador ou nonce não pode ser reutilizado;
- adulteração da decisão ou da memória append-only é detectada;
- a regressão completa dos contratos herdados permanece válida.

## Arquivos principais

- `lib/release/publication-execution-evidence-adjudication.mjs`
- `config/publication-execution-evidence-adjudication-policy.json`
- `config/publication-execution-evidence-adjudication-memory.json`
- `tests/contracts/publication-execution-evidence-adjudication.test.mjs`
- `scripts/run-publication-execution-evidence-adjudication-phase-219.mjs`
- `scripts/check-evolution-phase-219.mjs`

## Efeitos externos

Esta fase não alterou banco, Auth ou RLS; não chamou serviços externos; não gerou ZIP; não executou build; não publicou; não fez deploy; e não promoveu release.

## Próxima fase

Fase 220 — `Controlled External Publication Authorization Review`: revisar, em contrato separado, se uma prova local já aceita pode qualificar para autorização externa, sem executar efeito externo.
