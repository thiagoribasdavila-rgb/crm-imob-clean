import "server-only";

const SIGNALS = [
  ["preco", /pre[cç]o|valor|desconto|caro|barato/i],
  ["localizacao", /bairro|regi[aã]o|localiza[cç][aã]o|perto|dist[aâ]ncia/i],
  ["financiamento", /financi|cr[eé]dito|entrada|parcela|banco/i],
  ["disponibilidade", /unidade|estoque|dispon[ií]vel|planta/i],
  ["prazo", /prazo|entrega|mudan[cç]a|urg[eê]ncia/i],
  ["produto", /quarto|su[ií]te|vaga|metragem|andar|varanda/i],
  ["concorrencia", /concorr|outra incorporadora|outro empreendimento|outra imobili[aá]ria/i],
] as const;

export function extractFollowUpSignals(description: string, options?: { externalPurchase?: boolean }) {
  const normalized = description.trim().slice(0, 4000);
  const signals = SIGNALS.filter(([, pattern]) => pattern.test(normalized)).map(([signal]) => signal);
  return {
    ...(options?.externalPurchase ? { buyer_verified: true, purchase_outside_company: true } : {}),
    decision_signals: signals.length ? signals : ["motivo_nao_classificado"],
    description_present: normalized.length >= 10,
  };
}

export async function recordFollowUpIntelligence(input: { organizationId: string; leadId: string; activityId: string; description: string; occurredAt: string }) {
  const description = input.description.trim();
  if (description.length < 10) return { recorded: false, reason: "insufficient_context" };
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = getSupabaseAdmin();
  const signals = extractFollowUpSignals(description);
  const { error } = await admin.from("campaign_events").upsert({ organization_id: input.organizationId, lead_id: input.leadId, event_type: "follow_up_intelligence", source: "crm-followup", external_event_id: input.activityId, payload: signals, occurred_at: input.occurredAt }, { onConflict: "organization_id,source,external_event_id", ignoreDuplicates: true });
  if (error) throw error;
  return { recorded: true, signals: signals.decision_signals };
}
