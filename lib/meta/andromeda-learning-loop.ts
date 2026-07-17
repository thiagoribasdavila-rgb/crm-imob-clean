export type AndromedaEvidence = { eligibleLeads: number; delivered: number; failed: number; duplicateEvents: number; deepEvents: number; leadEvents: number; dualIdentifiers: number; attributedLeads: number; freshnessHours: number | null };
const percent = (value: number, total: number) => total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0;

export function evaluateAndromedaLearning(evidence: AndromedaEvidence) {
  const deliveryRate = percent(evidence.delivered, evidence.delivered + evidence.failed);
  const identityQuality = percent(evidence.dualIdentifiers, evidence.eligibleLeads);
  const feedbackCoverage = percent(evidence.deepEvents, evidence.leadEvents);
  const attributionCoverage = percent(evidence.attributedLeads, evidence.eligibleLeads);
  const duplicateRate = percent(evidence.duplicateEvents, evidence.delivered + evidence.failed + evidence.duplicateEvents);
  const freshnessScore = evidence.freshnessHours === null ? 0 : evidence.freshnessHours <= 24 ? 100 : evidence.freshnessHours <= 48 ? 70 : evidence.freshnessHours <= 72 ? 40 : 0;
  const score = Math.round(deliveryRate * .25 + identityQuality * .15 + feedbackCoverage * .25 + attributionCoverage * .2 + freshnessScore * .15);
  const gates = {
    consentedSample: evidence.eligibleLeads >= 50, deliveryHealthy: deliveryRate >= 95, feedbackDeepEnough: feedbackCoverage >= 35,
    attributionReliable: attributionCoverage >= 80, duplicatesControlled: duplicateRate <= 2, signalFresh: freshnessScore >= 70,
  };
  const blockers = [!gates.consentedSample && "amostra_consentida_menor_que_50", !gates.deliveryHealthy && "entrega_abaixo_de_95", !gates.feedbackDeepEnough && "feedback_profundo_abaixo_de_35", !gates.attributionReliable && "atribuicao_abaixo_de_80", !gates.duplicatesControlled && "duplicidade_acima_de_2", !gates.signalFresh && "sinal_com_mais_de_48h"].filter(Boolean) as string[];
  const recommendations = [
    !gates.deliveryHealthy ? { type: "signal_quality", title: "Corrigir entrega antes de escalar", action: "Revisar falhas e confirmar events_received no dataset de teste." } : null,
    !gates.feedbackDeepEnough ? { type: "funnel_capture", title: "Aprofundar sinais de intenção", action: "Aumentar registro de qualificação, visita, proposta e venda no CRM." } : null,
    !gates.attributionReliable ? { type: "attribution", title: "Completar atribuição canônica", action: "Corrigir campaign, adset, anúncio e formulário sem origem confirmada." } : null,
    blockers.length === 0 ? { type: "audience_experiment", title: "Teste controlado de público", action: "Criar hipótese com uma variável, grupo de controle, orçamento limitado e janela definida." } : null,
  ].filter(Boolean);
  return { score, readiness: blockers.length === 0 ? "ready_for_controlled_test" : score >= 60 ? "learning" : "blocked", metrics: { deliveryRate, identityQuality, feedbackCoverage, attributionCoverage, duplicateRate, freshnessScore }, gates, blockers, recommendations, governance: { aggregatedEvidenceOnly: true, noPii: true, noAutomaticAudienceChange: true, noAutomaticBudgetChange: true, directorDecisionRequired: true } };
}
