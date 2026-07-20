import { generateAIText } from "@/lib/ai/provider-router";
import {
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  type CampaignQualityRow,
} from "@/lib/atlas/campaign-quality";

// Conselheiro Pipeline × Andromeda — recomendações por campanha a partir de
// SOMENTE dados agregados (linhas do campaign-quality, distribuição do funil
// e quebra de descartes por metaCategory). NUNCA recebe nome, telefone ou
// e-mail de lead: o shape de entrada não tem campo de lead individual, e a
// chamada de IA roda com containsPersonalData: false por construção.
//
// Duas vias, padrão do repo (irmão de whatsapp-conversation-intelligence):
//   (a) generativa via provider-router (task "reasoning", zero PII, prompt
//       com guardrails: nunca inventar números, só usar os agregados,
//       nunca recomendar ação destrutiva automática);
//   (b) fallback determinístico com regras explícitas (ANDROMEDA_ADVISOR_RULES)
//       que roda sempre que não houver provedor configurado, a chamada falhar
//       ou o JSON voltar inválido — a IA nunca é ponto único de falha.
// A resposta carrega engine: "generative" | "deterministic" para o consumidor
// saber qual via gerou o conselho.
//
// Governança inegociável (aplicada MESMO sobre a saída generativa):
//   - campanha sem amostra suficiente (< 30 leads, mesmo gate do
//     director-daily) SEMPRE recebe "keep" — nunca decisão de verba;
//   - nada aqui executa ação na Meta: é conselho para aprovação humana
//     (o envio de lead_status = disqualified segue sob o gate do diretor do
//     andromeda-loop, política negativeSignalsInternalOnly).

export const ANDROMEDA_ADVISOR_ACTIONS = [
  "scale",
  "adjust_targeting",
  "fix_form",
  "pause_review",
  "keep",
] as const;
export type AndromedaAdvisorAction = (typeof ANDROMEDA_ADVISOR_ACTIONS)[number];

export const ANDROMEDA_ADVISOR_CONFIDENCES = ["alta", "media", "baixa"] as const;
export type AndromedaAdvisorConfidence = (typeof ANDROMEDA_ADVISOR_CONFIDENCES)[number];

export type AndromedaFunnelStage = { stage: string; label: string; count: number };
export type AndromedaDiscardCategory = { category: string; count: number };

// Entrada 100% agregada — nenhum campo de lead individual existe neste shape.
export type AndromedaPipelineAggregates = {
  period: { start: string; end: string; days: number };
  ranking: CampaignQualityRow[]; // linhas do campaign-quality (já agregadas)
  funnel: AndromedaFunnelStage[]; // distribuição de leads por etapa canônica
  discardsByMetaCategory: AndromedaDiscardCategory[]; // quebra org-wide
  unattributedDiscards: number;
  spendMeasured: boolean; // false = marketing_spend degradou (CPL não confiável)
};

export type AndromedaRecommendation = {
  campaignId: string;
  campaignName: string;
  action: AndromedaAdvisorAction;
  rationale: string; // pt-BR, explicável, cita os números dos agregados
  confidence: AndromedaAdvisorConfidence;
  metaFeedbackHint: string; // o que reportar à Meta para o Andromeda aprender
};

export type AndromedaAdvice = {
  engine: "generative" | "deterministic";
  model: string | null;
  recommendations: AndromedaRecommendation[];
};

// Regras explícitas do fallback determinístico — publicadas no payload do
// endpoint (padrão rules/formula do broker-daily) para explicabilidade.
export const ANDROMEDA_ADVISOR_RULES = {
  keepInsufficientSample: `leads < ${CAMPAIGN_QUALITY_MINIMUM_LEADS} => keep (amostra insuficiente; nenhuma decisão de verba — mesmo gate do director-daily)`,
  fixForm: "descartes >= 5 e (invalid_contact_info + spam) >= 40% dos descartes => fix_form (problema de captação, não de público)",
  adjustTargeting: "descartes >= 5 e (out_of_service_area + wrong_product + budget_mismatch) >= 40% dos descartes => adjust_targeting",
  pauseReview: "amostra suficiente e nota C e (discardRate >= 50% ou qualificationRate < 10% ou CPL qualificado > 2x a mediana) => pause_review (revisão humana antes de qualquer pausa)",
  scale: "amostra suficiente e nota A e CPL qualificado <= mediana das campanhas ranqueadas (ou custo não medido => confiança média) => scale",
  keep: "demais casos => keep (seguir alimentando o ciclo de qualidade)",
} as const;

const FORM_CATEGORIES = ["invalid_contact_info", "spam"];
const TARGETING_CATEGORIES = ["out_of_service_area", "wrong_product", "budget_mismatch"];
const MAX_PROMPT_CAMPAIGNS = 20;

const brl = (value: number) => `R$ ${value.toFixed(2)}`;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function categoryCount(row: CampaignQualityRow, categories: string[]) {
  return row.discardsByMetaCategory
    .filter((item) => categories.includes(item.category))
    .reduce((sum, item) => sum + item.count, 0);
}

