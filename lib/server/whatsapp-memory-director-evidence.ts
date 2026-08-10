import "server-only";

import {
  buildWhatsAppConversationContinuity,
  type WhatsAppConversationContinuityRow,
  type WhatsAppLeadOwnershipRow,
} from "@/lib/analytics/whatsapp-conversation-continuity";
import {
  buildWhatsAppLearningCaptureQuality,
  type WhatsAppLearningBehaviorRow,
  type WhatsAppLearningConversationRow,
  type WhatsAppLearningLineRow,
  type WhatsAppLearningMessageRow,
} from "@/lib/analytics/whatsapp-learning-capture-quality";
import {
  buildAiCommercialContextReadiness,
  type CommercialContextMemoryRow,
} from "@/lib/analytics/ai-commercial-context-readiness";
import { buildWhatsAppMemoryHumanReview } from "@/lib/analytics/whatsapp-memory-human-review";
import { buildWhatsAppMemoryReleaseGate } from "@/lib/analytics/whatsapp-memory-release-gate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;
const OBSERVED_LIMIT = 5_000;

export class WhatsAppMemoryEvidenceLoadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WhatsAppMemoryEvidenceLoadError";
  }
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadContinuity(organizationId: string) {
  const admin = getSupabaseAdmin();
  const countResult = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp");
  if (countResult.error) throw new WhatsAppMemoryEvidenceLoadError("CONTINUITY_COUNT_FAILED");

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const conversations: WhatsAppConversationContinuityRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("conversations")
      .select("id,lead_id,assigned_to,status,last_message_at,unread_count,created_at")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) throw new WhatsAppMemoryEvidenceLoadError("CONTINUITY_READ_FAILED");
    conversations.push(...((page.data ?? []) as WhatsAppConversationContinuityRow[]));
  }

  const leadIds = [...new Set(conversations.map((row) => row.lead_id).filter((id): id is string => Boolean(id)))];
  const leads: WhatsAppLeadOwnershipRow[] = [];
  for (const ids of chunks(leadIds, 200)) {
    const result = await admin
      .from("leads")
      .select("id,assigned_to")
      .eq("organization_id", organizationId)
      .in("id", ids);
    if (result.error) throw new WhatsAppMemoryEvidenceLoadError("LEAD_OWNERSHIP_READ_FAILED");
    leads.push(...((result.data ?? []) as WhatsAppLeadOwnershipRow[]));
  }

  return buildWhatsAppConversationContinuity({
    conversations,
    leads,
    sourceTotal,
    observedLimit: OBSERVED_LIMIT,
  });
}

async function loadCapture(organizationId: string) {
  const admin = getSupabaseAdmin();
  const [countResult, linesResult] = await Promise.all([
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp"),
    admin
      .from("integrations")
      .select("status,config")
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp"),
  ]);
  if (countResult.error || linesResult.error) {
    throw new WhatsAppMemoryEvidenceLoadError("CAPTURE_SOURCE_READ_FAILED");
  }

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const messages: WhatsAppLearningMessageRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("messages")
      .select("id,conversation_id,direction,external_message_id,sent_at,created_at")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) throw new WhatsAppMemoryEvidenceLoadError("CAPTURE_MESSAGES_READ_FAILED");
    messages.push(...((page.data ?? []) as WhatsAppLearningMessageRow[]));
  }

  const conversationIds = [...new Set(messages.map((row) => row.conversation_id).filter((id): id is string => Boolean(id)))];
  const conversations: WhatsAppLearningConversationRow[] = [];
  for (const ids of chunks(conversationIds, 200)) {
    const result = await admin
      .from("conversations")
      .select("id,lead_id")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .in("id", ids);
    if (result.error) throw new WhatsAppMemoryEvidenceLoadError("CAPTURE_CONVERSATIONS_READ_FAILED");
    conversations.push(...((result.data ?? []) as WhatsAppLearningConversationRow[]));
  }

  const behaviorEvents: WhatsAppLearningBehaviorRow[] = [];
  for (const ids of chunks(messages.map((row) => row.id), 200)) {
    const result = await admin
      .from("lead_behavior_events")
      .select("source_id,event_name")
      .eq("organization_id", organizationId)
      .eq("source_table", "messages")
      .in("event_name", ["message_inbound", "message_outbound", "message_read"])
      .in("source_id", ids);
    if (result.error) throw new WhatsAppMemoryEvidenceLoadError("CAPTURE_EVENTS_READ_FAILED");
    behaviorEvents.push(...((result.data ?? []) as WhatsAppLearningBehaviorRow[]));
  }

  return buildWhatsAppLearningCaptureQuality({
    messages,
    conversations,
    behaviorEvents,
    lines: (linesResult.data ?? []) as WhatsAppLearningLineRow[],
    sourceTotal,
    observedLimit: OBSERVED_LIMIT,
  });
}

async function loadCommercialContext(organizationId: string) {
  const admin = getSupabaseAdmin();
  const countResult = await admin
    .from("lead_commercial_memory_states")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (countResult.error) throw new WhatsAppMemoryEvidenceLoadError("COMMERCIAL_CONTEXT_COUNT_FAILED");

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const memories: CommercialContextMemoryRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("lead_commercial_memory_states")
      .select("development_id,stage_key,broker_id,recommended_action_key,interaction_count,last_interaction_at,expires_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) throw new WhatsAppMemoryEvidenceLoadError("COMMERCIAL_CONTEXT_READ_FAILED");
    memories.push(...((page.data ?? []) as CommercialContextMemoryRow[]));
  }

  return buildAiCommercialContextReadiness({
    memories,
    sourceTotal,
    observedLimit: OBSERVED_LIMIT,
  });
}

export async function loadWhatsAppMemoryDirectorEvidence(organizationId: string) {
  const [continuity, capture, context] = await Promise.all([
    loadContinuity(organizationId),
    loadCapture(organizationId),
    loadCommercialContext(organizationId),
  ]);
  const gate = buildWhatsAppMemoryReleaseGate({ continuity, capture, context });
  const review = buildWhatsAppMemoryHumanReview(gate);
  return { continuity, capture, context, gate, review };
}
