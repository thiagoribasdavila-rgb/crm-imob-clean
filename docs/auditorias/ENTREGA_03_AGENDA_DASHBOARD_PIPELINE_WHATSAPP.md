# Entrega 03 — Agenda, Dashboard, Pipeline, WhatsApp (correções seguras)

**Branch:** `claude/atlas-v3-entregas` · **Commits:** `f042fe24`, `fc81f0e9`, `92290895`, `84ad2fef` · **Data:** 2026-07-19

## Objetivo

Corrigir 4 problemas concretos identificados na Entrega 01, sem tocar em banco, RBAC estrutural ou credenciais externas.

## O que foi encontrado e corrigido

1. **Agenda** (`app/api/v1/calendar/route.ts`): `visitRows` era hardcoded `[]` mesmo com a tabela `lead_visits` existindo e sendo usada de verdade em outra rota do mesmo app. Corrigido para consultar de verdade, com fallback gracioso específico para tabela ausente (`isMissingRelation()`, padrão já estabelecido em `crm/external-sales/route.ts`) — não um catch genérico.
2. **WhatsApp**: 3 arquivos de scaffolding decorativo removidos (`WhatsAppEngine.ts` vazio, `WhatsAppAgent.ts` com resposta hardcoded, página órfã `/automation/whatsapp-agent`). O pipeline real (webhook + outbox worker + NLU opcional) não foi tocado.
3. **Dashboard**: 9 páginas com dado 100% fabricado (`VGV R$250M`, ranking de corretor inventado, "18 leads online agora") apresentado como se fosse real a qualquer usuário logado via URL direta. Substituídas pelo mesmo padrão de redirect do índice — levam para `/reports` (dashboard real).
4. **Pipeline**: 18 arquivos de código morto confirmados e removidos (`domain/lead/*` inteiro + `lib/services/leads.services.ts`) — único consumidor era uma cadeia de páginas órfãs.

## Arquivos alterados

Ver cada commit individualmente (`f042fe24`, `fc81f0e9`, `92290895`, `84ad2fef`) — 32 arquivos no total, listados nas mensagens de commit.

## Pendência desta entrega

**6 páginas órfãs não removidas ainda:** `app/(crm)/pipeline/hot|warm|cold|[stage]/page.tsx`, `app/(crm)/pipedrive/page.tsx`, `app/(crm)/leads/table/page.tsx`. O diagnóstico as classificou como seguras para remover (mesmo veredito do `domain/lead/*`), mas o agente de correção detectou instabilidade concorrente na árvore de trabalho durante a verificação (esta mesma sessão commitando a Entrega 2 em paralelo) e preferiu não apagar sob incerteza. Árvore está estável agora — próximo passo natural.

## Banco de dados

Nenhuma migration criada ou aplicada.

## Testes executados

```
npx tsc --noEmit (repo inteiro)      → 0 erros
npx eslint . --max-warnings 0        → 0 erros/warnings
npm run build                        → completo, sem erro (rodado pelo workflow, 2x)
```

## Auto-auditoria (Regra 7)

- Verificação adversarial encontrou 1 lacuna real na auditoria original: `application/lead/LeadApplicationService.ts` importa de `@/domain/lead` (import agora quebrado) — mas é ele mesmo código morto, fora do `tsconfig`/`eslint`, não afeta build. Documentado, não bloqueante.
- Confirmado explicitamente: RBAC (`lib/auth/permissions.ts`, `lib/api/authorization.ts`), migrations, e os 4 arquivos do usuário em edição (`.gitignore`, `distribution/route.ts`, `package.json`, `package-lock.json`) **não foram tocados**.

## Riscos

- **Baixo:** as 6 páginas órfãs pendentes não têm link de navegação — zero risco de exposição a usuário, só limpeza adiada.
- **Observação operacional:** múltiplas sessões editando o mesmo working tree ao mesmo tempo (esta sessão + pelo menos um outro processo, possivelmente o workstream "meta-intelligence" não commitado) — cuidado redobrado com `git add -A` enquanto isso persistir.

## Próxima entrega

Finalizar a remoção das 6 páginas órfãs do Pipeline + decidir o destino dos ~25 arquivos órfãos do Customer360 (Entrega 02) + varredura sistemática pelo mesmo padrão de bug de renderização (`payload.error` bruto em JSX) encontrado na Entrega 02, em todo o app.