function insufficientSampleRecommendation(row: CampaignQualityRow): AndromedaRecommendation {
  return {
    campaignId: row.id,
    campaignName: row.name,
    action: "keep",
    rationale: `Apenas ${row.leads} leads na janela (mínimo ${CAMPAIGN_QUALITY_MINIMUM_LEADS}) — sem nota de qualidade e sem decisão de verba até amostra suficiente.`,
    confidence: "alta",
    metaFeedbackHint:
      "Ainda não reportar lote de qualidade à Meta: amostra pequena distorce o aprendizado do Andromeda. Aguardar a amostra mínima.",
  };
}

// Fallback determinístico — regras de ANDROMEDA_ADVISOR_RULES, na mesma ordem
// de precedência documentada lá. Sem custo externo, sem IA, 100% explicável.
export function deterministicAndromedaAdvice(
  aggregates: AndromedaPipelineAggregates,
): AndromedaRecommendation[] {
  const cpqlMedian = median(
    aggregates.ranking
      .filter((row) => row.sampleSufficient && row.costPerQualifiedLead !== null)
      .map((row) => row.costPerQualifiedLead as number),
  );

  return aggregates.ranking.map((row): AndromedaRecommendation => {
    if (!row.sampleSufficient) return insufficientSampleRecommendation(row);

    const discardRate = row.discardRate ?? 0;
    const cpql = row.costPerQualifiedLead;

    if (row.discarded >= 5) {
      const formCount = categoryCount(row, FORM_CATEGORIES);
      const formShare = formCount / row.discarded;
      if (formShare >= 0.4) {
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "fix_form",
          rationale: `${formCount} de ${row.discarded} descartes (${Math.round(formShare * 100)}%) são contato inválido ou spam — o problema está na captação do formulário, não no público da campanha.`,
          confidence: formShare >= 0.6 ? "alta" : "media",
          metaFeedbackHint:
            "Reportar estes descartes como disqualified (invalid_contact_info/spam) para o Andromeda filtrar cadastros falsos; revisar validação de telefone/e-mail no formulário.",
        };
      }
      const targetingCount = categoryCount(row, TARGETING_CATEGORIES);
      const targetingShare = targetingCount / row.discarded;
      if (targetingShare >= 0.4) {
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "adjust_targeting",
          rationale: `${targetingCount} de ${row.discarded} descartes (${Math.round(targetingShare * 100)}%) indicam público errado (fora de área, produto errado ou orçamento incompatível), com qualificação de ${row.qualificationRate}%.`,
          confidence: targetingShare >= 0.6 ? "alta" : "media",
          metaFeedbackHint:
            "Reportar disqualified com as categorias out_of_service_area/wrong_product/budget_mismatch para o Andromeda afastar perfis semelhantes; revisar segmentação geográfica e de renda.",
        };
      }
    }

    if (
      row.qualityGrade === "C"
      && (discardRate >= 50
        || row.qualificationRate < 10
        || (cpql !== null && cpqlMedian !== null && cpql > cpqlMedian * 2))
    ) {
      const costNote = cpql !== null && cpqlMedian !== null
        ? ` e CPL qualificado de ${brl(cpql)} (mediana ${brl(cpqlMedian)})`
        : "";
      return {
        campaignId: row.id,
        campaignName: row.name,
        action: "pause_review",
        rationale: `Nota C com ${row.qualificationRate}% de qualificação, ${discardRate}% de descarte${costNote} — levar à revisão do gestor antes de qualquer pausa. Nada é pausado automaticamente.`,
        confidence: "media",
        metaFeedbackHint:
          "Antes de decidir, reportar o lote acumulado de disqualified categorizados para fechar o ciclo de aprendizado do Andromeda sobre esta campanha.",
      };
    }

    if (row.qualityGrade === "A") {
      const cheapEnough = cpql !== null && cpqlMedian !== null && cpql <= cpqlMedian;
      const costUnmeasured = cpql === null || cpqlMedian === null;
      if (cheapEnough || costUnmeasured) {
        const costNote = cheapEnough
          ? ` e CPL qualificado de ${brl(cpql as number)} (mediana ${brl(cpqlMedian as number)})`
          : " — custo por qualificado não medido (marketing_spend indisponível ou sem investimento lançado)";
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "scale",
          rationale: `Nota A com ${row.qualificationRate}% de qualificação (${row.qualifiedLeads} de ${row.leads} leads)${costNote} — candidata a receber mais verba, sob aprovação do diretor.`,
          confidence: cheapEnough ? "alta" : "media",
          metaFeedbackHint:
            "Reportar os leads qualificados e as vendas do CRM (CRM é a verdade da conversão) para reforçar o lookalike vencedor antes de escalar a verba.",
        };
      }
    }

    return {
      campaignId: row.id,
      campaignName: row.name,
      action: "keep",
      rationale: `Nota ${row.qualityGrade ?? "—"} com ${row.qualificationRate}% de qualificação e ${discardRate}% de descarte — manter como está e seguir alimentando o ciclo de qualidade.`,
      confidence: "media",
      metaFeedbackHint:
        "Manter o envio contínuo de status de qualidade (qualified/disqualified categorizado) para o Andromeda continuar calibrando a entrega.",
    };
  });
}

