# RELATÓRIO DE TESTES

**2026-07-31.** Só comandos **realmente executados**.

## CADEIA COMPLETA — máquina de desenvolvimento

| comando | resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint . --max-warnings=0` | **exit 0** |
| `npm run build` | **exit 0** |
| `npm run test:contracts` | **exit 0** — 1.196 · **1.187 aprovados** · **0 falhas** · **9 pulados** |
| `npm run portoes:todos` | **220/220** |
| `npm run security:secrets` | **PASSED** — 2.592 arquivos, 0 credenciais |
| `npm run api-security:check` | aprovado — 204 rotas, 19 workers |
| `npm run environments:check` | aprovado |
| `npm audit` | **12 vulnerabilidades — 9 altas** |

## OS 9 PULADOS — nomeados, não escondidos

São a PARTE A de `geolocalizacao-em-metros`: exercitam **PostGIS no banco real** e
pulam sem credencial.

**Não foram transformados em mock.** Seriam 9 provas de mentira no lugar de 9
pulos honestos. Para executá-los: `DATABASE_URL` apontando para a base e
`node --experimental-strip-types --test tests/contracts/geolocalizacao-em-metros.test.mjs`.

No pacote extraído os pulados sobem para **13** — 12 contratos dependem de
credenciais que não viajam. Número que muda entre ambientes precisa ser
explicado, não escondido.

## O QUE ESTA RODADA ACRESCENTOU

| contrato | testes | guarda |
|---|---:|---|
| `investimento-de-midia` | 23 | as três formas de errar dinheiro |
| `reconciliacao-de-investimento` | 14 | o CPL falso (R$ 150,50) não pode nascer |
| `redistribuicao-em-sombra` | 14 | a maioria são **recusas** |
| `baseline-de-conversao` | 19 | a recusa a afirmar acurácia sem base |
| `status-de-lead-e-vocabulario` | 7 | lista vazia não pode ser resposta a erro de digitação |
| `prontidao-sem-ambiente` | 5 | a rota que diz o que falta não pode quebrar por faltar |

## VERIFICAÇÃO COMPORTAMENTAL — contra a rota real, com usuário descartável

| prova | resultado |
|---|---|
| investimento na sala de comando | **13/13** |
| lista de leads (paginação, total, filtro, recorte) | **8/8** |
| sombra de redistribuição (3 execuções) | fila estabiliza em 20 |
| baseline (2 execuções) | 370 linhas, 0 duplicatas |
| importador (2 execuções) | 94 linhas, 0 duplicatas, R$ 3.612,01 |

Todos os usuários descartáveis foram **removidos** ao final.

## O QUE NÃO FOI TESTADO — e não declaro aprovado

**Não existem testes E2E.** Playwright não está no projeto. Os 6 fluxos ponta a
ponta do briefing (entrada e distribuição · atendimento · negociação · hierarquia
e permissões · reativação · agência de campanhas) **não foram executados**.

Também não: teste de carga · teste com usuários · WebKit e Firefox · 5 dos 8
viewports · XSS, CSRF, IDOR, open redirect.
