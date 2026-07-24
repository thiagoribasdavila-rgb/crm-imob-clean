# CURRENT_STATE — Atlas v3 / Atlas One após a unificação

Data: 2026-07-24

## Identidade

| campo | valor |
|---|---|
| Base canônica | `/Users/thiagoribasdavila/atlas-v3` |
| Branch | `claude/atlas-v3-entregas` |
| HEAD | `e897adfe fix(crm): 8 telas liam o envelope da API em vez do dado` |
| Commits à frente de `main` | **592** (100% locais, **sem push**) |
| Branch de segurança | `checkpoint/pre-unificacao-2026-07-24` → `b3d268df` |
| Versão | `3.0.0-rc.2` |
| Working tree | limpo (só `docs/continuity/` novo, commitado junto) |

## Estado de qualidade (reexecutado em 2026-07-24)

| portão | resultado |
|---|---|
| `npm test` | **62/62** (53 unitários + 9 contratos), 0 falhas |
| `tsc --noEmit` | exit 0 |
| `eslint --max-warnings=0` | exit 0 |
| `npm run build` | exit 0 |
| `cc23:check` | 30/30 |
| `light-layout:check` | ✅ |
| `validate-deploy:check` | exit 0 |
| contraste WCAG (27 pares, 2 temas) | 0 reprovações AA |
| `security:secrets` | ❌ **falha pré-existente** — falso positivo (ver abaixo) |

### Sobre a falha do `security:secrets`

`scripts/scan-secrets.mjs:33` casa a regex `NEXT_PUBLIC_[A-Z0-9_]+` contra o texto
`NEXT_PUBLIC_SUPABASE_*` escrito em prosa no runbook de deploy. O `allowedPublic` contém os
nomes completos (`..._URL`, `..._ANON_KEY`, `..._PUBLISHABLE_KEY`), mas não o prefixo truncado
que o glob produz. **Não há segredo vazado.**

Confirmado **pré-existente**: falha idêntica no commit `b3d268df` (estado anterior à sessão), e
o diff desta sessão nesse arquivo tem 0 ocorrências do termo. **Não foi "corrigido" para ficar
verde** — mexer no scanner ou na prosa só para passar seria mascarar o sinal. Fica registrado
para decisão do dono.

Consequência prática: como `validate` começa por `security:secrets`, **a cadeia completa de
validação está bloqueada no primeiro passo** — e provavelmente já estava antes desta sessão.

Varredura independente de segredos reais (chaves `sk-`, JWT, `AKIA`, `xox[bp]-`, chave privada
PEM) sobre todos os arquivos rastreados: **nenhum achado**. A única string com formato de JWT é
um fixture propositalmente falso em `tests/observabilidade.test.ts`, usado para provar que a
redação funciona. Nenhum `.env` real é rastreado (só `.env.example`, com placeholders locais).

## O que mudou nesta sessão (6 commits)

1. `0e963a82` `feat(tema)` — evolução do layout claro (unidade que estava interrompida)
2. `d48cbe24` `test(contracts)` — 2 testes importados do pacote Atlas One (53 → 62)
3. `916c609a` `fix(tema)` — conformidade com o contrato CC23 (auto-auditoria: 27/30 → 30/30)
4. `b05775e6` `fix(release)` — ensaio de build limpo aponta para o pacote real
5. `e897adfe` `fix(crm)` — 8 telas liam o envelope da API em vez do dado
6. `docs(continuity)` — este conjunto de documentos

## Relação com o pacote Atlas One

O ZIP **não é** uma versão mais nova do mesmo código: é uma **linha paralela** de empacotamento
("Atlas One" V1000, fases até 164) que exclui deliberadamente partes do produto
(`legacyPrototypeRoutesIncluded: false`, `unusedConceptualCoreIncluded: false`) e **não contém**
o tema claro, o `PublicPageShell`, a camada `cc6-*` nem a reconciliação CC-6.

Decisão firmada: **repo é base; ZIP é fonte seletiva**. Ver `MERGE_MATRIX.md`.

## Fronteiras respeitadas (nada disso foi tocado)

banco · migrations · RLS · RBAC · autenticação · produção · VPS/DNS · infraestrutura ativa ·
provedores externos (Meta, Supabase, WhatsApp, IA) · dependências (`package-lock.json` intocado) ·
push · PR · o ZIP original (checksum reconferido, preservado).
