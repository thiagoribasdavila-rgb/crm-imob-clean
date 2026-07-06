export function generateInsights(data: any) {
  const insights = [];

  if (data.conversion < 20) {
    insights.push("⚠ Conversão baixa — revisar atendimento");
  }

  if (data.cac > 500) {
    insights.push("⚠ CAC alto — otimizar Meta Ads");
  }

  if (data.hotLeads > 50) {
    insights.push("🔥 Alta demanda ativa — priorizar equipe");
  }

  return insights;
}
