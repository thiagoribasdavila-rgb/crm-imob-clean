import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function hashMetaValue(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export type MetaConversionQueueOutcome =
  | { queued: true; eventId: string; reason?: undefined }
  | { queued: false; reason: string; eventId?: string };

export async function queueMetaConversion(input: { organizationId: string; leadId: string; eventName: string; eventId: string; occurredAt?: string; customData?: Record<string, unknown>; internalOnly?: string | null }): Promise<MetaConversionQueueOutcome> {
  const admin = getSupabaseAdmin();
  const { data: config } = await admin.from("meta_conversion_configs").select("enabled,mode,consent_required").eq("organization_id", input.organizationId).maybeSingle();
  if (!config?.enabled || config.mode !== "test") return { queued: false, reason: "conversion_test_disabled" };
  const { data: lead } = await admin.from("leads").select("metadata").eq("id", input.leadId).eq("organization_id", input.organizationId).maybeSingle();
  const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
  if (config.consent_required && meta.dataSharingConsent !== true) return { queued: false, reason: "consent_required" };
  const internalOnly = String(input.internalOnly ?? "").trim() || null;
  const { data: event, error } = await admin.from("meta_conversion_events").upsert({ organization_id: input.organizationId, lead_id: input.leadId, event_name: input.eventName, event_id: input.eventId, action_source: "system_generated", status: internalOnly ? "blocked" : "pending", custom_data: { ...(input.customData ?? {}), ...(internalOnly ? { internal_only: true, internal_only_reason: internalOnly } : {}) }, occurred_at: input.occurredAt ?? new Date().toISOString() }, { onConflict: "organization_id,event_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  if (!event) return { queued: false, reason: "duplicate" };
  // Registro interno: a linha existe para contagem e auditoria, mas NÃO ganha
  // tarefa no outbox — sem tarefa, nada sai para a Meta. É aqui que "registrar"
  // e "enviar" deixam de ser a mesma decisão.
  if (internalOnly) return { queued: false, reason: `internal_only:${internalOnly}`, eventId: event.id };
  await admin.from("integration_outbox").insert({ organization_id: input.organizationId, topic: "meta.conversion.send", aggregate_type: "meta_conversion_event", aggregate_id: event.id, payload: { eventId: input.eventId } });
  return { queued: true, eventId: event.id };
}

const STAGE_EVENTS: Record<string, string> = {
  contato: "Contact",
  qualificacao: "QualifiedLead",
  visita: "Schedule",
  proposta: "SubmitApplication",
  ganho: "ConvertedLead",
};

const STAGE_RANK: Record<string, number> = { novo: 0, contato: 1, qualificacao: 2, visita: 3, proposta: 4, contrato: 5, ganho: 6 };

// Por que estas duas etapas continuam sendo REGISTRADAS e param de ser ENVIADAS:
//
//   - "qualificacao" é arrasto de card no funil. Enviar QualifiedLead a partir
//     dele ensina a Meta que qualificado é clique de tela, e o mesmo event_id
//     seria disputado com o sinal que exige lastro comercial (visita, proposta,
//     contrato, ganho) emitido pelo capi-export. Sinal fraco chegando primeiro
//     apaga o forte, porque a Meta mantém um só por event_id.
//   - "ganho" sairia com custom_data sem value/currency, e conversão sem valor
//     ensina que venda vale R$ 0 — a otimização passa a caçar tráfego barato.
//     Hoje o CRM não tem fonte de valor APURADO de venda (a tabela opportunities
//     não existe no banco de produção e nenhum caminho do repositório a
//     escreve), então a única saída honesta é não afirmar valor nenhum.
//
// Apagar as chaves do mapa zeraria as contagens por event_name lidas em
// /api/v1/revenue-engine e no andromeda-loop — o funil do diretor mostraria
// 0 qualificados e 0 vendas, indistinguível de "ninguém qualificou". Por isso a
// linha continua nascendo (status blocked), e é ELA que deve ser promovida
// quando houver lastro/valor: não crie outro event_id para a mesma etapa.
const INTERNAL_ONLY_STAGES: Record<string, string> = {
  qualificacao: "qualificacao_de_funil_sem_lastro_comercial",
  ganho: "venda_sem_valor_apurado",
};

export async function queueMetaStageConversion(input: { organizationId: string; leadId: string; previousStage: string; stage: string; occurredAt?: string }) {
  const normalizedStage = input.stage.trim().toLowerCase();
  const normalizedPrevious = input.previousStage.trim().toLowerCase();
  const eventName = STAGE_EVENTS[normalizedStage];
  if (!eventName || normalizedPrevious === normalizedStage) return { queued: false, reason: "stage_not_eligible" };
  const previousRank = STAGE_RANK[normalizedPrevious];
  const stageRank = STAGE_RANK[normalizedStage];
  if (previousRank === undefined || stageRank === undefined || stageRank <= previousRank) return { queued: false, reason: "not_forward_progression" };
  return queueMetaConversion({
    organizationId: input.organizationId,
    leadId: input.leadId,
    eventName,
    eventId: `crm-stage-${input.leadId}-${normalizedStage}`,
    occurredAt: input.occurredAt,
    customData: { crm_stage: normalizedStage, previous_crm_stage: normalizedPrevious, stage_rank: stageRank },
    internalOnly: INTERNAL_ONLY_STAGES[normalizedStage] ?? null,
  });
}
