# ROLLBACK_PLAN — como desfazer a unificação de 2026-07-24

Nenhuma alteração desta sessão tocou banco, produção, infraestrutura ativa ou provedor externo.
O rollback é **inteiramente local e reversível por Git**.

## Âncora de segurança

Branch criada **antes** de qualquer alteração:

```bash
git log -1 --oneline checkpoint/pre-unificacao-2026-07-24
```

Deve mostrar `b3d268df feat(meta): expose andromeda signal quality`.
Esse é o estado exato de antes da sessão, com o working tree pendente preservado em
`docs/continuity/PRE_MERGE_DIFF.patch` (512 linhas, self-contained, inclui os não rastreados).

## Rollback total (volta ao ponto pré-sessão)

```bash
git checkout claude/atlas-v3-entregas && git reset --hard checkpoint/pre-unificacao-2026-07-24
```

Isso descarta os 6 commits desta sessão. Para recuperar o trabalho pendente que existia antes:

```bash
git apply docs/continuity/PRE_MERGE_DIFF.patch
```

## Rollback seletivo (recomendado — cada commit é independente)

| desfazer | comando | efeito |
|---|---|---|
| correção do envelope da API | `git revert e897adfe` | 8 telas voltam a quebrar em runtime — **não recomendado** |
| correção do nome do artefato | `git revert b05775e6` | ensaio de build volta a validar ZIP obsoleto |
| conformidade CC23 | `git revert 916c609a` | `cc23:check` volta a 27/30 — **não recomendado** |
| testes de contrato importados | `git revert d48cbe24` | volta de 62 para 53 testes |
| evolução do layout claro | `git revert 0e963a82 916c609a` | remove o Kanban de execução e a camada clara do shell (reverter os dois juntos, nesta ordem) |

Os commits são independentes **exceto** `916c609a`, que corrige `0e963a82` — reverter só o
primeiro deixaria o repo com o layout claro sem conformidade CC23.

## Verificação após qualquer rollback

```bash
npm run typecheck && npm run lint && npm test && npm run cc23:check && npm run build
```

Estado esperado no ponto pré-sessão: 53 testes, `cc23:check` 30/30, tsc 0, eslint 0, build exit 0.
Estado esperado no HEAD atual: 62 testes, `cc23:check` 30/30, tsc 0, eslint 0, build exit 0.

## O que o rollback NÃO precisa desfazer

- **Banco**: nenhuma migration aplicada, nenhum DDL, nenhum dado alterado.
- **Produção / VPS / DNS**: nada publicado, nenhum deploy executado.
- **Remoto**: nenhum push, nenhum PR — os 6 commits são 100% locais.
- **Provedores externos**: nenhuma chamada a Meta, Supabase, WhatsApp ou IA.
- **Dependências**: nenhuma instalada, `package-lock.json` intocado.
- **ZIPs de origem**: `ATLAS_ONE_FINAL_OPERACIONAL.zip` preservado intacto (checksum reconferido);
  a extração foi feita em diretório isolado no scratchpad da sessão.
