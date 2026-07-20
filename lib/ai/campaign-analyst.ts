import { generateAIText } from "@/lib/ai/provider-router";
import {
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  type CampaignQualityRow,
  type CampaignQualityTotals,
} from "@/lib/atlas/campaign-quality";

// Analista Andromeda — robô em dedicação integral aos relatórios de campanha.
// Irmão do conselheiro (lib/ai/andromeda-pipeline-advisor.ts), com papel
// distinto e não competitivo: o Analista NARRA o que aconteceu (anomalias
// entre janelas + narrativa executiva); o Conselheiro RECOMENDA o próximo
// passo. Nada aqui gera recomendação de ação.
//
// Duas peças:
//   1. detectCampaignAnomalies — 100% DETERMINÍSTICO: compara a janela atual
//      com a janela anterior de mesmo tamanho, campanha a campanha, sobre as
//      linhas já agregadas do campaign-quality (reuso, zero fórmula nova).
//   2. buildAnalystNarrative — narrativa executiva pt-BR em duas vias, padrão
//      do repo: generativa via provider-router (task "commercial", SOMENTE
//      agregados, containsPersonalData: false por construção) com fallback
//      determinístico por template. A IA nunca é ponto único de falha.
//
// PII zero por construção: os shapes de entrada (CampaignQualityRow/Totals e
// CampaignAnomaly) não têm campo de lead individual — só volumes, taxas,
// custos e nomes de campanha.

// Thresholds do detector — publicados no payload do endpoint (explicabilidade).
export const ANALYST_QUALIFICATION_DELTA_PP = 10; // pontos percentuais
export const ANALYST_DISCARD_SHARE_DELTA_PP = 15; // pontos percentuais
export const ANALYST_CPL_DELTA_PCT = 30; // variação percentual do CPL
export const ANALYST_VOLUME_DROP_PCT = 50; // queda percentual de leads
export const ANALYST_NARRATIVE_MAX_CHARS = 900;

export const CAMPAIGN_ANALYST_THRESHOLDS = {
  qualificationRate: `variação de qualificação >= ${ANALYST_QUALIFICATION_DELTA_PP} p.p. entre janelas (exige amostra suficiente de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads nas DUAS janelas)`,
  discardCategoryShare: `share de uma metaCategory de descarte subiu >= ${ANALYST_DISCARD_SHARE_DELTA_PP} p.p. entre janelas (exige amostra suficiente nas DUAS janelas)`,
  costPerLead: `CPL variou >= ${ANALYST_CPL_DELTA_PCT}% entre janelas (CPL null em qualquer janela => sem anomalia de CPL)`,
  leadVolume: `volume de leads caiu >= ${ANALYST_VOLUME_DROP_PCT}% vs a janela anterior`,
  ghostDelta: "campanha presente em só uma janela nunca gera delta",
} as const;

export type CampaignAnomalyKind =
  | "qualification_rate"
  | "discard_category_share"
  | "cost_per_lead"
  | "lead_volume";

