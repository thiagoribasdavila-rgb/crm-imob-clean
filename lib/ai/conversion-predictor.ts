export type ConversionSignals = {
  status?: string | null;
  stage?: string | null;
  interactions?: number | null;
  responseTime?: number | null;
  score?: number | null;
  daysSinceLastInteraction?: number | null;
  nextActionOverdue?: boolean | null;
  essentialAnswers?: number | null;
  budgetFit?: number | null;
  propertyMatchScore?: number | null;
  localMarketVelocity?: number | null;
  localProductDemand?: number | null;
  localResaleMomentum?: number | null;
  localPriceBandFit?: number | null;
  optedOut?: boolean | null;
  invalidPhone?: boolean | null;
};

export type ConversionPrediction = {
  probability: number;
  band: "muito-baixa" | "baixa" | "media" | "alta" | "muito-alta";
  confidence: number;
  positiveFactors: string[];
  riskFactors: string[];
  missingSignals: string[];
  modelVersion: "atlas-predictive-v2";
  requiresHumanReview: true;
  caveat: string;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function predictConversionDetailed(lead: ConversionSignals): ConversionPrediction {
  let logit = -1.8;
  const positiveFactors: string[] = [];
  const riskFactors: string[] = [];
  const missingSignals: string[] = [];
  const stage = String(lead.stage || lead.status || "").toLowerCase();
  const stageWeight: Record<string, number> = { novo: 0, contato: 0.25, qualificacao: 0.65, visita: 1.05, proposta: 1.45, contrato: 2.1 };
  logit += stageWeight[stage] ?? 0;
  if (stageWeight[stage]) positiveFactors.push(`avanço no funil: ${stage}`);

  if (finite(lead.score)) {
    logit += clamp((lead.score - 50) / 50, -1, 1) * 1.15;
    (lead.score >= 70 ? positiveFactors : lead.score < 35 ? riskFactors : []).push(`score comercial ${lead.score}/100`);
  } else missingSignals.push("score comercial");

  const responseMinutes = finite(lead.responseTime) ? lead.responseTime : null;
  if (responseMinutes !== null) {
    if (responseMinutes <= 5) { logit += 0.55; positiveFactors.push("primeira resposta rápida"); }
    else if (responseMinutes > 60) { logit -= 0.65; riskFactors.push("primeira resposta acima de 60 minutos"); }
  } else missingSignals.push("tempo da primeira resposta");

  if (finite(lead.daysSinceLastInteraction)) {
    if (lead.daysSinceLastInteraction <= 1) { logit += 0.45; positiveFactors.push("interação recente"); }
    else if (lead.daysSinceLastInteraction > 7) { logit -= 0.75; riskFactors.push("mais de sete dias sem interação"); }
  } else missingSignals.push("recência da interação");

  if (finite(lead.interactions)) {
    logit += Math.min(0.65, Math.log1p(Math.max(0, lead.interactions)) * 0.2);
    if (lead.interactions >= 3) positiveFactors.push("histórico consistente de interações");
  } else missingSignals.push("quantidade de interações");

  if (lead.nextActionOverdue === true) { logit -= 0.55; riskFactors.push("próxima ação atrasada"); }
  if (finite(lead.essentialAnswers)) {
    logit += clamp(lead.essentialAnswers, 0, 3) * 0.18;
    if (lead.essentialAnswers >= 3) positiveFactors.push("qualificação essencial completa");
  } else missingSignals.push("respostas essenciais");
  if (finite(lead.budgetFit)) {
    logit += clamp((lead.budgetFit - 50) / 50, -1, 1) * 0.6;
    (lead.budgetFit >= 70 ? positiveFactors : lead.budgetFit < 40 ? riskFactors : []).push("aderência financeira ao produto");
  } else missingSignals.push("aderência financeira");
  if (finite(lead.propertyMatchScore)) {
    logit += clamp((lead.propertyMatchScore - 50) / 50, -1, 1) * 0.45;
    if (lead.propertyMatchScore >= 70) positiveFactors.push("imóvel com boa aderência");
  } else missingSignals.push("matching de imóvel");
  if (finite(lead.localMarketVelocity)) {
    logit += clamp((lead.localMarketVelocity - 50) / 50, -1, 1) * 0.22;
    if (lead.localMarketVelocity >= 70) positiveFactors.push("velocidade favorável no recorte local comparável");
  }
  if (finite(lead.localProductDemand)) {
    logit += clamp((lead.localProductDemand - 50) / 50, -1, 1) * 0.28;
    if (lead.localProductDemand >= 70) positiveFactors.push("demanda local favorável para a tipologia");
  }
  if (finite(lead.localResaleMomentum)) {
    logit += clamp((lead.localResaleMomentum - 50) / 50, -1, 1) * 0.14;
    if (lead.localResaleMomentum >= 70) positiveFactors.push("mercado de usados aquecido no recorte CRECI-SP comparável");
  }
  if (finite(lead.localPriceBandFit)) {
    logit += clamp((lead.localPriceBandFit - 50) / 50, -1, 1) * 0.18;
    if (lead.localPriceBandFit >= 70) positiveFactors.push("faixa de preço aderente à demanda regional comparável");
  }

  if (lead.optedOut) { logit = -5; riskFactors.push("cliente optou por não receber contato"); }
  if (lead.invalidPhone) { logit -= 1.2; riskFactors.push("telefone inválido ou suprimido"); }

  const probability = Math.round(clamp(100 / (1 + Math.exp(-logit)), 1, 95));
  const observed = 8 - missingSignals.length;
  const confidence = Math.round(clamp(42 + observed * 5.2, 42, 84));
  const band = probability >= 75 ? "muito-alta" : probability >= 58 ? "alta" : probability >= 38 ? "media" : probability >= 20 ? "baixa" : "muito-baixa";
  return { probability, band, confidence, positiveFactors, riskFactors, missingSignals, modelVersion: "atlas-predictive-v2", requiresHumanReview: true, caveat: "Estimativa explicável para priorização; não garante compra, crédito, receita ou prazo. Recalibre com resultados locais ganhos e perdidos." };
}

export function predictConversion(lead: ConversionSignals) {
  const prediction = predictConversionDetailed(lead);
  if (prediction.band === "muito-alta" || prediction.band === "alta") return "🔥 Alta";
  if (prediction.band === "media") return "⚡ Média";
  return "❄ Baixa";
}
