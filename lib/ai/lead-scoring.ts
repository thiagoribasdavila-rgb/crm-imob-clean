export function scoreLead(lead: any) {
  let score = 0;

  if (lead.status === "hot") score += 50;
  if (lead.interactions > 3) score += 20;
  if (lead.responseTime < 10) score += 20;
  if (lead.source === "meta_ads") score += 10;

  return Math.min(100, score);
}
