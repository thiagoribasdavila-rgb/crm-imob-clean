# VALIDAÇÃO DO PACOTE FINAL

**2026-07-31.** Quatro pacotes foram gerados nesta linha de trabalho. **Três
reprovaram.** Este documento registra os três, porque um relatório que só conta o
que deu certo ensina a confiar no primeiro pacote gerado.

## O PACOTE APROVADO

| campo | valor |
|---|---|
| arquivo | `atlas-one-v3.0.0-rc.2-final-20260731-0254-d87d2f1e.zip` |
| caminho | `~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-0254-d87d2f1e.zip` |
| tamanho | **6652750** bytes |
| SHA-256 | `c6db7dcc876b704a399f2be8b51ae1fee6070f2be3abb81fd466696c123cdacb` |
| commit | `d87d2f1e7108a284a75d934fb7d08d35e45a2dbf` |
| versão | 3.0.0-rc.2 |
| origem | `git archive HEAD` — só arquivos rastreados |

```bash
shasum -a 256 -c ~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-0254-d87d2f1e.zip.sha256
```

## O HISTÓRICO DAS REPROVAÇÕES

| # | falhou em | causa |
|---|---|---|
| 1 | contratos | exceção declarada para `hostinger.env`, que está no `.gitignore` e não viaja no pacote |
| 2 | contratos | **a correção repetiu o defeito**: usei `git check-ignore`, e um ZIP extraído não é repositório git |
| 3 | smoke test | `/api/v1/ready` respondeu **HTTP 500 cru** sem `.env` — a rota que diz o que falta quebrava por faltar |
| 4 | — | **aprovado** |

Os pacotes 1 e 2 falharam em teste. **O pacote 3 passou em tudo que é estático** —

added 1353 packages, and audited 1354 packages in 15s

367 packages are looking for funding
  run `npm fund` for details

12 vulnerabilities (3 moderate, 9 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details., , , contratos, build — e só caiu quando a aplicação foi
**levantada de verdade**. Nenhuma verificação de código pegaria aquilo.

## O PROCEDIMENTO EXECUTADO

| # | etapa | resultado |
|---|---|---|
| 1 | lista dos arquivos antes de compactar | 2.594 rastreados · **0** proibidos |
| 2 | varredura **dentro do ZIP**, sem extrair | 3.331 entradas · 0 `.env` · 0 `node_modules` · 0 `.git` · 0 `.log` · 0 chaves |
| 3 | extração em diretório novo e vazio | ok |
| 4 | varredura **por conteúdo** nos arquivos extraídos (JWT, `sk-`, `EAA`, service_role) | **nenhum segredo real** |
| 5 | `npm ci` | **exit 0** |
| 6 | `npx tsc --noEmit` | **exit 0** |
| 7 | `npx eslint . --max-warnings=0` | **exit 0** |
| 8 | `npm run test:contracts` | **exit 0** — 1.184 testes · 1.171 aprovados · **0 falhas** · 13 pulados |
| 9 | `npm run security:secrets` | **exit 0** |
| 10 | `npm run build` | **exit 0** |
| 11 | **`next start` — aplicação de pé** | ok |
| 12 | smoke `/login` | **HTTP 200** |
| 13 | smoke `/api/v1/ready` **sem `.env`** | **HTTP 503** com `estado: "banco_fora"`, as 2 variáveis ausentes nomeadas e o que fazer |
| 14 | smoke redirect `/properties/mtching` | **HTTP 308** → `/properties/matching` |

> **Nenhum `git check-ignore` foi usado no diretório extraído.** A validação é
> por conteúdo do arquivo compactado e por comportamento da aplicação — que foi a
> lição do pacote 2.

## A DIFERENÇA DE CONTAGEM, EXPLICADA

| | máquina | pacote |
|---|---:|---:|
| testes | 1.196 | **1.184** |
| pulados | 9 | **13** |

12 contratos dependem de credenciais que **não viajam no pacote**, por desenho.
Número que muda entre ambientes precisa ser explicado, não escondido.

## O QUE ESTA VALIDAÇÃO **NÃO** COBRE

Login real e jornada completa dentro do pacote — exigem credenciais no `.env`,
que é a etapa de implantação, não de empacotamento. Está provado que o pacote
**instala, compila, passa nos testes, sobe e responde**. Não está provado que ele
*opera*, porque operar exige banco.
