# NOTAS DE VERSÃO — ATLAS ONE 3.0.0-rc.2

**2026-07-31** · branch `claude/atlas-v3-entregas`

## O PACOTE

| campo | valor |
|---|---|
| arquivo | `atlas-one-v3.0.0-rc.2-fcc5eefc.zip` |
| local | `~/atlas-v3-releases/` |
| tamanho | **6636576** bytes |
| SHA-256 | `738e77804cb82683338dc9c8d3b3af5000b71eda33bcceac1edb96e9de61dd35` |
| commit | `fcc5eefc48e729d5ee8152b313f9b9c85949b7e4` |
| origem | `git archive HEAD` — só arquivos rastreados |
| arquivos | 2.589 |
| `node_modules` · `.env` real | **0** · **0** |

Conferir antes de usar:

```bash
shasum -a 256 -c ~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-fcc5eefc.zip.sha256
```

## A PROVA DO PACOTE — três tentativas, e as duas primeiras reprovaram

| # | resultado | o que estava errado |
|---|---|---|
| 1 | ❌ 1 falha | exceção declarada para `hostinger.env`, que está no `.gitignore` e não viaja no pacote |
| 2 | ❌ 1 falha | **minha correção repetiu o defeito**: usei `git check-ignore`, e um ZIP extraído não é repositório git |
| 3 | ✅ **limpo** | o contrato passou a ler o `.gitignore` como arquivo |

Terceira tentativa, em diretório vazio, sem `.env`:

```
npm ci ....... exit 0
tsc .......... exit 0
build ........ exit 0
contratos .... exit 0   ·  1.179 testes · 1.166 aprovados · 0 falhas · 13 pulados
```

> A diferença de contagem (1.191 aqui × 1.179 no pacote; 9 pulados × 13) é
> **esperada e declarada**: 12 contratos dependem de credenciais que não viajam
> no pacote. Um número que muda entre ambientes precisa ser explicado, não
> escondido.

## O QUE ESTA VERSÃO ENTREGA

| tabela | antes | depois |
|---|---:|---:|
| `marketing_spend` | 0 | **94 linhas · R$ 3.612,01** |
| `ai_shadow_decisions` | 0 | **20** (todas retidas, 0 executadas) |
| `conversion_feature_snapshots` | 0 | **370** |
| `marketing_campaigns` | 1 | **8** |

E três recusas que o produto passou a fazer: **CPL sem base**, **acurácia com
menos de 2 desfechos**, e **status inexistente devolvendo lista vazia**.

## O QUE ESTA VERSÃO **NÃO** É

**Não é uma versão em produção.** `/api/v1/ready` não declara `build` — nada
disto está no ar. Ver `LISTA_DE_LIMITACOES_CONHECIDAS.md`, bloqueadores B-01 a B-04.

**Não passou na régua flagship.** `SCORECARD_FINAL_ATLAS_ONE.md`: média **71,3**,
veredito **reprovado**, com as sete ações que destravam.

## INSTALAÇÃO A PARTIR DO PACOTE

```bash
unzip atlas-one-v3.0.0-rc.2-fcc5eefc.zip -d atlas-one && cd atlas-one
npm ci && cp .env.example .env.local
npm run build && npm start
```

O `.env.local` precisa das credenciais reais — elas **não** estão no pacote,
por desenho.
