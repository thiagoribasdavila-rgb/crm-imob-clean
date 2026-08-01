// Desempenho POR ANÚNCIO — helper puro (sem I/O).
//
// Fecha o ciclo que faltava: lead_attribution_touches guarda ad_external_id
// (gravado pelo gatilho da Fase 74 a partir de metadata.meta.adId) e só era
// lido no detalhe de UM lead por vez. Nenhuma agregação por anúncio existia,
// então ninguém conseguia responder a pergunta que decide verba: "qual anúncio
// virou VENDA". Aqui os toques são cruzados com leads.status para contar
// lead → qualificado → ganho por anúncio.
//
// MODELO DE ATRIBUIÇÃO — primeiro toque com anúncio identificado:
// cada lead é creditado a EXATAMENTE UM anúncio (o do seu toque mais antigo com
// ad_external_id). É a mesma política de first_touch imutável da Fase 74, e é o
// que mantém as contagens somáveis: com crédito multi-toque, a soma das vendas
// por anúncio passaria do total de vendas e o rateio de gasto passaria de 100%.
//
// GASTO — o que é medido e o que é rateio: marketing_spend é por CAMPANHA
// (marketing_spend.campaign_id → marketing_campaigns). Não existe gasto por
// anúncio em tabela viva alguma. Então o gasto da campanha é medido e o valor
// por anúncio é RATEIO — publicado com prefixo "estimated" e com spendBasis
// explicando o método, para nunca ser lido como medição.
//
// DENOMINADOR DO RATEIO — TODOS os leads da campanha, não só os atribuídos.
// Rateando apenas entre os anúncios identificados, as participações somariam
// 100% por construção e a verba INTEIRA seria empurrada para os poucos anúncios
// com id: com metade dos leads da campanha sem toque de anúncio (o caso normal
// — o gatilho só extrai adId de metadata.meta, então lead de portal, WhatsApp,
// importação ou ingestão anterior fica de fora), o CPL estimado sairia com o
// DOBRO do valor. Com o denominador completo as participações somam MENOS de 1
// e a sobra fica explicitamente não alocada, que é o fato.
//
// COBERTURA — quando menos de 80% dos leads da campanha têm anúncio
// identificado, custo por lead/venda do anúncio NÃO é publicado: o rateio
// existe, mas a base dele é frágil demais para decidir verba. A linha diz a
// cobertura medida em vez de entregar um número que parece preciso.
//
// GATE DE AMOSTRA: contagens são fato observado e aparecem sempre. Taxas e
// custos derivados só existem com amostra suficiente (mesmo corte de 30 leads
// do director-daily / campaign-quality). Sem lastro o campo vem null e
// `explanation` diz por quê — número nenhum é inventado para preencher tela.

import {
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  isCommerciallyQualifiedLead,
  isQualifiedLead,
} from "@/lib/atlas/campaign-quality";

export const AD_PERFORMANCE_MINIMUM_LEADS = CAMPAIGN_QUALITY_MINIMUM_LEADS;

/** Cobertura mínima de atribuição por anúncio para publicar custo da linha. */
export const AD_PERFORMANCE_MINIMUM_AD_COVERAGE = 0.8;

export const AD_PERFORMANCE_POLICY = {
  attributionModel:
    "primeiro toque com anúncio identificado — cada lead credita exatamente um ad_external_id",
  spendBasis:
    "marketing_spend é por campanha (e recortado pela janela); o valor por anúncio é rateio pela participação do anúncio em TODOS os leads da campanha na janela — a parcela dos leads sem anúncio identificado fica SEM alocação, e por isso as participações somam menos de 100%. Nunca é gasto medido do anúncio",
  coverageGate:
    `custo por lead/venda do anúncio só é publicado quando ao menos ${Math.round(AD_PERFORMANCE_MINIMUM_AD_COVERAGE * 100)}% dos leads da campanha têm anúncio identificado; abaixo disso a linha diz a cobertura medida em vez do número`,
  sampleGate:
    `taxas e custos só são publicados com ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads ou mais no anúncio; abaixo disso vêm null com explicação`,
  salesTruth: "venda = leads.status 'ganho' (o CRM é a verdade da conversão)",
  readOnly: true,
} as const;

// Origens que NUNCA teriam anúncio: contar esses leads como "falha de
// atribuição" faria uma imobiliária onde a Meta é fração da entrada parecer 90%
// desatribuída. O que mede falha de verdade é lead de mídia paga sem anúncio.
const PAID_MEDIA_SOURCE_HINTS = ["meta", "facebook", "instagram", "lead ads", "google", "ads"];

