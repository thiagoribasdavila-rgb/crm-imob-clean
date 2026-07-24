# NEXT_SESSION_PROMPT — retomada

Copie o bloco abaixo para iniciar a próxima sessão.

---

RETOMADA — ATLAS V3 / ATLAS ONE

Base canônica: `/Users/thiagoribasdavila/atlas-v3`, branch `claude/atlas-v3-entregas`.

A unificação com `ATLAS_ONE_FINAL_OPERACIONAL.zip` está **concluída no que é tecnicamente
decidível** (24 commits). **Não refaça a análise.** Leia primeiro, nesta ordem:
`COMPLETE_UNIFICATION_REPORT.md` → `CURRENT_STATE.md` → `PRODUCT_DECISIONS_REQUIRED.md`.

Verifique antes de agir (não assuma) — há um alvo único para isso agora:

```
npm run verify
```

Ele encadeia scanner de segredos, typecheck, lint, os 69 testes, `cc23:check` e
`light-layout:check`. Existe porque os portões de design **não** estão em `npm test` nem no
build, e uma regressão de CC23 passou despercebida por isso nesta sessão. Esperado: exit 0.

Confira também:

- `git status` limpo;
- `npm run build` → exit 0;
- a cadeia `validate` tem **14 portões vermelhos de 80** — todos pré-existentes e
  categorizados; nenhum foi afrouxado para produzir verde.

Se algum número divergir, pare e investigue antes de qualquer alteração.

## O bloqueio que domina tudo — e NÃO é o que a documentação antiga dizia

Verificado ao vivo em 2026-07-24: **não faltam migrations.** Existem dois projetos Supabase e
o schema está num, o dado está no outro.

| projeto | tabelas | leads | migrations | quem aponta |
|---|---|---|---|---|
| `atlas-v3-homologacao` (`pozbrcsfthnhmnebfoxv`) | 176 | **0** | **176 aplicadas** | `.env.local` (dev) |
| `atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`) | 24 | **17.151** | schema legado | `.env.hostinger` (deploy) |

Os 12 RPCs que os portões exigem **existem todos** em homologação (`manage_commercial_profile`,
`create_recurring_task`, `distribute_project_leads_v4`, `get_portfolio_audit_ledger`…), assim
como as colunas de SLA. **O `migration-status.txt` do repo descreve o projeto errado** — foi a
fonte do diagnóstico equivocado.

Portanto: os 12 portões estão travados porque **o deploy aponta para o banco sem os RPCs**.
Ligar o código a eles funcionaria em desenvolvimento e quebraria no Hostinger.

**A decisão é de infraestrutura e é do dono** (ver D-6 em `PRODUCT_DECISIONS_REQUIRED.md`):
apontar o deploy para homologação (que tem o schema mas está vazia — precisa da carga de
17.151 leads reais), ou levar o schema ao banco que tem os dados (operação sobre dado de
cliente, não exercício técnico). **Não decida isso sozinho.**

Enquanto não houver decisão, o que está livre é trabalho que não toca banco: o tema claro nas
telas restantes (Command Center, Leads, Projetos, Copilot — fundação e check já existem) e as
correções de código puro do `NEXT_BLOCK.md`.

## Regras que continuam valendo

- o ZIP Atlas One é fonte seletiva, nunca base; nunca importação em massa;
- **nunca `git add -A`** — stage sempre por caminho explícito;
- commits pequenos, `tipo(escopo): descrição`, com o resultado real da validação no corpo;
- **rodar os `*:check` afetados** além de test/tsc/lint/build — eles não estão em `npm test` e
  já deixaram passar uma regressão nesta sessão;
- **prova negativa obrigatória** ao mexer em qualquer check: quebre a proteção de propósito,
  confirme que o portão reprova, restaure. Foi assim que os 6 portões desta sessão foram
  corrigidos sem afrouxar nenhum;
- parar e perguntar antes de: banco, migrations, RLS, RBAC, autenticação, produção,
  infraestrutura ativa, provedor externo, custo, push ou PR.

## Pendências de decisão do dono (não decida sozinho)

1. **Push** — 31 commits não enviados ao remoto. A branch existe no `origin` em `8171a397`;
   o local está à frente, 0 atrás. O bundle é o único backup deles fora do disco.
2. **As 7 decisões de produto** em `PRODUCT_DECISIONS_REQUIRED.md` (D-1 a D-7), cada uma com
   opções e consequências já levantadas.
3. **`security:dependencies`** — advisory `brace-expansion` sem correção viável: a linha v1
   termina na própria versão vulnerável e forçar a v5 quebra o ESLint (testado e revertido).
   Chega por `read-excel-file → unzipper → fstream → rimraf → glob@7 → minimatch@3`. Sair dele
   exigiria trocar `read-excel-file`, o que é decisão de dependência, não de merge.
