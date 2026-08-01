// lib/atlas/scoring-engine.ts
// -----------------------------------------------------------------------------
// Motor de scoring unificado do Atlas v3.
//
// Consolida, num único ponto versionado, os dois scorers que hoje vivem
// separados:
//   1. Score determinístico e explicável (antes em lib/atlas/scoring.ts)
//      -> componentes com pontos + reasons, ideal para exibição e auditoria.
//   2. Predição probabilística de conversão "atlas-predictive-v2"
//      (lib/ai/conversion-predictor.ts) -> hoje órfã, aqui reconectada.
//
// Substitui e torna obsoletos:
//   - lib/ai/LeadScoreEngine.ts   (duplicado morto; colisão de nome)
//   - lib/ai/lead-scoring.ts      (wrapper órfão de predictConversionDetailed)
//
// Persistência-alvo: public.lead_scores (campos: score, temperature,
// components jsonb, version, conversion jsonb). requiresHumanReview sempre true.
// -----------------------------------------------------------------------------

import type { AtlasLead } from "@/types/atlas";
import {
  predictConversionDetailed,
  type ConversionPrediction,
  type ConversionSignals,
} from "@/lib/ai/conversion-predictor";

/** Versão do motor unificado. Grave junto do score para rastreabilidade. */
export const LEAD_SCORE_ENGINE_VERSION = "atlas-scoring-v3.0" as const;

export type LeadTemperature = "frio" | "morno" | "quente";

export interface DeterministicComponent {
  key: string;
  label: string;
  points: number;
}

export interface DeterministicScore {
  score: number; // 0..100
  temperature: LeadTemperature;
  components: DeterministicComponent[];
  reasons: string[];
}

export interface UnifiedLeadScore {
  version: typeof LEAD_SCORE_ENGINE_VERSION;
  // --- camada determinística (explicável) ---
  score: number;
  temperature: LeadTemperature;
  components: DeterministicComponent[];
  reasons: string[];
  // --- camada probabilística (predição de conversão) ---
  conversion: ConversionPrediction;
  // --- governança ---
  requiresHumanReview: true;
}

// -----------------------------------------------------------------------------
// Regras determinísticas (fonte única — antes espalhadas em lib/atlas/scoring.ts)
// -----------------------------------------------------------------------------
const DETERMINISTIC_RULES: ReadonlyArray<{
  key: string;
  label: string;
  points: number;
  test: (lead: Partial<AtlasLead>) => boolean;
}> = [
  { key: "email", label: "E-mail informado", points: 10, test: (l) => Boolean(l.email) },
  { key: "phone", label: "Telefone informado", points: 15, test: (l) => Boolean(l.phone) },
  { key: "budget", label: "Orçamento definido", points: 20, test: (l) => Boolean(l.budgetMax && l.budgetMax > 0) },
  { key: "regions", label: "Região de interesse definida", points: 10, test: (l) => Boolean(l.preferredRegions?.length) },
  { key: "bedrooms", label: "Tipologia definida", points: 5, test: (l) => Boolean(l.bedrooms) },
  { key: "purpose", label: "Objetivo de compra definido", points: 10, test: (l) => Boolean(l.purpose) },
  { key: "interaction", label: "Já houve interação", points: 15, test: (l) => Boolean(l.lastInteractionAt) },
  { key: "nextAction", label: "Próxima ação agendada", points: 5, test: (l) => Boolean(l.nextActionAt) },
  {
    key: "funnel",
    label: "Lead avançado no funil",
    points: 20,
    test: (l) => ["visita", "proposta", "contrato"].includes(String(l.status ?? "")),
  },
];

/** Calcula o score determinístico com o detalhamento dos componentes. */
export function computeDeterministic(lead: Partial<AtlasLead>): DeterministicScore {
  const components: DeterministicComponent[] = [];
  let score = 0;
  for (const rule of DETERMINISTIC_RULES) {
    if (rule.test(lead)) {
      score += rule.points;
      components.push({ key: rule.key, label: rule.label, points: rule.points });
    }
  }
  score = Math.min(100, score);
  const temperature: LeadTemperature = score >= 70 ? "quente" : score >= 35 ? "morno" : "frio";
  return { score, temperature, components, reasons: components.map((c) => c.label) };
}

// -----------------------------------------------------------------------------
// Ponte AtlasLead -> sinais do preditor probabilístico
// -----------------------------------------------------------------------------
const daysBetween = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

const isOverdue = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t < Date.now();
};

/**
 * Mapeia um AtlasLead + o score determinístico para os ConversionSignals.
 * Sinais ausentes no AtlasLead ficam null de propósito — o preditor os trata
 * como "missingSignals" e reduz a confiança, sem inventar valor.
 */
export function toConversionSignals(
  lead: Partial<AtlasLead>,
  deterministicScore: number,
): ConversionSignals {
  return {
    status: (lead.status as string | null) ?? null,
    stage: (lead.status as string | null) ?? null,
    score: deterministicScore,
    daysSinceLastInteraction: daysBetween(lead.lastInteractionAt),
    nextActionOverdue: lead.nextActionAt ? isOverdue(lead.nextActionAt) : null,
  };
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/** Resultado completo: determinístico + probabilístico, versionado. */
export function scoreLeadUnified(lead: Partial<AtlasLead>): UnifiedLeadScore {
  const det = computeDeterministic(lead);
  const conversion = predictConversionDetailed(toConversionSignals(lead, det.score));
  return {
    version: LEAD_SCORE_ENGINE_VERSION,
    score: det.score,
    temperature: det.temperature,
    components: det.components,
    reasons: det.reasons,
    conversion,
    requiresHumanReview: true,
  };
}

/** Linha pronta para gravar em public.lead_scores. */
export function toLeadScoreRow(leadId: string, organizationId: string, lead: Partial<AtlasLead>) {
  const unified = scoreLeadUnified(lead);
  return {
    lead_id: leadId,
    organization_id: organizationId,
    score: unified.score,
    temperature: unified.temperature,
    components: unified.components,
    conversion: unified.conversion,
    version: unified.version,
    computed_at: new Date().toISOString(),
  };
}

/**
 * COMPAT — mantém exatamente a assinatura/retorno do antigo
 * lib/atlas/scoring.ts (`{ score, temperature, reasons }`).
 * Permite religar os callers de produção trocando só o caminho do import,
 * sem mudar comportamento. Depois de migrados, prefira scoreLeadUnified.
 */
export function calculateLeadScore(lead: Partial<AtlasLead>): {
  score: number;
  temperature: LeadTemperature;
  reasons: string[];
} {
  const det = computeDeterministic(lead);
  return { score: det.score, temperature: det.temperature, reasons: det.reasons };
}