export type AdPerformanceTouch = {
  lead_id: string | null;
  ad_external_id: string | null;
  adset_external_id: string | null;
  campaign_external_id: string | null;
  occurred_at: string | null;
};

export type AdPerformanceLead = {
  id: string;
  campaign_id: string | null;
  status: string | null;
  score_ia: number | string | null;
  temperature: string | null;
  source: string | null; // separa "não veio de anúncio" de "veio e não atribuiu"
};

export type AdPerformanceCampaign = {
  id: string;
  name: string | null;
  external_campaign_id: string | null;
};

export type AdPerformanceSpendRow = {
  campaign_id: string | null;
  amount: number | string | null;
};

export type AdPerformanceRow = {
  adExternalId: string;
  adsetExternalId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignExternalId: string | null;
  leads: number;
  qualifiedLeads: number; // qualificação DE CADASTRO (proxy) — mesmo corte do campaign-quality
  commercialQualifiedLeads: number; // etapa canônica >= visita (evidência de funil)
  sales: number; // leads.status 'ganho'
  conversionRate: number | null; // % com 1 decimal — null sem amostra
  campaignSpendInWindow: number | null; // MEDIDO, da campanha, DENTRO da janela (null sem marketing_spend)
  campaignLeadsTotal: number; // TODOS os leads da campanha na janela (denominador do rateio)
  campaignLeadsWithAd: number; // leads da campanha com anúncio identificado
  campaignLeadsWithoutAd: number; // a parcela que fica sem alocação de gasto
  campaignAdCoveragePct: number | null; // % com 1 decimal — null sem campanha resolvida
  leadShareOfCampaign: number | null; // participação do anúncio em TODOS os leads da campanha
  estimatedSpend: number | null; // RATEIO — ver AD_PERFORMANCE_POLICY.spendBasis
  estimatedCostPerLead: number | null;
  estimatedCostPerSale: number | null;
  sampleSufficient: boolean;
  explanation: string | null; // por que os derivados vieram null
};

export type AdPerformanceTotals = {
  ads: number;
  adsWithSales: number;
  leadsInWindow: number; // leads da janela, com ou sem anúncio
  leadsAttributedToAds: number;
  // Os três campos abaixo separam o que o número antigo misturava. "Sem
  // anúncio" no total da janela inclui portal, WhatsApp e cadastro manual, que
  // jamais teriam ad_external_id: lido como cobertura, induziria a conclusão de
  // que a atribuição está furada quando é só a origem do lead.
  leadsFromNonAdSources: number; // origem que nunca teria anúncio
  leadsFromAdSourcesWithoutAttribution: number; // ESTE mede falha de atribuição
  leadsWithoutAd: number; // soma dos dois acima (compatibilidade)
  sales: number; // vendas atribuídas a algum anúncio
  campaignSpendMatched: number; // gasto (na janela) das campanhas com anúncio atribuído
};

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const toNumber = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : null);
const pct = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
const money = (value: number) => Math.round(value * 100) / 100;

type Bucket = {
  adExternalId: string;
  adsetExternalId: string | null;
  campaignExternalId: string | null;
  campaignVotes: Map<string, number>; // campanha uuid → leads (Meta garante 1:1, empate é dado inconsistente)
  leads: number;
  qualified: number;
  commercialQualified: number;
  sales: number;
};

/**
 * Escolhe o toque mais antigo COM anúncio de cada lead. Empate de occurred_at
 * resolve pela ordem recebida (a rota lê ordenada por occurred_at,id), para o
 * mesmo conjunto de dados produzir sempre o mesmo resultado.
 */
function firstAdTouchByLead(touches: AdPerformanceTouch[]) {
  const first = new Map<string, AdPerformanceTouch>();
  for (const touch of touches) {
    const leadId = text(touch.lead_id);
    const adId = text(touch.ad_external_id);
    if (!leadId || !adId) continue;
    const current = first.get(leadId);
    if (!current) {
      first.set(leadId, touch);
      continue;
    }
    if (text(touch.occurred_at) < text(current.occurred_at)) first.set(leadId, touch);
  }
  return first;
}

