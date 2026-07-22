import { options, type QualificationProfile } from "@/lib/ai/conversational-qualification";

// Memória comercial estruturada: transforma o contexto governado (e a qualificação
// confirmada pelo corretor) nas chaves da RPC record_structured_copilot_memory.
// Prazo e forma de pagamento NUNCA são inferidos pela IA — só entram quando o
// cliente declarou e o corretor confirmou. Sem confirmação, permanecem 'unknown':
// ausência explicada, nunca preenchida por palpite.

type LeadContext = { stage?: unknown; purpose?: unknown; nextActionStatus?: unknown; behavior?: { visits?: number; proposals?: number }; dataQualityPercent?: number; score?: number };
type ConfirmedField = "purpose" | "timeline" | "financing";

const MEMORY_INTENTS = ["moradia", "investimento", "renda", "revenda"];

const stageAction = (stage: string, lead: LeadContext) =>
  stage === "proposta" || stage === "contrato" ? "follow_proposal"
  : stage === "visita" ? "confirm_visit"
  : (lead.behavior?.visits || 0) > 0 ? "present"
  : stage === "qualificacao" ? "present"
  : stage === "contato" ? "qualify"
  : "contact";

export function structuredMemoryFromGovernedContext(sections: Record<string, unknown>, confirmed?: QualificationProfile | null) {
  const lead = (sections.lead || {}) as LeadContext;
  const project = (sections.project || null) as Record<string, unknown> | null;
  const stage = String(lead.stage || "novo").toLowerCase();
  const signals = [
    Number(lead.score) >= 70 ? "score_high" : Number(lead.score) < 35 ? "score_low" : null,
    ["visita", "proposta", "contrato"].includes(stage) ? "stage_advanced" : null,
    (lead.behavior?.visits || 0) > 0 ? "visit_signal" : null,
    (lead.behavior?.proposals || 0) > 0 ? "proposal_signal" : null,
    Number(lead.dataQualityPercent) >= 80 ? "data_quality_high" : Number(lead.dataQualityPercent) < 50 ? "data_quality_low" : null,
    lead.nextActionStatus === "overdue" ? "next_action_overdue" : null,
  ].filter((value): value is string => Boolean(value));

  const brokerConfirmedKeys: string[] = [];
  const rejectedQualificationKeys: string[] = [];
  // As colunas de destino são NOT NULL com CHECK, mas lead_qualification_profiles não
  // tem CHECK em nível de tabela: um valor gravado fora da taxonomia (service_role,
  // importação, migração futura) derrubaria a RPC inteira e faria o copiloto perder a
  // memória COMPLETA da interação por causa de um campo. Coagir aqui degrada só o campo.
  const takeConfirmed = (field: ConfirmedField, value: string | undefined) => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw || raw === "unknown") return null;
    if (!options[field].includes(raw)) {
      rejectedQualificationKeys.push(field);
      return null;
    }
    brokerConfirmedKeys.push(field);
    return raw;
  };

  const contextIntent = MEMORY_INTENTS.includes(String(lead.purpose)) ? String(lead.purpose) : null;

  return {
    // Objetivo confirmado pelo corretor prevalece sobre o campo do CRM; ambos usam o mesmo vocabulário.
    intentKey: takeConfirmed("purpose", confirmed?.purpose) ?? contextIntent ?? "unknown",
    timelineKey: takeConfirmed("timeline", confirmed?.timeline) ?? "unknown",
    financingKey: takeConfirmed("financing", confirmed?.financing) ?? "unknown",
    objectionKeys: [] as string[],
    signalKeys: [...new Set(signals)],
    stageKey: stage,
    actionKey: stageAction(stage, lead),
    developmentPresent: Boolean(project),
    brokerConfirmedKeys,
    rejectedQualificationKeys,
  };
}
