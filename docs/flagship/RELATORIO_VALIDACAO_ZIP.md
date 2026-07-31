# VALIDAÇÃO DO PACOTE FINAL

**2026-07-31.** Cinco pacotes foram gerados nesta linha de trabalho. **Três
reprovaram.** Este documento registra os três — um relatório que só conta o que
deu certo ensina a confiar no primeiro pacote gerado.

## O PACOTE APROVADO

| campo | valor |
|---|---|
| arquivo | `atlas-one-v3.0.0-rc.2-final-20260731-0443-24b0e689.zip` |
| caminho | `/Users/thiagoribasdavila/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-0443-24b0e689.zip` |
| tamanho | **6666490** bytes |
| SHA-256 | `acfae35ae1251d92327d8e9f09be804a092e48983c84c0fe70a7e16a652f6f2d` |
| commit | `24b0e6896448dc2166fefcf4129c2a9d427b9865` |
| versão | 3.0.0-rc.2 |
| entradas no ZIP | 3343 |
| origem | `git archive HEAD` — só arquivos rastreados |

```bash
shasum -a 256 -c ~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-0443-24b0e689.zip.sha256
```

## O HISTÓRICO DAS REPROVAÇÕES

| # | falhou em | causa |
|---|---|---|
| 1 | contratos | exceção declarada para `hostinger.env`, que está no `.gitignore` e não viaja no pacote |
| 2 | contratos | **a correção repetiu o defeito**: usei `git check-ignore`, e um ZIP extraído não é repositório git |
| 3 | smoke test | `/api/v1/ready` respondeu **HTTP 500 cru** sem `.env` — a rota que diz o que falta quebrava por faltar |
| 4 | — | aprovado, mas superado pelas correções de `engines` e prontidão |
| 5 | — | **este** |

Os pacotes 1 e 2 falharam em teste. **O pacote 3 passou em tudo que é estático** —
instalação limpa, typecheck, lint, contratos e build — e só caiu quando a
aplicação foi **levantada de verdade**. Nenhuma verificação de código pegaria
aquilo.

## O PROCEDIMENTO EXECUTADO

| # | etapa | resultado |
|---|---|---|
| 1 | lista dos arquivos antes de compactar | 2.601 rastreados · **0** proibidos |
| 2 | varredura **dentro do ZIP**, sem extrair | 3343 entradas · 0 `.env` · 0 `node_modules` · 0 `.git` · 0 `.log` · 0 `.pem`/`.key` · 0 `.zip` |
| 3 | extração em diretório novo e vazio | ok |
| 4 | varredura **por conteúdo** no extraído (JWT, `sk-`, `EAA`) | **nenhum segredo real** |
| 5 | `npm ci` | **exit 0** |
| 6 | typecheck | **exit 0** |
| 7 | lint (`--max-warnings=0`) | **exit 0** |
| 8 | contratos | **exit 0** — 1.184 testes · 1.171 aprovados · **0 falhas** · 13 pulados |
| 9 | scanner de segredos | **exit 0** |
| 10 | build de produção | **exit 0** |
| 11 | **aplicação de pé** (`next start`) | ok |
| 12 | smoke `/login` | **HTTP 200** |
| 13 | smoke `/api/v1/ready` **sem `.env`** | **HTTP 503** com `estado: "banco_fora"` e as variáveis ausentes nomeadas |
| 14 | smoke redirect `/properties/mtching` | **HTTP 308** |

> **Nenhum `git check-ignore` foi usado no diretório extraído.** A validação é por
> conteúdo do arquivo compactado e por comportamento da aplicação servida — que
> foi a lição do pacote 2.

## A DIFERENÇA DE CONTAGEM, EXPLICADA

| | máquina | pacote |
|---|---:|---:|
| testes | 1.196 | **1.184** |
| pulados | 9 | **13** |

12 contratos dependem de credenciais que **não viajam no pacote**, por desenho.
Número que muda entre ambientes precisa ser explicado, não escondido.

## O QUE ESTA VALIDAÇÃO **NÃO** COBRE

Login real e jornada completa dentro do pacote — exigem credenciais no `.env`,
que é a etapa de implantação, não de empacotamento.

Está provado que o pacote **instala, compila, passa nos testes, sobe e responde**.
**Não** está provado que ele *opera*, porque operar exige banco.
