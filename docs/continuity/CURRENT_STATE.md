# CURRENT_STATE — Atlas v3 / Atlas One

Data: 2026-07-24 (execução completa de unificação + estabilização)

## Identidade

| campo | valor |
|---|---|
| Base canônica | `/Users/thiagoribasdavila/atlas-v3` |
| Branch | `claude/atlas-v3-entregas` |
| Commits desta unificação | **15** desde `b3d268df` |
| Branch de segurança | `checkpoint/pre-unificacao-2026-07-24` → `b3d268df` |
| Remoto | `origin` (GitHub, privado) tem esta branch em `8171a397`; o local está **à frente, 0 atrás** |
| Push / PR / deploy | **nenhum executado** — decisão do dono |
| Versão | `3.0.0-rc.2` |
| Working tree | limpo |

> Correção de um dado que reportei errado antes: os "594 commits sem push" eram a distância
> até `main`, não até o remoto **desta** branch. A branch existe no `origin` e a maior parte do
> trabalho já está lá; o que falta enviar é o bloco recente.

## Estado de qualidade (tudo reexecutado)

| portão | resultado |
|---|---|
| `npm test` | **69/69** (53 unitários + 16 contratos), 0 falhas |
| `tsc --noEmit` | exit 0 |
| `eslint --max-warnings=0` | exit 0 |
| `npm run build` | exit 0 |
| `security:secrets` | **PASSED** — 2.252 arquivos, 0 credenciais |
| `cc23:check` | 30/30 |
| `light-layout:check` | ✅ |
| `observability:check` | PASSED |
| `security:audit` | PASSED |
| `environment:variables` | PASSED (108 classificadas) |
| `performance:check` | PASSED |
| contraste WCAG (27 pares, 2 temas) | 0 reprovações AA |
| **portões da cadeia `validate`** | **64 verdes / 16 vermelhos** (eram 24 vermelhos) |

### Os 16 portões vermelhos — nenhum novo, nenhum afrouxado

| categoria | qtd | natureza |
|---|---|---|
| **BLOQUEADO_BANCO** | 12 | exigem migrations que nunca subiram ao banco vivo |
| **BLOQUEADO_PRODUTO** | 2 | `atlas-logo` (favicon simplificado), `ready-campaigns` |
| **advisory sem correção** | 1 | `security:dependencies` — ver abaixo |
| **UI pendente** | 1 | `manager-dashboard` (2 marcadores de interface) |

**O fato mestre:** a última migration aplicada no banco vivo é **`20260716083708`**. As
**128 migrations locais posteriores nunca foram aplicadas**. Vários portões exigem RPCs e
tabelas que só existem no repo — fazê-los ficar verdes **quebraria produção**. O caso mais claro
é `commercial-hierarchy`, que pede que a rota de equipe chame `manage_commercial_profile`: o RPC
está na migration `20260717072714`, não aplicada.

### Sobre `security:dependencies`

As 3 vulnerabilidades **altas** que existiam foram eliminadas (`sharp` 0.34.5 → 0.35.3,
`fast-uri` → 3.1.4, `@hono/node-server` → ^2.0.5), via `overrides`.

Um advisory **novo** apareceu durante a execução: `brace-expansion <=5.0.7`. Não tem correção
possível hoje — a linha v1 termina em 1.1.16, que é a própria versão vulnerável, e forçar a v5
**quebra o ESLint** (`minimatch@3` depende da API antiga; testado e revertido). Chega pela
cadeia `read-excel-file → unzipper → fstream → rimraf → glob@7 → minimatch@3`, com padrões
glob internos, não controlados por usuário.

## O que mudou nesta execução (8 commits)

1. `af458ea7` — scanner de segredos verde **e detectando mais** (JWT, Slack, bug do `lastIndex`)
2. `e58ec4c9` — fixtures do teste do scanner deixam de disparar o próprio scanner
3. `a15efddb` — comissão sem auditoria é desfeita; etapas do pipeline ganham rate limit
4. `64648279` — instruções de restauração e localização dos backups
5. `c30b8b4d` — 3 vulnerabilidades altas eliminadas
6. `a00c8d03` — build valida o contrato de página do Next; erro real corrigido
7. (ajuste) — turbopack volta a ser padrão; override do advisory novo
8. `47cd433e` — 4 portões voltam ao verde, 3 eram falso negativo do próprio check

## Fronteiras respeitadas

banco · migrations · RLS · RBAC · autenticação · produção · VPS/DNS · infraestrutura ativa ·
provedores externos · custo · push · PR · o ZIP original (checksum reconferido, intacto).
