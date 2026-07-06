export function predictConversion(lead: any) {
  const score =
    (lead.interactions * 10) +
    (lead.status === "hot" ? 40 : 10) +
    (lead.responseTime < 5 ? 30 : 0);

  if (score > 80) return "🔥 Muito Alta";
  if (score > 50) return "⚡ Média";
  return "❄ Baixa";
}
