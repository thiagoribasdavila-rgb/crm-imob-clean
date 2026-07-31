# VALIDAÇÃO DO PACOTE FINAL

**2026-07-31.** Seis pacotes foram gerados nesta linha de trabalho. **Três
reprovaram.** Este documento registra os três — um relatório que só conta o que
deu certo ensina a confiar no primeiro pacote gerado.

## O PACOTE APROVADO

| campo | valor |
|---|---|
| arquivo | `atlas-one-v3.0.0-rc.2-final-20260731-1040-b4ad329a.zip` |
| caminho | `/Users/thiagoribasdavila/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-1040-b4ad329a.zip` |
| tamanho | **6679162** bytes |
| SHA-256 | `8101975c308d3edd34dfa0447c05fd449d1e6acc81dfd03faee33d310f9e0289` |
| commit | `b4ad329a0624d749cd171ef963858c973623cb20` |
| versão | 3.0.0-rc.2 |
| entradas | 3349 |
| origem | `git archive HEAD` — só arquivos rastreados |

```bash
shasum -a 256 -c ~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-final-20260731-1040-b4ad329a.zip.sha256
```

## AS TRÊS REPROVAÇÕES

| # | falhou em | causa |
|---|---|---|
| 1 | contratos | exceção declarada para `hostinger.env`, que está no `.gitignore` e não viaja no pacote |
| 2 | contratos | **a correção repetiu o defeito**: usei `git check-ignore`, e um ZIP extraído não é repositório git |
| 3 | smoke test | `/api/v1/ready` respondeu **HTTP 500 cru** sem `.env` — a rota que diz o que falta quebrava por faltar |

O pacote 3 **passou em tudo que é estático** e só caiu quando a aplicação foi
levantada. Nenhuma verificação de código pegaria aquilo.

## O PROCEDIMENTO EXECUTADO

| # | etapa | resultado |
|---|---|---|
| 1 | lista antes de compactar | **0** arquivos proibidos |
| 2 | varredura **dentro do ZIP** | 3349 entradas · 0 `.env` · 0 `node_modules` · 0 `.git` · 0 `.log` · 0 `.pem`/`.key` · 0 `.zip` |
| 3 | extração em diretório novo | ok |
| 4 | varredura **por conteúdo** (JWT, `sk-`, `EAA`) | **0 segredos** |
| 5 | `npm ci` | **exit 0** |
| 6 | typecheck | **exit 0** |
| 7 | lint `--max-warnings=0` | **exit 0** |
| 8 | contratos | **exit 0** — 1.191 · 1.178 aprovados · **0 falhas** · 13 pulados |
| 9 | scanner de segredos | **exit 0** |
| 10 | **`npm audit --omit=dev`** | **0 vulnerabilidades** no que vai ao servidor |
| 11 | build de produção | **exit 0** |
| 12 | **aplicação de pé** (`next start`) | ok |
| 13 | smoke `/login` | **HTTP 200** |
| 14 | smoke `/api/v1/ready` **sem `.env`** | **HTTP 503** com `estado: "banco_fora"` e as variáveis ausentes nomeadas |
| 15 | smoke redirect `/properties/mtching` | **HTTP 308** |

> **Nenhum `git check-ignore` no diretório extraído.** A validação é por conteúdo
> do arquivo compactado e por comportamento da aplicação servida.

## A DIFERENÇA DE CONTAGEM

| | máquina | pacote |
|---|---:|---:|
| testes | 1.203 | **1.191** |
| pulados | 9 | **13** |

12 contratos dependem de credenciais que não viajam no pacote, por desenho.

## O QUE ESTA VALIDAÇÃO **NÃO** COBRE

Login real e jornada completa — exigem credenciais no `.env`, que é implantação,
não empacotamento. Está provado que o pacote **instala, compila, passa nos
testes, sobe e responde**. Não está provado que ele *opera*.
