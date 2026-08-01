# PLANO DE COMMITS LÓGICOS

**Princípio:** um commit deve poder ser revertido sozinho sem derrubar outro
assunto. Misturar segurança com documentação obriga quem reverte a escolher entre
manter um defeito e perder um texto.

---

## O QUE JÁ FOI COMMITADO NESTA SESSÃO — separação respeitada

| # | commit | assunto | reversível sozinho |
|---|---|---|:--:|
| 1 | `cc63c002` | instalador de cron recusa fora do servidor | ✔ |
| 2 | `4d7e5731` | relógio do lease + reivindicação atômica | ✔ |
| 3 | `041f01f2` | seis estados da prontidão + identidade do build | ✔ |
| 4 | `651eda13` | diagnóstico documental da fila e da Meta | ✔ |
| 5 | `bad0421c` | versionamento dos 43 arquivos locais | ✔ |
| 6 | `ba2093e0` | comparador: aviso de migrations sem `undefined` | ✔ |
| 7 | `9dc8b900` | correção do drift + matriz e diagnóstico | ✔ |
| 8 | `dcdbb927` | revisão dos módulos de IA | ✔ |
| 9 | `6df3465b` | equivalências declaradas de migrations | ✔ |

A regra "não misturar correção crítica de segurança com alteração visual" foi
respeitada: `cc63c002` e a migration de escalação de privilégio não carregam nenhuma
mudança de interface.

## O QUE FALTA COMMITAR — nesta ordem

| # | assunto | arquivos | por que separado |
|---|---|---|---|
| 10 | **matriz dos módulos de IA** | `docs/auditoria/MATRIZ_REAL_MODULOS_IA.md` | é leitura; reverter não afeta código |
| 11 | **plano de ativação segura** | 3 docs em `docs/operacao/` | desenho da Fase 3; nada executável |
| 12 | **scripts operacionais** | 9 em `scripts/operations/` + runbook | é o único que traz executável novo — precisa de reversão isolada |
| 13 | **auditoria do diff** | 3 docs em `docs/auditoria/` | leitura |
| 14 | **consolidação e indicadores** | `AUDITORIA_FINAL`, `SOURCE_OF_TRUTH`, indicadores, falsos positivos, decisões | fecha o checkpoint |

## O QUE NÃO ENTRA EM NENHUM DESTES

**Remoção dos 414 arquivos vazios.** É limpeza legítima, mas de outro assunto.
Misturá-la faria o commit de auditoria carregar 414 deleções, e quem revertesse a
auditoria ressuscitaria os arquivos. Commit próprio, depois deste checkpoint.

## PARA O PR FUTURO — quando autorizado

O PR terá **236.839 inserções vs `main`**, porque a branch tem **893 commits** de
divergência. Isso é histórico, não desta sessão (15.511 linhas em 70 arquivos).

Quem revisar deve olhar `17db153e..HEAD`, não `main...HEAD`:

```bash
git diff --stat 17db153e..HEAD
```

**Nenhum PR foi criado.** Nenhum merge, nenhum deploy.
