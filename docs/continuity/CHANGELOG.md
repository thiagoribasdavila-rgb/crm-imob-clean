# CHANGELOG — unificação Atlas v3 × Atlas One

## 2026-07-24 — checkpoint de unificação (6 commits locais, sem push)

### Corrigido

- **8 telas quebradas em runtime** (`e897adfe`): páginas guardavam o envelope `{ok,data,meta}`
  no lugar do dado, fazendo `data.lead`/`data.summary`/`data.groups` virarem `undefined` e o
  primeiro acesso encadeado lançar TypeError. Afetava developments/homologation,
  developments/registry, developments/[id]/dossier, developments/[id]/region-study,
  leads/deduplication, leads/[id]/behavior, leads/[id]/contact-preferences,
  leads/[id]/attribution.
- **Ensaio de build limpo validava pacote obsoleto** (`b05775e6`): apontava para
  `atlas-v3-hostinger-final.zip` (18/jul) enquanto o release gera
  `atlas-v3-hostinger-homologation.zip`. Passava por causa de um ZIP velho em disco. Resolve o
  risco R13 do runbook de deploy.
- **Conformidade com o contrato da camada CC23** (`916c609a`): a entrega de layout claro havia
  derrubado `cc23:check` de 30/30 para 27/30 (blur, drop-shadow e variável sem definição dentro
  da camada). Corrigido na mesma sessão, por auto-auditoria.

### Adicionado

- **Kanban de execução no pipeline** (`0e963a82`): bloco de prontidão com token visual de alerta
  por status (crítico/atenção/oportunidade/limpo), cobertura clara do shell interno (sidebar,
  topbar, buscas, navegação) e das superfícies do pipeline, microcopy operacional na fila de
  execução, mais `npm run light-layout:check` e `docs/LIGHT_LAYOUT_EVOLUTION.md`.
- **`--readiness-accent` como token real** em `:root`, derivado de `--primary` (`916c609a`).
  Neutro nos dois temas: resolve exatamente para os valores que antes eram fallback literal.
- **Suíte de contratos** (`d48cbe24`): `tests/contracts/{safe-redirect,legacy-v2-compat}.test.mjs`
  importados do pacote Atlas One. `npm test` passou a encadear `test:unit` + `test:contracts`.
  **53 → 62 testes.** Cobre pela primeira vez `lib/auth/safe-redirect.ts` (open redirect).
- **Documentação de continuidade** (`docs/continuity/`, 12 arquivos): snapshot pré-merge,
  inventário do ZIP, matriz de merge, log de decisões, resultados de teste, validação de tema,
  riscos, plano de rollback, próximo bloco, prompt de retomada, razão de capacidade e este
  changelog.

### Decidido (sem alteração de código)

- **Repo é base canônica; o pacote Atlas One é fonte seletiva.** O ZIP é uma linha paralela de
  empacotamento que não contém o tema claro (0 ocorrências de `data-theme="light"` contra 71 no
  repo), nem o `PublicPageShell`, nem a camada `cc6-*`, nem a reconciliação CC-6.
- **118 conflitos resolvidos a favor do repo** com evidência (o ZIP removeria rate-limit, audit
  log, taxonomia de descarte, variáveis de ambiente em uso, o próprio alternador de tema).
- **21 conflitos manuais grandes** documentados e deixados em aberto — exigem decisão de produto.
- **`supabase/**` não analisado**: gatilho de parada de banco/RLS respeitado.

### Conhecido e não corrigido

- `npm run security:secrets` falha por **falso positivo pré-existente** (a regex casa o glob
  `NEXT_PUBLIC_SUPABASE_*` escrito em prosa no runbook). Bloqueia a cadeia `validate` inteira no
  primeiro passo. Não foi "corrigido para ficar verde" — fica para decisão do dono.
