// Qualidade de campanha — helper puro (sem I/O) compartilhado entre
// /api/v1/analytics/campaign-quality e /api/v1/leads/[id]/campaign-context.
//
// Consolida, por campanha de marketing_campaigns (tabela viva), somente sobre
// tabelas vivas do banco:
//   - volume de leads e vendas (leads.status === "ganho" — CRM é a verdade);
//   - qualificação DE CADASTRO: score_ia >= 70 OU temperature === "quente" —
//     MESMO corte de hotLeads do director-daily (app/api/v1/analytics/director-daily);
//   - qualificação COMERCIAL: etapa canônica em visita/proposta/contrato/ganho.
//     As duas convivem com NOMES DIFERENTES de propósito: cadastro é proxy
//     (soma de campos preenchidos), comercial é evidência verificável no funil.
//     Duas grandezas sob o mesmo rótulo "qualificado" foi o que permitiu o
//     painel dizer 45% enquanto o sinal enviado à Meta valia outra coisa;
//   - descartes: lead_events event_type=lead_discarded, atribuídos pela
//     metadata.campaignId gravada no momento do descarte (pipeline/route.ts),
//     com fallback de join em leads.campaign_id — mesmo padrão do
//     discard-report. Motivos rotulados pela taxonomia de
//     lib/atlas/discard-reasons.ts;
//   - custo: marketing_spend (amount), CPL e custo por lead qualificado.
//
// Governança anti-decisão-precipitada: sampleSufficient usa o MESMO gate do
// director-daily (30 leads). qualityGrade só existe com amostra suficiente —
// campanha sem amostra NUNCA recebe nota, para não induzir decisão de verba.
//
// Régua v2 da nota (CAMPAIGN_QUALITY_GRADE_VERSION): a nota é o gatilho de TODA
// decisão de verba e passou a ser decidida pelo eixo COMERCIAL. A nota A da v1
// exigia qualificationRate >= 40 — qualificação de CADASTRO, que para lead
// vindo da Meta é estruturalmente ausente (a ingestão grava score 0/temperature
// frio e nunca score_ia): campanha que VENDE ficava matematicamente impedida de
// chegar a A, e campanha com cadastro bonito e zero venda chegava. A régua vai
// junto de cada linha (qualityGradeRuleVersion) porque nota de réguas
// diferentes não é comparável período a período.
//
// O MESMO gate vale para TODA TAXA e TODO CUSTO derivado (qualificationRate,
// commercialQualificationRate, conversionRate, costPerLead,
// costPerQualifiedLead): sem amostra eles vêm `null` e `explanation` diz por
// quê. Enquanto leads.campaign_id era sempre nulo, todo bucket tinha leads = 0
// e esses campos saíam 0/null por acidente — invisíveis. Com o elo religado,
// uma campanha de 3 leads e 1 venda estamparia "33,3%" e um CPL sobre 3 leads
// no mesmo pixel em que a tela declara AMOSTRA INSUFICIENTE. Número derivado de
// amostra que não sustenta decisão é número sem lastro.
// CONTAGEM é fato observado e continua sempre visível (leads, qualificados,
// vendas, descartes): o que some é a razão, não o fato.
//
// A fórmula de conversão é idêntica à do campaignRanking do director-daily
// (Math.round(sales / leads * 1000) / 10) — extraída para cá sem alterar o
// consumidor existente.

import { getDiscardReason } from "@/lib/atlas/discard-reasons";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";

export const CAMPAIGN_QUALITY_MINIMUM_LEADS = 30; // mesmo gate do director-daily
export const CAMPAIGN_QUALITY_QUALIFIED_SCORE = 70; // mesmo corte de hotLeads

// Etapas que constituem LASTRO COMERCIAL: o lead foi visto, recebeu proposta ou
// fechou. É a única evidência de qualificação que não depende de cadastro bem
// preenchido — e a que vale como sinal externo (Meta CAPI).
export const CAMPAIGN_QUALITY_COMMERCIAL_STAGES = ["visita", "proposta", "contrato", "ganho"] as const;

// Régua da nota A/B/C — VERSIONADA porque a v2 mudou a BASE da nota (de
// cadastro para evidência comercial). Nota calculada por réguas diferentes não
// é comparável período a período; sem o rótulo, uma nota A nova ficaria
// indistinguível de uma nota A histórica.
export const CAMPAIGN_QUALITY_GRADE_VERSION = 2;

