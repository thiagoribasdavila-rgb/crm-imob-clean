# Entrega 06 — Redesign visual (Pipeline) + proatividade contínua

**Branch:** `claude/atlas-v3-entregas` · **Commits:** `2dd691c1`, `f19bed0f`, `f7e1cc5f`, `06cde2c5` · **Data:** 2026-07-19/20

## Objetivo

Cobrir o trabalho feito após o relatório da Entrega 05, identificado como lacuna de documentação pela auditoria de conclusão: (a) redesign do Pipeline aproximando o visual das referências enviadas pelo usuário (menos ruído, ícones modernos, leitura rápida), e (b) dois avanços de proatividade da IA.

## O que foi implementado

**Redesign do Pipeline** (`2dd691c1`, `f19bed0f`):
- Card do Kanban: avatar com iniciais (reaproveita `.atlas-lead-avatar` já existente), badge de risco só quando ≠ baixo (silêncio também é sinal), 🔥 no nome de lead quente, ações primárias como 4 botões-ícone (👁️ abrir · 📞 ligar · 💬 WhatsApp · ✦ IA) — "ligar" ficou visível na visão compacta (antes só existia dentro do details expandido).
- `AtlasMetric` (componente compartilhado) ganhou prop opcional `icon` — retrocompatível, círculo colorido reaproveitando a paleta de tones existente. Primeiro uso: 6 métricas do topo do Pipeline (📊💰📈🔥⚠️🎯). Qualquer tela pode adotar gradualmente.
- Fila "Comece por aqui": mesma linguagem (avatar, risco condicional, ícone+texto curto nas ações).

**Proatividade contínua** (`f7e1cc5f`, `06cde2c5`):
- 4º sinal proativo: **objeção de venda sem resposta** (`lead_objections.status=OPEN`) — warning em 4h, crítico em 24h. Conecta a feature de objeções (Entrega 05) ao motor de sinais. Corrigido no caminho um union type desatualizado em `leads/[id]/page.tsx` que quebraria a compilação com o novo kind.
- Briefing da manhã (`/api/ai/briefing`) agrega os sinais: abre o dia com "N leads parados no funil" (→ /pipeline) e "N objeções sem resposta" (→ /leads), no mesmo shape `Signal` do consumidor existente — dashboard renderiza sem mudança.

## Arquivos alterados

- `app/(crm)/pipeline/page.tsx`, `app/globals.css`, `components/ui/AtlasCard.tsx` (redesign)
- `lib/atlas/attention-signals.ts`, `app/(crm)/leads/[id]/page.tsx` (4º sinal)
- `app/api/ai/briefing/route.ts` (briefing)

## Banco de dados

Nenhuma migration. `lead_objections` já era viva.

## Testes executados

```
npx tsc --noEmit               → 0 erros (verificado após cada commit)
npx eslint . --max-warnings 0  → 0 erros/warnings
npm run build                  → exit 0 (build de produção completo, rodado na conclusão
                                  com o dev server parado por causa do lock do projeto)
```

## Pendências

Herda as pendências das entregas anteriores (migrations, deploy, bug do governed-real-estate-context com a outra sessão). Nenhuma pendência nova desta entrega.

## Próxima entrega

Conclusão da sessão — ver `RELATORIO_FINAL_SESSAO.md`.
