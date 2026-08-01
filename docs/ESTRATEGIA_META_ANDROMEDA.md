# Estratégia Meta × Andromeda — Atlas v3

**Data:** 2026-07-20 · **Status:** fundação construída nesta sessão; ativação completa gated por ações do usuário (§5)

## 1. A tese

O Andromeda (motor de otimização de anúncios da Meta) aprende com o sinal que o anunciante devolve. Quem só recebe lead e não devolve desfecho paga cada vez mais caro por lead cada vez pior. A estratégia do Atlas é fechar o loop completo:

```
Campanha ativa → Lead entra (webhook/backfill) → CRM qualifica ou descarta COM MOTIVO
   → Agregado por campanha → IA dedicada recomenda → Humano decide
   → Sinal volta à Meta (CAPI) → Andromeda otimiza → Lead melhor entra
```

Cada elo existe ou está em construção nesta sessão; nenhum elo depende de tabela inexistente no banco vivo.

## 2. Os elos e seu estado

| Elo | Implementação | Estado |
|---|---|---|
| Entrada de lead | `app/api/webhooks/meta/route.ts` (HMAC, dedupe) + backfill | ✅ Código pronto; token expirado (§5) |
| Qualificação | `score_ia`/temperatura + qualificação conversacional + sinais de atenção (Fase 100) | ✅ Vivo |
| Descarte com motivo Meta | Taxonomia `lib/atlas/discard-reasons.ts` + PATCH pipeline → `lead_events` (tabela viva) + `GET /api/v1/analytics/discard-report` | 🔨 Fundação nesta sessão |
| UI do descarte (Kanban) | Seletor de motivo + seção Descartadas + página do relatório | ⏳ Onda 2 (na fila) |
| Qualidade por campanha | `GET /api/v1/analytics/campaign-quality` + página + contexto na qualificação | ⏳ Onda 3 (na fila) |
| IA dedicada (Conselheiro Andromeda) | `lib/ai/andromeda-pipeline-advisor.ts` + endpoint + painel — só agregados, zero PII, fallback determinístico, aprovação humana sempre | ⏳ Onda 4 (na fila) |
| **Feedback à Meta (CAPI)** | Emissor de eventos de lead status via Conversions API | ⏳ Onda 5 (na fila — ver §3) |

## 3. O elo final — Conversions API (onda 5)

Transformar qualificação/descarte/venda em eventos CAPI que a Meta entende:

- **Mapeamento de eventos:** qualificado → evento de lead qualificado; descartado → disqualified com a categoria da taxonomia; `ganho` → conversão com valor. O vocabulário da taxonomia já nasceu alinhado às categorias Meta exatamente para isso.
- **Identificadores:** e-mail/telefone normalizados e **hasheados SHA-256 no servidor** conforme especificação da Meta — PII nunca sai em claro.
- **Dois modos, nesta ordem:**
  1. **Export/dry-run (imediato):** endpoint gera o lote CAPI pronto para revisão humana — auditável antes de qualquer envio.
  2. **Envio automático (gated):** flag `ATLAS_META_CAPI_ENABLED` (default `false`) + `META_CONVERSIONS_ACCESS_TOKEN` válido — mesmo padrão opt-in do WhatsApp NLU. Sem flag e token, nada é enviado, nunca.

## 4. Princípios de governança (invioláveis, já aplicados nas ondas)

1. **Zero PII em prompt de IA** — o Conselheiro só vê agregados; identificadores para CAPI são hasheados server-side e nunca passam por IA.
2. **IA aconselha, humano executa** — nenhum caminho de código altera campanha na Meta; `humanApprovalRequired: true` em todo shape de recomendação.
3. **Fallback determinístico** — cada capacidade de IA funciona sem chave de IA (regras explicáveis); generativo é upgrade, não dependência.
4. **Amostra mínima** — nenhuma recomendação confiante com amostra insuficiente (`sampleSufficient`, herdado do director-daily).
5. **Sem migration** — tudo sobre tabelas vivas (`leads`, `lead_events`, `marketing_campaigns`, `marketing_spend`); o schema drift não bloqueia esta estratégia.

## 5. Runbook de ativação (ações do usuário, em ordem)

1. **Renovar token Meta** (`META_LEAD_ACCESS_TOKEN` — hoje expirado, erro 190) → religa a entrada de leads.
2. **Gerar token de Conversions API** (`META_CONVERSIONS_ACCESS_TOKEN`) → habilita o export CAPI (envio ainda desligado por flag).
3. **Validar 2 semanas em modo export/dry-run** — revisar os lotes gerados contra os descartes reais.
4. **Ligar `ATLAS_META_CAPI_ENABLED=true`** → loop completo rodando; o Andromeda começa a receber sinal.
5. (Independente) Deploy + migrations destravam os elos não-Meta que dependem do schema completo.

## 6. Métrica de sucesso da estratégia

- Custo por lead **qualificado** (não por lead bruto) caindo por campanha — visível na página de qualidade.
- Participação de descartes por "contato inválido/spam" caindo — sinal de que o Andromeda aprendeu.
- Taxa de qualificação por campanha subindo trimestre a trimestre.
