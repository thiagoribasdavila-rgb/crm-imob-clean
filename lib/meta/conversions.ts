import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function hashMetaValue(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export async function queueMetaConversion(input: { organizationId: string; leadId: string; eventName: string; eventId: string; occurredAt?: string; customData?: Record<string, unknown> }) {
  const admin = getSupabaseAdmin();
  const { data: config } = await admin.from("meta_conversion_configs").select("enabled,mode,consent_required").eq("organization_id", input.organizationId).maybeSingle();
  if (!config?.enabled || config.mode !== "test") return { queued: false, reason: "conversion_test_disabled" };
  const { data: lead } = await admin.from("leads").select("metadata").eq("id", input.leadId).eq("organization_id", input.organizationId).maybeSingle();
  const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
  if (config.consent_required && meta.dataSharingConsent !== true) return { queued: false, reason: "consent_required" };
  const { data: event, error } = await admin.from("meta_conversion_events").upsert({ organization_id: input.organizationId, lead_id: input.leadId, event_name: input.eventName, event_id: input.eventId, action_source: "system_generated", status: "pending", custom_data: input.customData ?? {}, occurred_at: input.occurredAt ?? new Date().toISOString() }, { onConflict: "organization_id,event_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  if (!event) return { queued: false, reason: "duplicate" };
  await admin.from("integration_outbox").insert({ organization_id: input.organizationId, topic: "meta.conversion.send", aggregate_type: "meta_conversion_event", aggregate_id: event.id, payload: { eventId: input.eventId } });
  return { queued: true, eventId: event.id };
}
