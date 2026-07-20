# SALTO ATLAS V4 — De "sistema que informa" para "operação que executa e aprende"

**Data:** 2026-07-20 · **Estado de partida:** CC-6 completo em todas as superfícies, Meta 10/10 no código, cadeia 66 validada (não aplicada), 17.151 leads históricos, sistema ainda não online.

## A tese do salto

Hoje o Atlas é o melhor **cockpit** possível: mostra a prioridade, explica o sinal, sugere a ação. O corretor ainda faz 100% do trabalho de execução, e o sistema não fica mais inteligente com o resultado.

**A revolução é fechar dois loops:**
1. **Loop de execução** — a IA deixa de apontar e passa a *preparar a ação pronta* (mensagem redigida, reagendamento montado, redistribuição proposta); o humano **aprova em 1 clique**. De 10 decisões/hora para 60.
2. **Loop de aprendizado** — cada resultado (venda, descarte, resposta) alimenta o score calibrado e volta para a Meta via CAPI. O sistema que hoje é estático passa a **melhorar sozinho, com gates de release e monitor de drift**.

Descoberta que viabiliza tudo: **~80% da fundação já está desenhada e validada** — as tabelas de execução (`lead_copilots`, `messages`, `message_templates`, `messaging_suppressions`, `approval_requests`, `ai_sales_journeys`) estão NA cadeia 66; o pipeline de aprendizado (phases 76-80: dataset supervisionado → calibração → explicabilidade → drift → release gate) está na cauda; `lib/ai` já tem `commercial-orchestrator`, `conversion-predictor`, `conversational-qualification`, `governed-nightly-copilot`, `instruction-output-guard`. **O salto é ativação + orquestração + a camada de aprovação em 1 clique** — não é um rewrite.

## Guardrails inegociáveis (herdados e ampliados)

- **Aprovação humana SEMPRE** para qualquer ação que toque cliente ou dado (`humanApprovalRequired: true` vira contrato de UI, não flag).
- **Zero PII em prompt** (padrão auditado da sessão continua lei).
- **Flags off por padrão** + kill-switch por organização.
- **Auditoria por ação**: toda execução aprovada grava quem/quando/o-quê/por-quê.
- **Opt-out imediato e supressões** antes de qualquer mensagem (infra já na cadeia).
- **Release gate para o modelo**: score calibrado só entra em produção passando o gate (phase 80) e sai sozinho se o drift (phase 79) estourar.

---

## FASE 0 — O substrato (pré-requisito, ~3h, mão do dono)

Sem isso não há salto: **backup → cadeia 66 no oficial → 5 usuários por link → deploy VPS → painéis Supabase/Meta**. Tudo já validado e documentado (`docs/deploy/`). O salto começa no dia em que alguém loga.

---

## PILAR 1 — Copiloto que EXECUTA (Caixa de Aprovações)

*A mudança de categoria: de dashboard para copiloto operacional.*

**Experiência:** no cockpit, cada sinal proativo ganha um botão "Preparar ação" → a IA monta a ação **concreta e revisável** (mensagem WhatsApp/e-mail redigida no template aprovado, tarefa reagendada com motivo, proposta de redistribuição com a cascata explicada) → entra na **Caixa de Aprovações** (a página `/approvals` redesenhada vira o centro nervoso) → 1 clique aprova, edita ou rejeita → execução auditada.

**O que já existe:** `approval_requests` + `lead_copilots` + `messages`/templates/supressões (cadeia 66) · `instruction-output-guard` e `commercial-orchestrator` (lib) · outbox/worker de envio (pronto) · dock global do copiloto.
**O que é novo:** o motor "sinal → ação preparada" (proposals engine), a Caixa de Aprovações como fila de decisão em lote, e o contrato de auditoria por execução.
**Entregáveis verificáveis:** N sinais com ação preparável · aprovação em lote com teclas · 100% das execuções com trilha · zero envio sem aprovação (teste adversarial).

## PILAR 2 — Aprendizado com os 17.151 (Score que melhora sozinho)

*O ativo que ninguém está usando: a base histórica.*