export type CampaignAnomaly = {
  campaignId: string;
  campaignName: string;
  kind: CampaignAnomalyKind;
  direction: "up" | "down";
  magnitude: number; // p.p. para taxas/shares; % para CPL e volume
  evidence: string; // pt-BR citando os números das DUAS janelas
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const brl = (value: number) => `R$ ${value.toFixed(2)}`;

// Share (%) de uma metaCategory dentro dos descartes da janela. Zero divisão
// por zero: janela sem descarte => share 0 por definição (não há proporção).
function categoryShare(row: CampaignQualityRow, category: string): number {
  if (row.discarded <= 0) return 0;
  const count = row.discardsByMetaCategory
    .find((item) => item.category === category)?.count ?? 0;
  return round1((count / row.discarded) * 100);
}

// Detector determinístico de anomalias entre janelas de MESMO tamanho.
// Gates inegociáveis:
//   - deltas de taxa (qualificação e share de descarte) exigem
//     sampleSufficient nas DUAS janelas — mesmo gate do director-daily;
//   - campanha presente em só uma janela não gera delta fantasma (o pareamento
//     é por id: sem par, sem comparação);
//   - CPL null em qualquer janela => sem anomalia de CPL (zero divisão por
//     zero; costPerLead só é não-nulo com spend > 0 e leads > 0).
export function detectCampaignAnomalies(
  currentRanking: CampaignQualityRow[],
  previousRanking: CampaignQualityRow[],
): CampaignAnomaly[] {
  const previousById = new Map(previousRanking.map((row) => [row.id, row]));
  const anomalies: CampaignAnomaly[] = [];

  for (const current of currentRanking) {
    const previous = previousById.get(current.id);
    if (!previous) continue; // presente em só uma janela: sem delta fantasma

    const bothSampled = current.sampleSufficient && previous.sampleSufficient;

    // (a) Qualificação variou >= 10 p.p. — só com amostra nas duas janelas.
    if (bothSampled) {
      const delta = round1(current.qualificationRate - previous.qualificationRate);
      if (Math.abs(delta) >= ANALYST_QUALIFICATION_DELTA_PP) {
        anomalies.push({
          campaignId: current.id,
          campaignName: current.name,
          kind: "qualification_rate",
          direction: delta > 0 ? "up" : "down",
          magnitude: Math.abs(delta),
          evidence: `Qualificação ${delta > 0 ? "subiu" : "caiu"} de ${previous.qualificationRate}% (${previous.qualifiedLeads} de ${previous.leads} leads na janela anterior) para ${current.qualificationRate}% (${current.qualifiedLeads} de ${current.leads} leads na janela atual) — ${Math.abs(delta)} p.p.`,
        });
      }
    }

    // (b) Share de uma metaCategory de descarte saltou >= 15 p.p. — também é
    // delta de taxa: exige amostra suficiente nas duas janelas.
    if (bothSampled) {
      const categories = new Set([
        ...current.discardsByMetaCategory.map((item) => item.category),
        ...previous.discardsByMetaCategory.map((item) => item.category),
      ]);
      let topJump: { category: string; delta: number; currentShare: number; previousShare: number } | null = null;
      for (const category of categories) {
        const currentShare = categoryShare(current, category);
        const previousShare = categoryShare(previous, category);
        const delta = round1(currentShare - previousShare);
        if (delta >= ANALYST_DISCARD_SHARE_DELTA_PP && (!topJump || delta > topJump.delta)) {
          topJump = { category, delta, currentShare, previousShare };
        }
      }
      if (topJump) {
        anomalies.push({
          campaignId: current.id,
          campaignName: current.name,
          kind: "discard_category_share",
          direction: "up",
          magnitude: topJump.delta,
          evidence: `O motivo de descarte "${topJump.category}" saltou de ${topJump.previousShare}% dos descartes na janela anterior (${previous.discarded} descartes) para ${topJump.currentShare}% na janela atual (${current.discarded} descartes) — ${topJump.delta} p.p.`,
        });
      }
    }

    // (c) CPL variou >= 30% — CPL null em qualquer janela => sem anomalia.
    if (current.costPerLead !== null && previous.costPerLead !== null && previous.costPerLead > 0) {
      const deltaPct = round1(
        ((current.costPerLead - previous.costPerLead) / previous.costPerLead) * 100,
      );
      if (Math.abs(deltaPct) >= ANALYST_CPL_DELTA_PCT) {
        anomalies.push({
          campaignId: current.id,
          campaignName: current.name,
          kind: "cost_per_lead",
          direction: deltaPct > 0 ? "up" : "down",
          magnitude: Math.abs(deltaPct),
          evidence: `CPL ${deltaPct > 0 ? "subiu" : "caiu"} de ${brl(previous.costPerLead)} na janela anterior para ${brl(current.costPerLead)} na janela atual — variação de ${Math.abs(deltaPct)}%.`,
        });
      }
    }

    // (d) Volume de leads caiu >= 50% vs a janela anterior.
    if (previous.leads > 0) {
      const dropPct = round1(((previous.leads - current.leads) / previous.leads) * 100);
      if (dropPct >= ANALYST_VOLUME_DROP_PCT) {
        anomalies.push({
          campaignId: current.id,
          campaignName: current.name,
          kind: "lead_volume",
          direction: "down",
          magnitude: dropPct,
          evidence: `Volume caiu de ${previous.leads} leads na janela anterior para ${current.leads} na janela atual — queda de ${dropPct}%.`,
        });
      }
    }
  }

  // Ordem estável para consumo: maiores magnitudes primeiro.
  return anomalies.sort((left, right) => right.magnitude - left.magnitude);
}

export type AnalystNarrative = {
  narrative: string;
  engine: "generative" | "deterministic";
};

// Piora primeiro: a "anomalia mais grave" do fallback prioriza sinais
// negativos (queda de qualificação, salto de descarte, CPL subindo, volume
// caindo) sobre melhoras, e maior magnitude dentro do mesmo sinal.
function worstAnomaly(anomalies: CampaignAnomaly[]): CampaignAnomaly | null {
  const negative = anomalies.filter((item) =>
    (item.kind === "qualification_rate" && item.direction === "down")
    || (item.kind === "discard_category_share" && item.direction === "up")
    || (item.kind === "cost_per_lead" && item.direction === "up")
    || (item.kind === "lead_volume" && item.direction === "down"));
  return negative[0] ?? anomalies[0] ?? null;
}

// Fallback determinístico por template — melhor campanha, pior sangria e a
// anomalia mais grave, sempre citando números que já existem nos agregados.
function deterministicNarrative(input: {
  totals: CampaignQualityTotals;
  ranking: CampaignQualityRow[];
  anomalies: CampaignAnomaly[];
}): string {
  const { totals, ranking, anomalies } = input;
  const sentences: string[] = [];

  sentences.push(
    `Na janela, ${totals.leads} leads chegaram por ${ranking.length} campanha${ranking.length === 1 ? "" : "s"} com atividade, com ${totals.qualified} qualificados, ${totals.sales} vendas e ${totals.discarded} descartes.`,
  );

  const best = ranking.find((row) => row.sampleSufficient) ?? ranking[0] ?? null;
  if (best) {
    sentences.push(
      `A melhor campanha é ${best.name}, com ${best.qualificationRate}% de qualificação (${best.qualifiedLeads} de ${best.leads} leads)${best.qualityGrade ? ` e nota ${best.qualityGrade}` : ""}.`,
    );
  }

  // Pior sangria: entre campanhas com amostra, a de maior taxa de descarte.
  const bleed = ranking
    .filter((row) => row.sampleSufficient && (row.discardRate ?? 0) > 0)
    .sort((left, right) => (right.discardRate ?? 0) - (left.discardRate ?? 0))[0] ?? null;
  if (bleed && bleed.id !== best?.id) {
    sentences.push(
      `A maior sangria está em ${bleed.name}: ${bleed.discarded} descartes (${bleed.discardRate}% dos ${bleed.leads} leads)${bleed.topDiscardReason ? `, principalmente por ${bleed.topDiscardReason.label.toLowerCase()}` : ""}.`,
    );
  }

  const worst = worstAnomaly(anomalies);
  if (worst) {
    sentences.push(`Ponto de atenção entre janelas: ${worst.evidence}`);
  } else if (ranking.length) {
    sentences.push("Nenhuma anomalia relevante entre a janela atual e a anterior.");
  }

  return sentences.join(" ").slice(0, ANALYST_NARRATIVE_MAX_CHARS);
}

const SYSTEM = [
  "Você é o Analista Andromeda do Atlas, CRM imobiliário brasileiro — um analista em dedicação integral aos relatórios de campanha.",
  "Você recebe SOMENTE agregados por campanha (volumes, taxas, custos, descartes por categoria) e anomalias já detectadas — nunca dados pessoais de lead.",
  "Seu papel é NARRAR o que aconteceu; nunca recomendar ação (isso é papel do conselheiro).",
  "NUNCA invente números; use apenas os fornecidos; responda apenas o texto da narrativa.",
  "Escreva uma narrativa executiva em português do Brasil, com 3 a 5 frases corridas, sem markdown, sem listas, sem JSON e sem títulos.",
].join("\n");

const MAX_PROMPT_CAMPAIGNS = 20;
const MAX_PROMPT_ANOMALIES = 10;

// Retorno inválido da IA => fallback. Rejeita vazio, lixo JSON/markdown e
// qualquer texto que não pareça prosa; o que passa é truncado em 900 chars.
function sanitizeNarrative(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("[")) return null; // JSON lixo
  if (text.includes("```") || /^#{1,6}\s/m.test(text)) return null; // markdown lixo
  if (text.length < 40) return null; // curto demais para 3-5 frases
  return text.slice(0, ANALYST_NARRATIVE_MAX_CHARS);
}

export async function buildAnalystNarrative(input: {
  totals: CampaignQualityTotals;
  ranking: CampaignQualityRow[];
  anomalies: CampaignAnomaly[];
  organizationId: string;
  userId?: string;
}): Promise<AnalystNarrative> {
  const fallback = (): AnalystNarrative => ({
    narrative: deterministicNarrative(input),
    engine: "deterministic",
  });

  if (!input.ranking.length) return fallback();

  try {
    // Prompt SÓ com agregados — nenhum campo de lead individual existe aqui.
    const promptPayload = {
      totals: input.totals,
      campaigns: input.ranking.slice(0, MAX_PROMPT_CAMPAIGNS).map((row) => ({
        name: row.name,
        platform: row.platform,
        leads: row.leads,
        qualifiedLeads: row.qualifiedLeads,
        qualificationRate: row.qualificationRate,
        sales: row.sales,
        discarded: row.discarded,
        discardRate: row.discardRate,
        costPerLead: row.costPerLead,
        qualityGrade: row.qualityGrade,
        sampleSufficient: row.sampleSufficient,
      })),
      anomalies: input.anomalies.slice(0, MAX_PROMPT_ANOMALIES),
    };
    const result = await generateAIText({
      task: "commercial",
      containsPersonalData: false,
      organizationId: input.organizationId,
      userId: input.userId,
      feature: "campaign-analyst",
      system: SYSTEM,
      prompt: `Agregados de campanha e anomalias entre janelas (JSON):\n${JSON.stringify(promptPayload)}\n\nEscreva a narrativa executiva (3 a 5 frases, apenas texto corrido).`,
    });
    if (result.provider === "local") return fallback();
    const narrative = sanitizeNarrative(result.text);
    if (!narrative) return fallback();
    return { narrative, engine: "generative" };
  } catch {
    return fallback();
  }
}
