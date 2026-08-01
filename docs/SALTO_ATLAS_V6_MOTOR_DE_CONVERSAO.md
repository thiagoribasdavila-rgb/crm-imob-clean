# SALTO ATLAS V6 — Motor de Conversão: a venda como espinha, a IA como CLOSER

> Evolui o V5 (`docs/SALTO_ATLAS_V5.md`). Mapeamento paralelo do subsistema de conversão.

## 1. Tese: a conversão é a métrica-mãe
O V5 mede **tempo do sinal à ação** — necessário, mas insuficiente: velocidade sem desfecho é atividade, não resultado. O V6 sobe a north-star: **a taxa de conversão lead→`ganho` é a métrica-mãe**; velocidade e CAC são derivados. O sistema já sabe o que é venda (`leads.status === "ganho"`, `campaign-quality.ts:168`), mas trata venda como *contagem sem valor e sem decomposição*. Faltam os 3 eixos que transformam "quantas" em "por quê":
- **Taxa por estágio** — `PIPELINE_STAGE_KEYS` (`pipeline-stages.ts`) tem `probability` teórica; falta a taxa *observada* por aresta (`novo→contato`, `proposta→contrato`), reconstruível de `pipeline_history(old_status,new_status)`. Localiza o gargalo real.
- **Taxa por origem** — `buildCampaignQuality` já agrega `sales/leads` por `campaign_id`; falta por corretor (`assigned_to` **não é agregado hoje**) e por empreendimento.
- **Taxa por corretor** — só existe na heurística inline de `broker-daily/route.ts`, não no modelo canônico.

Some **velocidade por estágio** (mediana de dias em `pipeline_history`) e **CAC-por-venda** (`spend/sales` — hoje inexistente; só há `costPerLead`/`costPerQualifiedLead`). São as 4 peças do painel (§6).

## 2. A IA proativa 2.0 — de "avisa" para "conduz e fecha"
Os 4 `AttentionSignal` de `attention-signals.ts` são **retardados** (disparam *depois* do estouro). Um CLOSER age antes. 5 comportamentos novos, herdando `commercial-orchestrator.ts` (`externalActionAllowed:false`) e passando pela Caixa de Aprovações:
- **Prever esfriamento ANTES do sinal.** `predictConversionDetailed` dá score pontual; o V6 calcula **trajetória** (derivada de `score_ia`/engajamento em `conversion_feature_snapshots`) e emite `cooling_risk` quando a *inclinação* vira negativa — antes de qualquer limiar estourar. Preditivo, não retardado.
- **Cadência governada.** `buildActionProposal` reagenda **um** follow-up; o V6 propõe uma **sequência multi-toque** (D+0, D+2, D+5) como *uma* proposta, aprovada uma vez, executada em passos via V4.1. Aprovação de cadência, não de cada mensagem.
- **Tratamento de objeção.** `send_message` existe no tipo de ação mas **nunca é emitido**; o V6 gera **rascunho de resposta** à objeção (`lead_objections status=OPEN`) — `draft_only`, `humanReviewRequired`, `cc8-draft` tracejado — pro corretor editar e enviar.
- **Loss prevention.** Compõe "deal em risco" = `cooling_risk` + estágio avançado (`proposta`/`visita`) + ticket alto → escala via `reassign_lead` + tarefa ALTA à liderança (hoje reassign só age sem dono).
- **Coaching do corretor.** Cruzando taxa por-corretor × mediana do time, o Nightly entrega no `morningHandoff` um coaching pontual ("você perde 40% em `proposta→contrato` vs. 22% do time").

**Quem propõe/aprova:** todo agente **propõe**; humano é CEO. Ação de cliente → aprovação do corretor dono; escalonamento → `approverScope:"leadership"`. **Nada toca cliente sem aprovação.**

