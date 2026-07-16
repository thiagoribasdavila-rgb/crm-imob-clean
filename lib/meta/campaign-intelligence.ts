type LeadSignal = { status?: string | null; score?: number | null; metadata?: unknown };

const STAGE_RANK: Record<string, number> = { novo: 0, contato: 1, qualificacao: 2, visita: 3, proposta: 4, contrato: 5, ganho: 6, comprou_outro: 6 };

function metaRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return {} as Record<string, unknown>;
  const meta = (metadata as Record<string, unknown>).meta;
  return meta && typeof meta === "object" ? meta as Record<string, unknown> : {};
}

export function buildMetaCampaignIntelligence(leads: LeadSignal[]) {
  const groups = new Map<string, LeadSignal[]>();
  for (const lead of leads) {
    const campaignId = String(metaRecord(lead.metadata).campaignId || "sem-campanha");
    groups.set(campaignId, [...(groups.get(campaignId) || []), lead]);
  }
  return [...groups.entries()].map(([campaignId, items]) => {
    const total = items.length;
    const atLeast = (rank: number) => items.filter((lead) => (STAGE_RANK[String(lead.status || "novo").toLowerCase()] ?? 0) >= rank).length;
    const contacted = atLeast(1);
    const qualified = items.filter((lead) => atLeastLead(lead, 2) || Number(lead.score || 0) >= 60).length;
    const visits = atLeast(3);
    const proposals = atLeast(4);
    const converted = items.filter((lead) => lead.status === "ganho").length;
    const buyersElsewhere = items.filter((lead) => lead.status === "comprou_outro").length;
    const averageScore = total ? Math.round(items.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / total) : 0;
    const percent = (value: number) => total ? Math.round((value / total) * 100) : 0;
    const sampleStatus = total >= 50 ? "reliable" : total >= 20 ? "learning" : "insufficient";
    const qualityRate = percent(qualified);
    const conversionRate = percent(converted);
    const recommendation = sampleStatus === "insufficient"
      ? "Coletar mais dados antes de alterar público ou orçamento."
      : qualityRate < 20
        ? "Revisar promessa, formulário e aderência entre anúncio e produto."
        : contacted < Math.ceil(total * 0.6)
          ? "Priorizar velocidade e cadência do primeiro atendimento."
          : visits < Math.ceil(qualified * 0.35)
            ? "Testar criativos e abordagem orientados a visita."
            : conversionRate >= 5
              ? "Candidata a escala controlada após validação de custo."
              : "Manter aprendizado e revisar objeções de proposta e fechamento.";
    return { campaignId, total, contacted, qualified, visits, proposals, converted, buyersElsewhere, averageScore, qualityRate, conversionRate, sampleStatus, recommendation };
  }).sort((a, b) => b.qualityRate - a.qualityRate || b.total - a.total);
}

function atLeastLead(lead: LeadSignal, rank: number) {
  return (STAGE_RANK[String(lead.status || "novo").toLowerCase()] ?? 0) >= rank;
}