// Cortes da régua v2. A nota A exige EVIDÊNCIA COMERCIAL (etapa >= visita ou
// venda no CRM) porque a qualificação de cadastro é soma de campos preenchidos:
// para lead vindo da Meta ela é estruturalmente ausente (a ingestão não grava
// score_ia), e usá-la como base fazia a decisão de verba olhar cadastro em vez
// de venda.
export const CAMPAIGN_QUALITY_GRADE_A_COMMERCIAL_RATE = 15;
export const CAMPAIGN_QUALITY_GRADE_A_SALES = 3;
export const CAMPAIGN_QUALITY_GRADE_A_MAX_DISCARD = 25;
export const CAMPAIGN_QUALITY_GRADE_B_COMMERCIAL_RATE = 5;
export const CAMPAIGN_QUALITY_GRADE_B_QUALIFICATION_RATE = 20;
export const CAMPAIGN_QUALITY_GRADE_B_MAX_DISCARD = 50;

// Vocabulário publicado nos payloads: as duas qualificações têm nomes próprios
// para nunca serem lidas como a mesma grandeza.
export const CAMPAIGN_QUALITY_DEFINITIONS = {
  qualificacaoDeCadastro: `score_ia >= ${CAMPAIGN_QUALITY_QUALIFIED_SCORE} OU temperature "quente" — proxy de cadastro completo/quente; NÃO é evidência de intenção de compra`,
  qualificacaoComercial: `etapa canônica em ${CAMPAIGN_QUALITY_COMMERCIAL_STAGES.join(" | ")} — evidência verificável registrada por humano no funil`,
  denominadorDeCadastro:
    "qualificationRate é calculada SÓ sobre os leads com o eixo de cadastro medido (score_ia preenchido ou temperature quente): lead nunca pontuado NÃO conta como não qualificado — conta como não medido, e o denominador é publicado em qualificationBaseLeads",
} as const;

// Regra explicável do qualityGrade — publicada no payload dos endpoints.
// Todos os valores são string para o consumidor poder renderizá-los direto.
export const CAMPAIGN_QUALITY_GRADE_RULE = {
  versionLabel: `v${CAMPAIGN_QUALITY_GRADE_VERSION} — base COMERCIAL (etapa >= visita e venda no CRM); qualificação de cadastro virou métrica de completude e sozinha NÃO produz nota A`,
  A: `discardRate <= ${CAMPAIGN_QUALITY_GRADE_A_MAX_DISCARD}% e (commercialQualificationRate >= ${CAMPAIGN_QUALITY_GRADE_A_COMMERCIAL_RATE}% OU sales >= ${CAMPAIGN_QUALITY_GRADE_A_SALES})`,
  B: `discardRate <= ${CAMPAIGN_QUALITY_GRADE_B_MAX_DISCARD}% e (commercialQualificationRate >= ${CAMPAIGN_QUALITY_GRADE_B_COMMERCIAL_RATE}% OU sales >= 1 OU qualificationRate medida >= ${CAMPAIGN_QUALITY_GRADE_B_QUALIFICATION_RATE}%)`,
  C: "demais casos com amostra suficiente",
  ungraded: `menos de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads => qualityGrade null (amostra insuficiente)`,
  qualificationRateOmitted: `menos de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads com eixo de cadastro medido => qualificationRate null (não 0%) e a nota é decidida só pelo eixo comercial`,
} as const;

export type CampaignQualityGrade = "A" | "B" | "C";

export type CampaignQualityCampaign = {
  id: string;
  name: string | null;
  platform: string | null;
  status: string | null;
};

export type CampaignQualityLead = {
  id: string;
  campaign_id: string | null;
  status: string | null;
  score_ia: number | string | null;
  temperature: string | null;
  // Já vem no SELECT do loader compartilhado; opcional (e sem null, para casar
  // com o Stamped<T> do analista) porque chamador de teste monta a linha à mão.
  created_at?: string;
};

