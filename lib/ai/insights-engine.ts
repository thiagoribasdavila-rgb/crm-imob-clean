type Lead = {
  status: "cold" | "warm" | "hot";
  interactions: number;
  source: string;
  responseTime: number;
  value: number;
};

export function runInsights(leads: Lead[]) {
  const insights: string[] = [];

  const hot = leads.filter(l => l.status === "hot").length;
  const cold = leads.filter(l => l.status === "cold").length;

  const avgResponse =
    leads.reduce((acc, l) => acc + l.responseTime, 0) / leads.length;

  if (hot > cold) {
    insights.push("🔥 Pipeline saudável: mais leads quentes que frios");
  } else {
    insights.push("⚠ Pipeline frio: acelerar nutrição de leads");
  }

  if (avgResponse > 60) {
    insights.push("🚨 Tempo de resposta alto — risco de perda de vendas");
  }

  if (leads.length > 50) {
    insights.push("📈 Alta demanda — priorizar automação de atendimento");
  }

  return insights;
}