## 3. Priorização por valor esperado (score × ticket)
`broker-daily` ordena por `priorityScore` inline, **sem ticket**. O V6 reordena a carteira por **valor esperado = probability × ticket** (`probability` de `predictConversionDetailed` — a ponte `toConversionSignals` em `scoring-engine.ts` precisa parar de jogar `budgetFit`/`propertyMatchScore` em `missingSignals`; `ticket` do empreendimento). O corretor abre o dia com a fila ordenada por **reais esperados de fechar hoje**, e `nextBestAction` vira a proposta do §2.

## 4. O loop fechado campanha → lead → VENDA → campanha
O loop **fecha arquiteturalmente** (`funnel-learning.ts` → `queueMetaStageConversion` → `ganho→ConvertedLead`) mas está **bloqueado fora de teste** (`outbox/process/route.ts:173` lança erro se `mode !== "test"`). Três destravamentos, gated pela Caixa/kill-switch:
- **CAPI de desfecho real** — write-adapter Meta (`ConvertedLead` com `custom_data.campaign_id`) em produção, com kill-switch.
- **CAC-por-venda por empreendimento** — `spend/sales` por `developer_id` — o número que hoje não existe e sem o qual o **loop de ROI não fecha**.
- **Realimentar o Criador (V4.7)** — recebe "qual criativo trouxe **contratos ao menor CAC**", não "qual trouxe leads", e auto-propõe a próxima campanha. Marketing que aprende até a VENDA.

## 5. Como reorienta as ondas do V5
Quando a meta é **venda, não captura**:
- **Governança (Onda 4) SOBE** — a Caixa vira pré-requisito das ações-de-cliente do §2, **antes** do Hub de Marketing.
- **Nova Onda "Motor de Conversão"** entre 1 e 2 — taxas por estágio/origem/corretor + CAC-por-venda + fila por valor esperado. Fundação de dados de tudo.
- **Marketing (Onda 3) só entrega com o §4** — o destravamento do `outbox/process` entra na Onda 3, não nas elevações adiadas.
- Telas 1/2 permanecem; o 360 (`leads/[id]`) ganha a linha do tempo de cadência e o painel de objeções.

## 6. Painel de conversão + north-star
**North-star V6:** **taxa lead→`ganho` por coorte de origem**, com **CAC-por-venda** como restrição.

| Métrica | Fonte |
|---|---|
| Taxa por estágio (funil observado) | `pipeline_history` |
| Velocidade (mediana dias/estágio) | timestamps de `pipeline_history` |
| Taxa por corretor | `assigned_to` × `ganho` |
| CAC-por-venda / empreendimento | `spend/sales` × `developer_id` |
| Valor esperado da fila | `probability × ticket` |
| Deals em risco salvos | `cooling_risk` resolvidos |

## 7. Guardrails e riscos honestos
**Guardrails:** nada toca cliente sem aprovação (toda mensagem/cadência `draft_only`/`humanReviewRequired`, na Caixa, `externalActionAllowed:false`); kill-switch desliga qualquer agente sem redeploy; zero PII em URL.
**Riscos:** (a) preditor de esfriamento pode **inventar risco** — `requiresHumanReview:true` protege, mas sem re-treino o modelo estagna; (b) cadência automática arrisca **spam** se a aprovação for cheque em branco — teto de toques + opt-out; (c) CAC-por-venda depende de spend confiável e atribuição via `campaign_id` (`outbox/process:153`) — atribuição furada envenena o loop; (d) reordenar por ticket pode **enviesar** contra leads de baixo ticket legítimos — manter piso de cobertura.

Âncoras: `lib/ai/conversion-predictor.ts`, `lib/atlas/attention-signals.ts`, `lib/ai/action-proposals.ts`, `lib/atlas/funnel-learning.ts`, `app/api/v2/outbox/process/route.ts`, `app/api/v1/analytics/broker-daily/route.ts`, `lib/atlas/pipeline-stages.ts`, `lib/atlas/campaign-quality-data.ts`.
