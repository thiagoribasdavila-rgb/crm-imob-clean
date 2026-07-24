# PRE_MERGE_STATE — snapshot antes da unificação

Data do checkpoint: 2026-07-24
Sessão: retomada pós-limite de uso (prompt "ATLAS ONE V100 — revisão do checkpoint + unificação")

## Identificação do workspace

- Raiz real: `/Users/thiagoribasdavila/atlas-v3`
- Branch ativa: `claude/atlas-v3-entregas`
- Último commit: `b3d268df` — `feat(meta): expose andromeda signal quality` (2026-07-22 18:42:59 -0300)
- Commits à frente de `main`: **587** (100% locais, sem push — push nunca autorizado)
- `main` está em: `fe4c9664` — `feat: add Atlas AI memory tables foundation`
- Branch de segurança criada: `checkpoint/pre-unificacao-2026-07-24` (aponta para `b3d268df`)
- Stashes: nenhum
- Worktrees residuais de sessões antigas (ambos em `fe4c9664`, intocados):
  - `.claude/worktrees/trusting-yalow-832daf`
  - `.claude/worktrees/zealous-proskuriakova-d6cfc5`

## Estado do working tree (git status no momento do snapshot)

Modificados (unstaged; nada staged):
- `app/(crm)/pipeline/page.tsx` (+54/-~5)
- `app/globals.css` (+245)
- `package.json` (+1 linha)

Não rastreados:
- `docs/LIGHT_LAYOUT_EVOLUTION.md`
- `scripts/check-light-layout-foundation.mjs`

Diff completo (tracked + untracked, self-contained): `docs/continuity/PRE_MERGE_DIFF.patch` (512 linhas)

## Interpretação (validação do screenshot da sessão interrompida)

O screenshot dizia: "alteração pendente do token visual de alerta", "~53 testes passando",
"PublicPageShell.tsx analisado", "próxima ação = commit + ZIP".

Confirmado contra o repo:
- O trabalho de tema claro nas páginas públicas **já está commitado** — `fdef7a03` (fundação
  da paleta), `f4f84fc9` (contraste AA em 367 pontos), `8171a397` (PublicPageShell/páginas
  públicas respondem ao tema claro). O screenshot descrevia trabalho JÁ consolidado.
- O que ficou **pendente e não commitado** é a unidade seguinte: "light layout evolution"
  (globals.css + pipeline + script de verificação + doc). É exatamente o diff preservado aqui.
- Contagem de 53 testes: NÃO verificada ainda — será reexecutada nesta sessão.

## Mudanças incompletas conhecidas

- O diff pendente é uma unidade coesa (evolução de layout do tema claro) que a sessão
  anterior ia commitar quando foi interrompida. Precisa de: revisão, execução do check
  script, suíte de testes, e então commit próprio — antes de qualquer merge do ZIP.

## Riscos registrados neste momento

1. Duas linhagens divergentes: este repo (linha de desenvolvimento, 587 commits locais)
   vs ZIP "ATLAS ONE V1000/FINAL_OPERACIONAL" (linha de empacotamento/instalação limpa,
   sem git, `commit: null`, estrutura reorganizada, sem PublicPageShell).
2. Working tree historicamente compartilhado entre sessões — regra permanente:
   **nunca `git add -A`**, stage sempre por caminho explícito.
3. 587 commits sem push = backup inexistente fora desta máquina (mitigado agora pela
   branch de segurança local + este snapshot, mas o risco de disco permanece).
4. Nenhuma migration aplicada no banco vivo (drift conhecido e documentado em memória
   de projeto); nada nesta sessão toca banco.

## Testes conhecidos (registro anterior, a reconfirmar)

- Screenshot mencionava ~53 passando. Script real: `npm test` → `node --test "tests/*.test.ts"`.
- Reexecução obrigatória antes de qualquer afirmação.