export function buildAdPerformance(input: {
  touches: AdPerformanceTouch[];
  leads: AdPerformanceLead[];
  campaigns: AdPerformanceCampaign[];
  spendRows: AdPerformanceSpendRow[];
}): { ranking: AdPerformanceRow[]; totals: AdPerformanceTotals } {
  const campaignById = new Map(input.campaigns.map((campaign) => [text(campaign.id), campaign]));
  const campaignByExternalId = new Map(
    input.campaigns
      .filter((campaign) => text(campaign.external_campaign_id))
      .map((campaign) => [text(campaign.external_campaign_id), campaign]),
  );
  const leadById = new Map(input.leads.map((lead) => [text(lead.id), lead]));

  const buckets = new Map<string, Bucket>();
  let leadsAttributed = 0;
  let salesAttributed = 0;

  const firstTouchByLead = firstAdTouchByLead(input.touches);
  for (const [leadId, touch] of firstTouchByLead) {
    // O lead é a espinha da janela: toque de lead fora do período não entra,
    // senão a contagem por anúncio olharia um recorte diferente do gasto.
    const lead = leadById.get(leadId);
    if (!lead) continue;
    const adExternalId = text(touch.ad_external_id);
    const bucket = buckets.get(adExternalId) ?? {
      adExternalId,
      adsetExternalId: text(touch.adset_external_id) || null,
      campaignExternalId: text(touch.campaign_external_id) || null,
      campaignVotes: new Map<string, number>(),
      leads: 0,
      qualified: 0,
      commercialQualified: 0,
      sales: 0,
    };

    bucket.leads += 1;
    leadsAttributed += 1;
    if (isQualifiedLead(lead)) bucket.qualified += 1;
    if (isCommerciallyQualifiedLead(lead)) bucket.commercialQualified += 1;
    if (normalize(lead.status) === "ganho") {
      bucket.sales += 1;
      salesAttributed += 1;
    }

    // Campanha do anúncio: leads.campaign_id é o elo canônico (religado na
    // ingestão); campaign_external_id do toque é o fallback.
    const campaignId = text(lead.campaign_id)
      || text(campaignByExternalId.get(text(touch.campaign_external_id))?.id);
    if (campaignId) bucket.campaignVotes.set(campaignId, (bucket.campaignVotes.get(campaignId) ?? 0) + 1);
    if (!bucket.campaignExternalId && text(touch.campaign_external_id)) {
      bucket.campaignExternalId = text(touch.campaign_external_id);
    }
    buckets.set(adExternalId, bucket);
  }

  // Gasto medido por campanha e leads atribuídos por campanha — as duas pontas
  // do rateio.
  const spendByCampaign = new Map<string, number>();
  for (const row of input.spendRows) {
    const campaignId = text(row.campaign_id);
    if (!campaignId) continue;
    spendByCampaign.set(campaignId, (spendByCampaign.get(campaignId) ?? 0) + (toNumber(row.amount) ?? 0));
  }

  const resolvedCampaignOf = (bucket: Bucket) =>
    [...bucket.campaignVotes.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;

  // Denominador do rateio: TODOS os leads da campanha na janela (o dado já está
  // na entrada, via lead.campaign_id), não só os que caíram em algum bucket.
  const leadsByCampaignAll = new Map<string, number>();
  for (const lead of input.leads) {
    const campaignId = text(lead.campaign_id);
    if (!campaignId) continue;
    leadsByCampaignAll.set(campaignId, (leadsByCampaignAll.get(campaignId) ?? 0) + 1);
  }
  const leadsByCampaignWithAd = new Map<string, number>();
  for (const bucket of buckets.values()) {
    const campaignId = resolvedCampaignOf(bucket);
    if (campaignId) leadsByCampaignWithAd.set(campaignId, (leadsByCampaignWithAd.get(campaignId) ?? 0) + bucket.leads);
  }

  const ranking = [...buckets.values()].map((bucket): AdPerformanceRow => {
    const campaignId = resolvedCampaignOf(bucket);
    const campaign = campaignId ? campaignById.get(campaignId) : undefined;
    const sampleSufficient = bucket.leads >= AD_PERFORMANCE_MINIMUM_LEADS;
    const campaignSpend = campaignId ? spendByCampaign.get(campaignId) ?? null : null;
    const campaignLeadsWithAd = campaignId ? leadsByCampaignWithAd.get(campaignId) ?? 0 : 0;
    // Fallback para os leads atribuídos: se a campanha do bucket veio do id
    // externo do toque (e não de leads.campaign_id), o total por campaign_id
    // pode ser menor que o atribuído — o denominador nunca pode encolher abaixo
    // do numerador, senão a participação passaria de 100%.
    const campaignLeadsTotal = campaignId
      ? Math.max(leadsByCampaignAll.get(campaignId) ?? 0, campaignLeadsWithAd)
      : 0;
    const campaignLeadsWithoutAd = Math.max(0, campaignLeadsTotal - campaignLeadsWithAd);
    const coverage = campaignLeadsTotal > 0 ? campaignLeadsWithAd / campaignLeadsTotal : null;
    const share = campaignLeadsTotal > 0 ? bucket.leads / campaignLeadsTotal : null;
    const estimatedSpend = campaignSpend !== null && share !== null ? money(campaignSpend * share) : null;
    const coverageSufficient = coverage !== null && coverage >= AD_PERFORMANCE_MINIMUM_AD_COVERAGE;

    const reasons: string[] = [];
    if (!sampleSufficient) {
      reasons.push(
        `amostra insuficiente: ${bucket.leads} lead(s) contra o mínimo de ${AD_PERFORMANCE_MINIMUM_LEADS} — sem taxa e sem custo`,
      );
    }
    if (!campaignId) reasons.push("anúncio sem campanha resolvida: leads sem campaign_id e id externo não registrado em marketing_campaigns");
    else if (campaignSpend === null) reasons.push("sem marketing_spend registrado para a campanha deste anúncio");
    else if (!coverageSufficient && coverage !== null) {
      reasons.push(
        `cobertura de atribuição por anúncio de ${Math.round(coverage * 1000) / 10}% nesta campanha (${campaignLeadsWithAd} de ${campaignLeadsTotal} leads) — custo por anúncio não publicado`,
      );
    }

    return {
      adExternalId: bucket.adExternalId,
      adsetExternalId: bucket.adsetExternalId,
      campaignId,
      campaignName: text(campaign?.name) || null,
      campaignExternalId: bucket.campaignExternalId ?? (text(campaign?.external_campaign_id) || null),
      leads: bucket.leads,
      qualifiedLeads: bucket.qualified,
      commercialQualifiedLeads: bucket.commercialQualified,
      sales: bucket.sales,
      conversionRate: sampleSufficient ? pct(bucket.sales, bucket.leads) : null,
      campaignSpendInWindow: campaignSpend !== null ? money(campaignSpend) : null,
      campaignLeadsTotal,
      campaignLeadsWithAd,
      campaignLeadsWithoutAd,
      campaignAdCoveragePct: coverage !== null ? Math.round(coverage * 1000) / 10 : null,
      leadShareOfCampaign: share !== null ? Math.round(share * 1000) / 10 : null,
      estimatedSpend,
      estimatedCostPerLead: sampleSufficient && coverageSufficient && estimatedSpend !== null && bucket.leads > 0
        ? money(estimatedSpend / bucket.leads)
        : null,
      estimatedCostPerSale: sampleSufficient && coverageSufficient && estimatedSpend !== null && bucket.sales > 0
        ? money(estimatedSpend / bucket.sales)
        : null,
      sampleSufficient,
      explanation: reasons.length ? reasons.join("; ") : null,
    };
  }).sort((left, right) =>
    right.sales - left.sales
    || right.commercialQualifiedLeads - left.commercialQualifiedLeads
    || right.leads - left.leads
    || left.adExternalId.localeCompare(right.adExternalId),
  );

  const campaignsWithAds = new Set(
    [...buckets.values()].map((bucket) => resolvedCampaignOf(bucket)).filter(Boolean) as string[],
  );

  // Cobertura separada por natureza da origem (ver AdPerformanceTotals).
  let leadsFromNonAdSources = 0;
  let leadsFromAdSourcesWithoutAttribution = 0;
  for (const lead of input.leads) {
    if (firstTouchByLead.has(text(lead.id))) continue;
    const source = normalize(lead.source);
    const paidMedia = text(lead.campaign_id) !== ""
      || PAID_MEDIA_SOURCE_HINTS.some((hint) => source.includes(hint));
    if (paidMedia) leadsFromAdSourcesWithoutAttribution += 1;
    else leadsFromNonAdSources += 1;
  }

  return {
    ranking,
    totals: {
      ads: ranking.length,
      adsWithSales: ranking.filter((row) => row.sales > 0).length,
      leadsInWindow: input.leads.length,
      leadsAttributedToAds: leadsAttributed,
      leadsFromNonAdSources,
      leadsFromAdSourcesWithoutAttribution,
      leadsWithoutAd: leadsFromNonAdSources + leadsFromAdSourcesWithoutAttribution,
      sales: salesAttributed,
      campaignSpendMatched: money(
        [...campaignsWithAds].reduce((sum, campaignId) => sum + (spendByCampaign.get(campaignId) ?? 0), 0),
      ),
    },
  };
}