**Sequência:** (1) **Módulo de importação CSV/XLSX** — a pendência antiga — com mapeamento de campos, validação, dedup contra a base e relatório de qualidade ANTES da carga; (2) rotular desfechos históricos (venda/perda/descarte) no `conversion_dataset` (phase 76); (3) **calibrar** o score (phase 77) com explicabilidade (78); (4) ligar **drift monitor** (79) e **release gate** (80); (5) fechar o loop externo: CAPI devolve QualifiedLead/ConvertedLead/Disqualified para a Meta otimizar a aquisição (código pronto, flag-gated).

**O que já existe:** as 5 phases do pipeline de ML governado (na cauda) · `conversion-predictor` (lib) · CAPI feedback completo (flag off).
**O que é novo:** o importador (parser/validador/preview/carga), o job de rotulagem histórica, e o painel "Saúde do modelo" ligado no cockpit do diretor.
**Entregáveis verificáveis:** base histórica importada com relatório de qualidade · score calibrado passando o gate · drift report semanal · primeira campanha Meta otimizada por sinal do CRM.

## PILAR 3 — WhatsApp vivo (o canal onde a venda acontece)

**Experiência:** conversas dentro do Lead 360 e da página Conversas — recebimento via webhook (rota pronta), envio só por template aprovado + janela de 24h, opt-out imediato (supressões na cadeia), NLU flag-gated lendo intenção/temperatura e alimentando os sinais do cockpit (`whatsapp_message_insights`, worker já processa).

**O que já existe:** webhook WhatsApp · worker de envio com templates/supressões/aprovação de lote · NLU (`whatsapp-conversation-intelligence`) flag-gated · tabelas na cadeia.
**O que é novo:** a UI de conversa no Lead 360 (thread de leitura CC-6), composer com templates, e a ponte conversa→sinal→Pilar 1 (resposta preparada pela IA para aprovação).
**Dependência externa:** número WABA + tokens (painel Meta — mão do dono).

## PILAR 4 — Prova diária (o ritual que consolida)

**Experiência:** o corretor abre o dia com o **plano pronto** (nightly copilot governado — phase 90, `ai_sales_journeys` na cadeia): 5 prioridades com ação preparada (Pilar 1), agenda e riscos. O diretor recebe o **executivo diário** (phases 96+): funil, marketing, equipe, decisões pendentes — no cockpit e por e-mail.

**O que já existe:** `governed-nightly-copilot` (lib) · phases 90/96-99 (pós-cadeia — segunda leva de migrations) · cron do go-live.
**O que é novo:** ligar o nightly ao cockpit (o "Prioridades agora" amanhece pré-montado) e o digest executivo.

---

## Sequência proposta (ondas de ~1 sessão cada, padrão da casa: verificação adversarial + commit + push)

| Onda | Entrega | Depende de |
|---|---|---|
| **0** | Lançamento (cadeia 66 + usuários + deploy) | dono (~3h) |
| **V4.1** | Pilar 1 núcleo: proposals engine + Caixa de Aprovações + auditoria | Fase 0 |
| **V4.2** | Pilar 2a: importador CSV/XLSX + carga histórica com relatório | Fase 0 |
| **V4.3** | Pilar 2b: dataset→calibração→gate→drift + painel saúde do modelo | V4.2 |
| **V4.4** | Pilar 3: WhatsApp vivo no Lead 360 + ponte para aprovações | Fase 0 + WABA |
| **V4.5** | Pilar 4: nightly no cockpit + executivo diário | V4.1 |
| **V4.6** | Loop externo: CAPI ligado (flag on em teste) + medição de qualidade de público | V4.3 |

## Métricas de sucesso do salto
- **Tempo sinal→ação executada**: de minutos/nunca para <30s (aprovação em 1 clique).
- **% de leads quentes contatados em <1h** (hoje invisível; meta >80%).
- **Score calibrado**: Brier/curva de calibração melhor que o score estático, provado no gate.
- **CPL qualificado** (não CPL bruto) caindo após o loop CAPI.
- **Adoção do ritual**: corretores abrindo o plano diário >4×/semana.

## Riscos honestos
- Fase 0 é gargalo absoluto — nada do salto roda sem o banco aplicado e o sistema online.
- Phases 90-99 (nightly/executivo) são a SEGUNDA leva de migrations (pós-cadeia-66) — mesma esteira de validação isolada antes de aplicar.
- WhatsApp depende de aprovação de templates pela Meta (dias, não horas).
- Custo de IA generativa passa a ser recorrente (mensagens preparadas) — mitigado por fallback determinístico e cache, padrão já existente.