function coerce<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const SYSTEM = [
  "Você é o conselheiro Pipeline × Andromeda do Atlas, CRM imobiliário brasileiro.",
  "Você recebe SOMENTE agregados por campanha (volumes, taxas, custos, descartes por categoria e funil) — nunca dados pessoais de lead.",
  "NUNCA invente números: cite apenas valores presentes nos agregados fornecidos.",
  "NUNCA recomende ação destrutiva automática: toda recomendação é conselho para aprovação humana; nada é aplicado na Meta automaticamente.",
  "Ações permitidas: scale (mais verba), adjust_targeting (ajustar público), fix_form (corrigir captação/formulário), pause_review (levar à revisão humana antes de pausar), keep (manter).",
  `Campanha com menos de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads (sampleSufficient=false): sempre keep — amostra insuficiente não sustenta decisão de verba.`,
  "Em metaFeedbackHint, diga o que reportar à Meta (CRM lead status qualified/disqualified e categorias) para o Andromeda aprender — o CRM é a verdade da conversão.",
  'Responda SOMENTE com um JSON válido, sem texto fora do JSON, no formato: {"recommendations":[{"campaignId":"<id existente nos agregados>","action":"scale|adjust_targeting|fix_form|pause_review|keep","rationale":"pt-BR citando os números","confidence":"alta|media|baixa","metaFeedbackHint":"o que reportar à Meta"}]}',
].join("\n");

export async function adviseAndromedaPipeline(input: {
  organizationId: string;
  userId?: string;
  aggregates: AndromedaPipelineAggregates;
}): Promise<AndromedaAdvice> {
  const { aggregates } = input;
  if (!aggregates.ranking.length) {
    return { engine: "deterministic", model: null, recommendations: [] };
  }

  const deterministic = deterministicAndromedaAdvice(aggregates);
  const fallback = (): AndromedaAdvice => ({
    engine: "deterministic",
    model: null,
    recommendations: deterministic,
  });

  const rowById = new Map(aggregates.ranking.map((row) => [row.id, row]));
  const deterministicById = new Map(deterministic.map((item) => [item.campaignId, item]));

  try {
    // Prompt só com agregados — nenhum campo de lead individual existe aqui.
    const promptPayload = {
      period: aggregates.period,
      minimumLeadsForDecision: CAMPAIGN_QUALITY_MINIMUM_LEADS,
      spendMeasured: aggregates.spendMeasured,
      funnel: aggregates.funnel,
      discardsByMetaCategory: aggregates.discardsByMetaCategory,
      unattributedDiscards: aggregates.unattributedDiscards,
      campaigns: aggregates.ranking.slice(0, MAX_PROMPT_CAMPAIGNS),
    };
    const result = await generateAIText({
      task: "reasoning",
      containsPersonalData: false,
      organizationId: input.organizationId,
      userId: input.userId,
      feature: "andromeda-pipeline-advisor",
      system: SYSTEM,
      prompt: `Agregados Pipeline × Andromeda (JSON):\n${JSON.stringify(promptPayload)}\n\nResponda apenas com o JSON de recomendações.`,
    });
    if (result.provider === "local") return fallback();
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return fallback();
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const items = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    const generativeById = new Map<string, AndromedaRecommendation>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const campaignId = typeof raw.campaignId === "string" ? raw.campaignId : "";
      const row = rowById.get(campaignId);
      if (!row) continue; // nunca aceitar campanha inventada pela IA
      // Governança inegociável sobre a saída generativa: sem amostra
      // suficiente não existe decisão de verba — sempre keep determinístico.
      if (!row.sampleSufficient) {
        generativeById.set(row.id, insufficientSampleRecommendation(row));
        continue;
      }
      const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 500) : "";
      const hint = typeof raw.metaFeedbackHint === "string" ? raw.metaFeedbackHint.trim().slice(0, 300) : "";
      if (!rationale || !hint) continue; // recomendação sem explicação não entra
      generativeById.set(row.id, {
        campaignId: row.id,
        campaignName: row.name, // nome sempre dos agregados, nunca da IA
        action: coerce(raw.action, ANDROMEDA_ADVISOR_ACTIONS, "keep"),
        rationale,
        confidence: coerce(raw.confidence, ANDROMEDA_ADVISOR_CONFIDENCES, "media"),
        metaFeedbackHint: hint,
      });
    }
    if (!generativeById.size) return fallback();

    // Cobertura completa na ordem do ranking: campanhas que a IA não cobriu
    // (ou além do teto do prompt) recebem a recomendação determinística.
    const recommendations = aggregates.ranking
      .map((row) => generativeById.get(row.id) ?? deterministicById.get(row.id))
      .filter((item): item is AndromedaRecommendation => Boolean(item));
    return { engine: "generative", model: result.model, recommendations };
  } catch {
    return fallback();
  }
}
