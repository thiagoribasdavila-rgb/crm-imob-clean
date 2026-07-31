# RELATÓRIO DE SEGURANÇA

**2026-07-31.** Medido, não estimado.

## SEGREDOS — LIMPO

| verificação | resultado |
|---|---|
| `npm run security:secrets` | **PASSED** — 2.592 arquivos rastreados, **0 credenciais** |
| varredura por conteúdo no ZIP extraído (JWT `eyJhbGciOi`, `sk-`, `EAA`, `service_role`) | **0 ocorrências** |
| `.env` / `.env.local` no pacote | **0** |
| `.git` / `node_modules` no pacote | **0** |
| resposta de `/api/v1/ready` sem ambiente | nomeia as variáveis ausentes, **nunca o valor** |

## AUTORIZAÇÃO — MEDIDO

| verificação | resultado |
|---|---|
| `npm run api-security:check` | **aprovado** — 204 rotas classificadas |
| rotas autenticadas | 169 |
| workers com `ATLAS_CRON_SECRET` e falha **fechada** | **19** |
| pontes máquina-a-máquina com segredo próprio | 3 |
| escalação de privilégio em RPC | corrigida e **reprovada por ataque reproduzido** |
| RLS nas tabelas criadas nesta linha de trabalho | aplicada |

## ⚠️ DEPENDÊNCIAS — O ACHADO DESTA RODADA

```bash
npm audit
```

| severidade | quantidade |
|---|---:|
| crítica | **0** |
| **alta** | **9** |
| moderada | **3** |
| baixa | 0 |
| **total** | **12** |

**Dependências diretas afetadas: 3** — `eslint`, `eslint-config-next`, `prisma`.

**Não corrigido nesta rodada.** `npm audit fix --force` traz mudanças de major
em ferramentas que governam o lint e o cliente de banco: rodar isso sem
reexecutar os 1.196 contratos e os 220 portões é trocar risco conhecido por risco
desconhecido, no fim de uma entrega.

**As três são de desenvolvimento/ferramenta**, não de runtime servido ao usuário
— o que reduz a exposição, mas **não zera**: `prisma` participa do build.

**Ação recomendada, em rodada própria:** `npm audit` detalhado por pacote,
atualização uma a uma, cadeia de verificação completa entre cada uma.

## O QUE NÃO FOI AUDITADO NESTA RODADA

XSS por injeção em campo · CSRF · open redirect · upload de arquivo malicioso ·
IDs previsíveis (IDOR) · cabeçalhos de segurança verificados na resposta real ·
política de cookies e expiração de sessão.

Todos exigem teste ativo contra a aplicação servida, não leitura de código.
Nenhum foi executado. **Não os declaro como aprovados.**