export type CampaignQualityDiscardEvent = {
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type CampaignQualitySpendRow = {
  campaign_id: string | null;
  amount: number | string | null;
};

export type CampaignQualityRow = {
  id: string;
  name: string;
  platform: string;
  status: string;
  leads: number;
  qualifiedLeads: number; // qualificação DE CADASTRO (proxy)
  qualificationBaseLeads: number; // leads com o eixo de cadastro MEDIDO (denominador de qualificationRate)
  qualificationRate: number | null; // % com 1 decimal sobre qualificationBaseLeads; null sem base medida
  commercialQualifiedLeads: number; // etapa >= visita (evidência comercial)
  commercialQualificationRate: number | null; // % com 1 decimal — comercial; null sem amostra
  avgScore: number | null; // média de score_ia com 1 decimal (null sem scores)
  sales: number;
  conversionRate: number | null; // mesma fórmula do director-daily; null sem amostra
  discarded: number;
  discardRate: number | null; // % dos leads da janela; null quando leads = 0
  discardsByMetaCategory: Array<{ category: string; count: number }>;
  topDiscardReason: { key: string; label: string; count: number } | null;
  spend: number;
  costPerLead: number | null;
  costPerQualifiedLead: number | null; // denominador = cadastro (inalterado)
  costPerCommercialQualifiedLead: number | null; // denominador = evidência comercial
  qualityGrade: CampaignQualityGrade | null; // null quando !sampleSufficient
  qualityGradeRuleVersion: number; // régua que produziu a nota (nota sem rótulo não é comparável)
  oldestLeadAt: string | null; // ISO do lead mais antigo do bucket — maturidade observável da campanha
  sampleSufficient: boolean;
  explanation: string | null; // por que taxas e custos vieram null
};

export type CampaignQualityTotals = {
  campaigns: number;
  leads: number;
  qualified: number; // cadastro
  commercialQualified: number; // etapa >= visita
  sales: number;
  discarded: number;
  classifiedDiscards: number; // reasonKey pertence à taxonomia vigente
  unattributedDiscards: number; // sem campanha resolvida (só nos totais)
  spend: number;
};

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const text = (value: unknown) => (typeof value === "string" ? value : "");
const toNumber = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : null);
// toNumber devolve 0 para null/""/undefined (Number(null) === 0): serve para
// somar dinheiro, NÃO para dizer se um score existe. Sem esta distinção, lead
// nunca pontuado entrava na média como nota zero e no denominador de cadastro
// como "não qualificado" — ausência de medição lida como medição ruim.
const scoreOf = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const pct = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
const money = (value: number) => Math.round(value * 100) / 100;

/** Qualificação DE CADASTRO — proxy: cadastro completo/quente. Não é evidência comercial. */
export function isQualifiedLead(lead: Pick<CampaignQualityLead, "score_ia" | "temperature">) {
  return (
    (scoreOf(lead.score_ia) ?? 0) >= CAMPAIGN_QUALITY_QUALIFIED_SCORE
    || normalize(lead.temperature) === "quente"
  );
}

/** Qualificação COMERCIAL — etapa canônica em visita/proposta/contrato/ganho. */
export function isCommerciallyQualifiedLead(lead: Pick<CampaignQualityLead, "status">) {
  const stage = canonicalPipelineStage(lead.status);
  return stage !== null && (CAMPAIGN_QUALITY_COMMERCIAL_STAGES as readonly string[]).includes(stage);
}

/**
 * O eixo de CADASTRO foi medido para este lead?
 *
 * A ingestão de lead da Meta grava temperature "frio" por DEFAULT e nunca grava
 * score_ia (só a edição humana pela API grava). Contar esse lead como "não
 * qualificado" transformava ausência de medição em nota ruim — por isso o
 * default frio sem score não entra no denominador.
 */
export function hasMeasuredRegistrationAxis(
  lead: Pick<CampaignQualityLead, "score_ia" | "temperature">,
) {
  return scoreOf(lead.score_ia) !== null || normalize(lead.temperature) === "quente";
}

function gradeFor(input: {
  commercialQualificationRate: number;
  sales: number;
  qualificationRate: number | null; // null = eixo de cadastro não medido
  discardRate: number | null;
  sampleSufficient: boolean;
}): CampaignQualityGrade | null {
  if (!input.sampleSufficient) return null;
  const discards = input.discardRate ?? 0;
  const commercial = input.commercialQualificationRate;
  if (
    discards <= CAMPAIGN_QUALITY_GRADE_A_MAX_DISCARD
    && (commercial >= CAMPAIGN_QUALITY_GRADE_A_COMMERCIAL_RATE
      || input.sales >= CAMPAIGN_QUALITY_GRADE_A_SALES)
  ) {
    return "A";
  }
  if (
    discards <= CAMPAIGN_QUALITY_GRADE_B_MAX_DISCARD
    && (commercial >= CAMPAIGN_QUALITY_GRADE_B_COMMERCIAL_RATE
      || input.sales >= 1
      // Cadastro sozinho não passa de B — e só quando de fato medido.
      || (input.qualificationRate !== null
        && input.qualificationRate >= CAMPAIGN_QUALITY_GRADE_B_QUALIFICATION_RATE))
  ) {
    return "B";
  }
  return "C";
}

