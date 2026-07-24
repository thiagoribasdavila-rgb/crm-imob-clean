# NEXT_SESSION_PROMPT — retomada

Copie o bloco abaixo para iniciar a próxima sessão.

---

RETOMADA — ATLAS V3 / ATLAS ONE

Base canônica: `/Users/thiagoribasdavila/atlas-v3`, branch `claude/atlas-v3-entregas`.

A unificação com `ATLAS_ONE_FINAL_OPERACIONAL.zip` está **concluída no que é tecnicamente
decidível** (24 commits). **Não refaça a análise.** Leia primeiro, nesta ordem:
`COMPLETE_UNIFICATION_REPORT.md` → `CURRENT_STATE.md` → `PRODUCT_DECISIONS_REQUIRED.md`.

Verifique antes de agir (não assuma):

- `git status` limpo;
- `npm test` → **69 testes, 0 falhas** (53 unitários + 16 contratos);
- `npm run security:secrets` → PASSED;
- `npm run cc23:check` → 30/30;
- `npm run typecheck`, `npm run lint`, `npm run build` → exit 0;
- a cadeia `validate` tem **14 portões vermelhos de 80** — todos pré-existentes e
  categorizados; nenhum foi afrouxado para produzir verde.

Se algum número divergir, pare e investigue antes de qualquer alteração.

## O bloqueio que domina tudo

A última migration aplicada no banco vivo é **`20260716083708`**. As **128 migrations locais
posteriores nunca subiram**. Isso trava **12 dos 14 portões vermelhos**, a recorrência de
tarefas, os SLAs medidos, a distribuição governada e a hierarquia comercial.

Não existe conserto de código para eles: os checks exigem RPCs e tabelas que só existem no
repo. Fazê-los ficar verdes **quebraria produção** — o caso `commercial-hierarchy` é a prova
(pede o RPC `manage_commercial_profile`, da migration `20260717072714`, não aplicada).

**TAREFA RECOMENDADA: aplicar o bloco de migrations em HOMOLOGAÇÃO** (nunca direto em
produção), nesta ordem — o ledger da fase 59 depende das cinco tabelas anteriores:

```
20260716210000 (base canônica) → 20260716212459 → 20260717072714
→ 34 → 35 → 37 → 43 → 55 → 56 → 57 → 58 → 59 (por último)
```

Isso exige autorização explícita de banco. **Peça antes de executar.**

Se a autorização não vier, a alternativa é o **Bloco 1** de `NEXT_BLOCK.md` — mas atenção: os
itens 5, 6 e 7 de lá também dependem do banco ou de decisão de produto; só as correções de
código puro estão livres.

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
