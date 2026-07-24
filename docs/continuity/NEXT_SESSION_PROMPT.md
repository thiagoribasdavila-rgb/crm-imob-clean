# NEXT_SESSION_PROMPT — retomada

Copie o bloco abaixo para iniciar a próxima sessão.

---

RETOMADA — ATLAS V3 / ATLAS ONE

Base canônica: `/Users/thiagoribasdavila/atlas-v3`, branch `claude/atlas-v3-entregas`.
A unificação com `ATLAS_ONE_FINAL_OPERACIONAL.zip` foi concluída em 2026-07-24 até o limite da
capacidade autorizada. **Não repita a análise**: leia primeiro `docs/continuity/CURRENT_STATE.md`,
`MERGE_MATRIX.md`, `MERGE_DECISION_LOG.md`, `KNOWN_RISKS.md` e `NEXT_BLOCK.md`.

Antes de agir, verifique (não assuma):

- `git log -1 --oneline` deve mostrar o commit de docs de continuidade ou `e897adfe`;
- `git status` deve estar limpo;
- `npm test` deve dar **62 testes, 0 falhas** (53 unitários + 9 contratos);
- `npm run cc23:check` deve dar **30/30**;
- `npm run typecheck`, `npm run lint` e `npm run build` devem sair 0.

Se algum número divergir, pare e investigue antes de qualquer alteração — outra sessão pode ter
editado o mesmo working tree.

TAREFA: executar o **Bloco 1** de `docs/continuity/NEXT_BLOCK.md` (7 correções pontuais já
mapeadas). Comece pelos itens 1 a 4, que são independentes e de baixo risco. Para os itens 5, 6 e
7, faça a verificação listada como pré-requisito **antes** de alterar.

REGRAS QUE CONTINUAM VALENDO:

- o ZIP Atlas One é fonte seletiva, nunca base; nunca importação em massa;
- **nunca `git add -A`** neste repositório — stage sempre por caminho explícito;
- commits pequenos, estilo `tipo(escopo): descrição`, com o resultado real da validação no corpo;
- **rodar os `*:check` afetados além de test/tsc/lint/build** — eles não estão em `npm test` e já
  deixaram passar uma regressão nesta sessão;
- parar e perguntar antes de: banco, migrations, RLS, RBAC, autenticação, produção,
  infraestrutura ativa, provedor externo, custo, substituição arquitetural, push ou PR.

PENDÊNCIAS DE DECISÃO DO DONO (não decida sozinho):

1. push dos 592 commits locais (hoje sem nenhum backup fora da máquina);
2. `security:secrets` vermelho por falso positivo, bloqueando a cadeia `validate` inteira;
3. os 21 conflitos manuais grandes listados na matriz — vários são decisão de produto.