const GRADE_RANK: Record<CampaignQualityGrade, number> = { A: 0, B: 1, C: 2 };

type Bucket = {
  campaign: CampaignQualityCampaign;
  leads: number;
  qualified: number;
  qualificationBase: number;
  commercialQualified: number;
  sales: number;
  scoreSum: number;
  scoreCount: number;
  discarded: number;
  byMetaCategory: Map<string, number>;
  byReason: Map<string, { key: string; label: string; count: number }>;
  spend: number;
  oldestLeadAt: string | null;
};

export function buildCampaignQuality(input: {
  campaigns: CampaignQualityCampaign[];
  leads: CampaignQualityLead[];
  discardEvents: CampaignQualityDiscardEvent[];
  spendRows: CampaignQualitySpendRow[];
}): { ranking: CampaignQualityRow[]; totals: CampaignQualityTotals } {
  const buckets = new Map<string, Bucket>();
  for (const campaign of input.campaigns) {
    const id = text(campaign.id);
    if (!id) continue;
    buckets.set(id, {
      campaign,
      leads: 0,
      qualified: 0,
      qualificationBase: 0,
      commercialQualified: 0,
      sales: 0,
      scoreSum: 0,
      scoreCount: 0,
      discarded: 0,
      byMetaCategory: new Map(),
      byReason: new Map(),
      spend: 0,
      oldestLeadAt: null,
    });
  }

  const leadById = new Map(input.leads.map((lead) => [text(lead.id), lead]));
  let totalQualified = 0;
  let totalCommercialQualified = 0;
  let totalSales = 0;
  for (const lead of input.leads) {
    const qualified = isQualifiedLead(lead);
    const commercial = isCommerciallyQualifiedLead(lead);
    const won = normalize(lead.status) === "ganho";
    if (qualified) totalQualified += 1;
    if (commercial) totalCommercialQualified += 1;
    if (won) totalSales += 1;
    const bucket = buckets.get(text(lead.campaign_id));
    if (!bucket) continue;
    bucket.leads += 1;
    if (qualified) bucket.qualified += 1;
    if (hasMeasuredRegistrationAxis(lead)) bucket.qualificationBase += 1;
    if (commercial) bucket.commercialQualified += 1;
    if (won) bucket.sales += 1;
    const score = scoreOf(lead.score_ia);
    if (score !== null) {
      bucket.scoreSum += score;
      bucket.scoreCount += 1;
    }
    const createdAt = text(lead.created_at);
    const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (Number.isFinite(createdMs)) {
      const currentMs = bucket.oldestLeadAt ? Date.parse(bucket.oldestLeadAt) : Number.NaN;
      if (!Number.isFinite(currentMs) || createdMs < currentMs) bucket.oldestLeadAt = createdAt;
    }
  }

  let classifiedDiscards = 0;
  let unattributedDiscards = 0;
  for (const event of input.discardEvents) {
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
    const reasonKey = normalize(metadata.reasonKey).trim();
    const reason = getDiscardReason(reasonKey);
    if (reason) classifiedDiscards += 1;
    // metadata.campaignId é gravada no descarte; fallback: join em leads.campaign_id.
    const campaignId = text(metadata.campaignId)
      || text(event.lead_id ? leadById.get(text(event.lead_id))?.campaign_id : "");
    const bucket = campaignId ? buckets.get(campaignId) : undefined;
    if (!bucket) {
      unattributedDiscards += 1;
      continue;
    }
    bucket.discarded += 1;
    const metaCategory = reason?.metaCategory
      ?? (text(metadata.metaCategory) || "other");
    bucket.byMetaCategory.set(metaCategory, (bucket.byMetaCategory.get(metaCategory) ?? 0) + 1);
    const key = reasonKey || "motivo_ausente";
    const label = reason?.label ?? (text(metadata.reasonLabel) || key);
    const reasonBucket = bucket.byReason.get(key) ?? { key, label, count: 0 };
    reasonBucket.count += 1;
    bucket.byReason.set(key, reasonBucket);
  }

  let totalSpend = 0;
  for (const row of input.spendRows) {
    const amount = toNumber(row.amount) ?? 0;
    totalSpend += amount;
    const bucket = buckets.get(text(row.campaign_id));
    if (bucket) bucket.spend += amount;
  }

  const ranking = [...buckets.values()].map((bucket): CampaignQualityRow => {
    const discardRate = bucket.leads > 0 ? pct(bucket.discarded, bucket.leads) : null;
    const sampleSufficient = bucket.leads >= CAMPAIGN_QUALITY_MINIMUM_LEADS;
    // Sem base medida suficiente a taxa de cadastro NÃO existe — 0% ali seria
    // "ninguém qualificou" quando o fato é "ninguém pontuou".
    const registrationMeasured = bucket.qualificationBase >= CAMPAIGN_QUALITY_MINIMUM_LEADS;
    const qualificationRate = registrationMeasured
      ? pct(bucket.qualified, bucket.qualificationBase)
      : null;
    const commercialQualificationRate = pct(bucket.commercialQualified, bucket.leads);
    const topDiscardReason = [...bucket.byReason.values()]
      .sort((left, right) => right.count - left.count)[0] ?? null;
    const omissions = [
      sampleSufficient
        ? null
        : `${bucket.leads} lead(s) contra o mínimo de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} — taxas e custos omitidos; as contagens continuam sendo fato observado`,
      registrationMeasured
        ? null
        : `qualificationRate omitida: ${bucket.qualificationBase} de ${bucket.leads} lead(s) têm o eixo de cadastro medido (score_ia preenchido ou temperature quente) contra o mínimo de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} — lead não pontuado não conta como não qualificado, e a nota sai só pelo eixo comercial`,
    ].filter((item): item is string => item !== null);
    return {
      id: text(bucket.campaign.id),
      name: text(bucket.campaign.name) || "Campanha",
      platform: text(bucket.campaign.platform) || "Não informado",
      status: text(bucket.campaign.status) || "unknown",
      leads: bucket.leads,
      qualifiedLeads: bucket.qualified,
      qualificationBaseLeads: bucket.qualificationBase,
      qualificationRate: sampleSufficient ? qualificationRate : null,
      commercialQualifiedLeads: bucket.commercialQualified,
      commercialQualificationRate: sampleSufficient ? commercialQualificationRate : null,
      avgScore: bucket.scoreCount > 0
        ? Math.round((bucket.scoreSum / bucket.scoreCount) * 10) / 10
        : null,
      sales: bucket.sales,
      conversionRate: sampleSufficient ? pct(bucket.sales, bucket.leads) : null,
      discarded: bucket.discarded,
      discardRate,
      discardsByMetaCategory: [...bucket.byMetaCategory.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count),
      topDiscardReason,
      spend: money(bucket.spend),
      costPerLead: sampleSufficient && bucket.spend > 0 && bucket.leads > 0
        ? money(bucket.spend / bucket.leads)
        : null,
      costPerQualifiedLead: sampleSufficient && bucket.spend > 0 && bucket.qualified > 0
        ? money(bucket.spend / bucket.qualified)
        : null,
      costPerCommercialQualifiedLead:
        sampleSufficient && bucket.spend > 0 && bucket.commercialQualified > 0
          ? money(bucket.spend / bucket.commercialQualified)
          : null,
      qualityGrade: gradeFor({
        commercialQualificationRate,
        sales: bucket.sales,
        qualificationRate,
        discardRate,
        sampleSufficient,
      }),
      qualityGradeRuleVersion: CAMPAIGN_QUALITY_GRADE_VERSION,
      oldestLeadAt: bucket.oldestLeadAt,
      sampleSufficient,
      explanation: omissions.length ? omissions.join(" · ") : null,
    };
  }).sort((left, right) =>
    Number(right.sampleSufficient) - Number(left.sampleSufficient)
    || (left.qualityGrade ? GRADE_RANK[left.qualityGrade] : 3)
      - (right.qualityGrade ? GRADE_RANK[right.qualityGrade] : 3)
    // Sem amostra a taxa não existe: ordena por -1 para a linha sem lastro
    // ficar atrás de qualquer taxa medida, em vez de virar 0% (que competiria
    // de igual para igual com uma campanha que de fato qualificou 0%).
    || (right.qualificationRate ?? -1) - (left.qualificationRate ?? -1)
    || right.qualifiedLeads - left.qualifiedLeads
    || right.leads - left.leads,
  );

  return {
    ranking,
    totals: {
      campaigns: input.campaigns.length,
      leads: input.leads.length,
      qualified: totalQualified,
      commercialQualified: totalCommercialQualified,
      sales: totalSales,
      discarded: input.discardEvents.length,
      classifiedDiscards,
      unattributedDiscards,
      spend: money(totalSpend),
    },
  };
}
