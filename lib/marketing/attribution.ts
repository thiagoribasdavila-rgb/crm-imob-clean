export type AttributionTouch = {
  campaignId: string;
  channel: string;
  occurredAt: string;
  weight?: number;
};

export type AttributionModel = "first_touch" | "last_touch" | "linear" | "position_based";

export type AttributionResult = {
  campaignId: string;
  channel: string;
  credit: number;
};

export function attributeRevenue(
  touches: AttributionTouch[],
  revenue: number,
  model: AttributionModel = "position_based",
): AttributionResult[] {
  if (!Number.isFinite(revenue) || revenue < 0) throw new Error("Receita inválida.");
  if (touches.length === 0) return [];

  const ordered = [...touches].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const weights = ordered.map((_, index) => {
    if (model === "first_touch") return index === 0 ? 1 : 0;
    if (model === "last_touch") return index === ordered.length - 1 ? 1 : 0;
    if (model === "linear") return 1 / ordered.length;
    if (ordered.length === 1) return 1;
    if (ordered.length === 2) return 0.5;
    if (index === 0 || index === ordered.length - 1) return 0.4;
    return 0.2 / (ordered.length - 2);
  });

  return ordered.map((touch, index) => ({
    campaignId: touch.campaignId,
    channel: touch.channel,
    credit: Number((revenue * weights[index]).toFixed(2)),
  }));
}

export function campaignEfficiency(input: {
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
}) {
  const spend = Math.max(0, Number(input.spend || 0));
  const leads = Math.max(0, Number(input.leads || 0));
  const sales = Math.max(0, Number(input.sales || 0));
  const revenue = Math.max(0, Number(input.revenue || 0));

  return {
    cpl: leads ? spend / leads : 0,
    cac: sales ? spend / sales : 0,
    conversionRate: leads ? (sales / leads) * 100 : 0,
    roas: spend ? revenue / spend : 0,
    roi: spend ? ((revenue - spend) / spend) * 100 : 0,
  };
}
