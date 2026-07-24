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

## 2026-07-24 (parte 2) — unificação definitiva + estabilização

24 commits no total desde `b3d268df`. Nenhum push.

### Corrigido — segurança

- **Scanner de segredos verde e mais forte** (`af458ea7`): o falso positivo que o mantinha
  vermelho era o glob `NEXT_PUBLIC_SUPABASE_*` escrito em prosa. Resolvido sem ampliar
  allowlist — famílias documentais são reconhecidas e ainda validadas contra o prefixo
  aprovado. No caminho, dois ganhos reais: o bug de `lastIndex` que deixava escapar segredo
  no início de arquivo, e a **ausência total de detecção de JWT** — justamente o formato da
  chave de service role. 7 testes novos, incluindo prova de regressão.
- **3 vulnerabilidades ALTAS eliminadas** (`c30b8b4d`): `sharp` 0.34.5 → 0.35.3 (4 CVEs de
  libvips), `fast-uri` → 3.1.4, `@hono/node-server` → ^2.0.5.
- **Comissão sem auditoria é desfeita** (`a15efddb`): o insert em `commission_events` tinha o
  erro ignorado — alteração financeira ficava gravada sem registro e o cliente recebia 200.
- **Rate limit em `pipeline/stages`** e fim do vazamento de `error.message` do Postgres ali.

### Corrigido — build e contratos

- **O build valida o contrato de página do Next** (`a00c8d03`): passou a usar o binário local
  em vez de `npx` (sem download implícito). Isso revelou um erro real — `dashboard/page.tsx`
  exportava `CommandCenterModuleHealth`, e o Command Center importava o componente de dentro
  de um arquivo de rota. Extraído para `components/atlas/command-center-module-health.tsx`.
- **Turbopack de volta como padrão** (`434c1eeb`): o webpack estourava o orçamento de
  performance (772 chunks contra 600). Regressão minha, revertida na origem.

### Corrigido — portões (de 24 vermelhos para 14)

Seis portões voltaram ao verde, **nenhum afrouxado**, todos com prova negativa:
`observability` e `security:audit` (a redação migrou para `redact.ts` e os checks não
seguiram) · `hierarchy-enforcement` (catálogo saiu do sidebar para `navigation.ts`) ·
`abuse-protection` (a rota trata 23505 com guarda invertida, e estava certa) ·
`unassigned-queue` (garantia verdadeira que a interface não declarava) ·
`ready-campaigns` (o caso 16 contradizia o próprio check) · `manager-dashboard` ·
`atlas-logo` (deriva de nome de token; agora reprova só pela decisão do favicon) ·
`environment:variables` (união de 96 + 12 variáveis, sem perder nenhuma em uso).

### Documentado

`COMPLETE_UNIFICATION_REPORT` · `PRODUCT_DECISIONS_REQUIRED` (7 decisões) ·
`VALUE_ADD_IMPROVEMENTS` (4 melhorias com gate) · `RESTORE_INSTRUCTIONS` (4 cenários) ·
os 21 conflitos manuais classificados A–F.

### O bloqueio que ficou

A última migration aplicada no banco vivo é `20260716083708`; **128 posteriores nunca subiram**.
Isso trava 12 dos 14 portões restantes. Nenhum foi forçado a ficar verde — quando o verde
exigiria quebrar produção, o vermelho ficou documentado.
