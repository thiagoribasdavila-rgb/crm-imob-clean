import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { queueMetaConversion } from "@/lib/meta/conversions";
import {
  buildMetaTestEventId,
  fingerprintMetaTestDeliveryReceipt,
  META_TEST_DELIVERY_CONFIRMATION,
  META_TEST_DELIVERY_SCHEMA,
  META_TEST_DELIVERY_SCOPE,
  type MetaTestDeliveryReceipt,
} from "@/lib/meta/test-delivery";
import {
  fingerprintFrozenMetaTestPayload,
  fingerprintMetaCandidate,
  META_TEST_PAYLOAD_SCHEMA,
  type FrozenMetaTestPayload,
} from "@/lib/meta/test-event-payload";
import {
  buildMetaLeadCandidate,
  isMetaLeadReadyForDirectorApproval,
  metaLeadSelect,
  type MetaLeadRecord,
} from "@/lib/meta/test-lead-candidate";
import {
  fingerprintMetaTestExecutionGate,
  META_TEST_EXECUTION_GATE_SCHEMA,
  type MetaTestExecutionGate,
} from "@/lib/meta/test-execution-gate";
import { claimIdempotency, completeIdempotency, requestFingerprint } from "@/lib/security/abuse-protection";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const gateEventType = "meta.test_lead.execution_authorized";
const deliveryEventType = "meta.test_lead.delivery_result";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/i;

type DeliveryBody = { confirmation?: unknown; gateFingerprint?: unknown; gateId?: unknown };
type GateEventPayload = MetaTestExecutionGate & { gateFingerprint?: string };
type FrozenEventPayload = {
  approvalId?: string;
  approvedContextFingerprint?: string;
  deliveryAuthorized?: boolean;
  externalEventSent?: boolean;
  frozenPayload?: FrozenMetaTestPayload;
  payloadFingerprint?: string;
  schemaVersion?: string;
};
type AtlasEvent<T> = { aggregate_id: string | null; id: string; occurred_at: string; payload: T | null };
type ConversionRow = {
  attempts: number | null;
  delivered_at: string | null;
  event_id: string;
  event_name: string;
  id: string;
  meta_response: Record<string, unknown> | null;
  status: string;
};

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

function deliveryReceipt(input: {
  conversion: ConversionRow;
  datasetId: string;
  gateFingerprint: string;
  gateId: string;
}): MetaTestDeliveryReceipt {
  const response = input.conversion.meta_response ?? {};
  if (
    input.conversion.status !== "delivered"
    || !input.conversion.delivered_at
    || Number(response.events_received) !== 1
  ) throw new Error("A Meta ainda não confirmou exatamente um evento no dataset de teste.");

  return {
    attempts: Number(input.conversion.attempts ?? 0),
    datasetIdMasked: `••••${input.datasetId.slice(-4)}`,
    deliveredAt: input.conversion.delivered_at,
    eventId: input.conversion.event_id,
    eventName: "Lead",
    eventsReceived: 1,
    externalEventSent: true,
    gateFingerprint: input.gateFingerprint,
    gateId: input.gateId,
    mode: "test",
    productionEnabled: false,
    schemaVersion: META_TEST_DELIVERY_SCHEMA,
    status: "delivered",
    traceId: typeof response.fbtrace_id === "string" ? response.fbtrace_id.slice(0, 255) : null,
  };
}

async function requireDirector(request: NextRequest, scope: string, limit: number) {
  const rate = enforceRateLimit(request, { limit, scope, windowMs: 60 * 60_000 });
  if (!rate.ok) return { ok: false as const, response: rate.response };
  const access = await requireAccessContext(request, { accessRoles: ["admin", "director_decisor", "director"] });
  if (!access.ok) return { ok: false as const, response: access.response };
  return { ok: true as const, access, headers: rate.headers };
}

export async function GET(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-deliveries-list", 30);
  if (!context.ok) return context.response;
  const result = await getSupabaseAdmin()
    .from("atlas_events")
    .select("id,aggregate_id,payload,occurred_at")
    .eq("organization_id", context.access.access.organization.id)
    .eq("event_type", deliveryEventType)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (result.error) return jsonError("META_TEST_RECEIPTS_UNAVAILABLE", "Não foi possível consultar os recibos agora.", 503, context.headers);
  return NextResponse.json({ data: { deliveries: result.data ?? [] } }, { headers: context.headers });
}

export async function POST(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-deliveries-create", 2);
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null) as DeliveryBody | null;
  const gateId = typeof body?.gateId === "string" ? body.gateId.trim() : "";
  const gateFingerprint = typeof body?.gateFingerprint === "string" ? body.gateFingerprint.trim().toLowerCase() : "";
  if (!uuidPattern.test(gateId) || !fingerprintPattern.test(gateFingerprint)) {
    return jsonError("INVALID_EXECUTION_GATE", "Selecione um gate Meta válido.", 400, context.headers);
  }
  if (body?.confirmation !== META_TEST_DELIVERY_CONFIRMATION) {
    return jsonError("EXPLICIT_DELIVERY_CONFIRMATION_REQUIRED", "Confirme explicitamente o envio único ao dataset de teste.", 400, context.headers);
  }

  const organizationId = context.access.access.organization.id;
  const admin = getSupabaseAdmin();
  try {
    const gateResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", gateEventType)
      .eq("id", gateId)
      .maybeSingle();
    if (gateResult.error) throw gateResult.error;
    const gateEvent = gateResult.data as unknown as AtlasEvent<GateEventPayload> | null;
    const gatePayload = gateEvent?.payload ?? null;
    const storedFingerprint = gatePayload?.gateFingerprint ?? "";
    const gateForFingerprint = gatePayload ? {
      approvalId: gatePayload.approvalId,
      authorizationScope: gatePayload.authorizationScope,
      deliveryAuthorized: gatePayload.deliveryAuthorized,
      dryRunApproved: gatePayload.dryRunApproved,
      dryRunChecks: gatePayload.dryRunChecks,
      executionStatus: gatePayload.executionStatus,
      expiresAt: gatePayload.expiresAt,
      externalEventSent: gatePayload.externalEventSent,
      frozenPayloadId: gatePayload.frozenPayloadId,
      idempotencyKey: gatePayload.idempotencyKey,
      maxDeliveries: gatePayload.maxDeliveries,
      payloadFingerprint: gatePayload.payloadFingerprint,
      schemaVersion: gatePayload.schemaVersion,
    } : null;
    if (
      !gateEvent?.aggregate_id
      || !gatePayload
      || gatePayload.schemaVersion !== META_TEST_EXECUTION_GATE_SCHEMA
      || gatePayload.deliveryAuthorized !== true
      || gatePayload.dryRunApproved !== true
      || gatePayload.externalEventSent !== false
      || gatePayload.maxDeliveries !== 1
      || Date.parse(gatePayload.expiresAt) <= Date.now()
      || storedFingerprint !== gateFingerprint
      || !gateForFingerprint
      || fingerprintMetaTestExecutionGate(gateForFingerprint) !== gateFingerprint
    ) return jsonError("EXECUTION_GATE_INVALID", "O gate expirou, já foi consumido ou perdeu integridade.", 409, context.headers);

    const [{ data: config }, { data: lead }, frozenResult] = await Promise.all([
      admin.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").eq("organization_id", organizationId).maybeSingle(),
      admin.from("leads").select(metaLeadSelect).eq("id", gateEvent.aggregate_id).eq("organization_id", organizationId).maybeSingle(),
      admin
        .from("atlas_events")
        .select("id,aggregate_id,payload,occurred_at")
        .eq("organization_id", organizationId)
        .eq("event_type", "meta.test_lead.payload_frozen")
        .eq("id", gatePayload.frozenPayloadId)
        .maybeSingle(),
    ]);
    if (frozenResult.error) throw frozenResult.error;
    const frozenEvent = frozenResult.data as unknown as AtlasEvent<FrozenEventPayload> | null;
    const frozenReceipt = frozenEvent?.payload ?? null;
    const frozenPayload = frozenReceipt?.frozenPayload;
    const candidate = lead ? buildMetaLeadCandidate(lead as unknown as MetaLeadRecord) : null;
    if (
      !frozenEvent
      || frozenEvent.aggregate_id !== gateEvent.aggregate_id
      || frozenReceipt?.schemaVersion !== META_TEST_PAYLOAD_SCHEMA
      || frozenReceipt.deliveryAuthorized === true
      || frozenReceipt.externalEventSent === true
      || frozenReceipt.payloadFingerprint !== gatePayload.payloadFingerprint
      || !frozenPayload
      || frozenPayload.leadId !== gateEvent.aggregate_id
      || frozenPayload.approvalId !== gatePayload.approvalId
      || fingerprintFrozenMetaTestPayload(frozenPayload) !== gatePayload.payloadFingerprint
      || !candidate
      || !isMetaLeadReadyForDirectorApproval(candidate)
      || fingerprintMetaCandidate(candidate) !== frozenPayload.approvedContextFingerprint
    ) {
      return jsonError("FROZEN_CONTEXT_CHANGED", "A lead ou o payload mudou após a aprovação. Gere uma nova cadeia de autorização.", 409, context.headers);
    }
    const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
    const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
    if (!config?.enabled || config.mode !== "test" || !config.test_event_code || !config.dataset_id) {
      return jsonError("META_TEST_MODE_REQUIRED", "Ative o dataset e o código de teste antes do envio.", 409, context.headers);
    }
    if (!process.env.META_CONVERSIONS_ACCESS_TOKEN || !process.env.ATLAS_CRON_SECRET || !/^https:\/\//i.test(process.env.ATLAS_BASE_URL ?? "")) {
      return jsonError("META_CAPI_NOT_READY", "A conexão Meta, o worker ou a URL HTTPS ainda não estão prontos.", 503, context.headers);
    }
    if (!lead || lead.source !== "Meta Lead Ads" || meta.dataSharingConsent !== true || (!lead.email && !lead.phone)) {
      return jsonError("LEAD_NOT_ELIGIBLE", "A lead precisa ser da Meta, ter identificador e consentimento registrado.", 409, context.headers);
    }

    const eventId = buildMetaTestEventId(gatePayload.idempotencyKey);
    const requestHash = requestFingerprint({ confirmation: body?.confirmation, eventId, gateFingerprint, gateId });
    const claim = await claimIdempotency({ organizationId, scope: META_TEST_DELIVERY_SCOPE, key: gatePayload.idempotencyKey, requestHash });
    if (claim.state !== "claimed") return claim.response;

    let conversionResult = await admin
      .from("meta_conversion_events")
      .select("id,event_id,event_name,status,attempts,delivered_at,meta_response")
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (conversionResult.error) throw conversionResult.error;
    if (!conversionResult.data) {
      const queued = await queueMetaConversion({
        customData: { atlas_governed_test: true, gate_id: gateId, signal_version: "andromeda-v1" },
        eventId,
        eventName: "Lead",
        leadId: gateEvent.aggregate_id,
        organizationId,
      });
      if (!queued.queued) throw new Error(`Evento não enfileirado: ${queued.reason ?? "indisponível"}`);
    }

    if (conversionResult.data?.status !== "delivered") {
      const baseUrl = (process.env.ATLAS_BASE_URL ?? "").replace(/\/$/, "");
      const worker = await fetch(`${baseUrl}/api/v2/outbox/process`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${process.env.ATLAS_CRON_SECRET}` },
        method: "POST",
      });
      if (!worker.ok) throw new Error(`Worker HTTP ${worker.status}`);
      conversionResult = await admin
        .from("meta_conversion_events")
        .select("id,event_id,event_name,status,attempts,delivered_at,meta_response")
        .eq("organization_id", organizationId)
        .eq("event_id", eventId)
        .single();
      if (conversionResult.error) throw conversionResult.error;
    }

    const receipt = deliveryReceipt({ conversion: conversionResult.data as ConversionRow, datasetId: config.dataset_id, gateFingerprint, gateId });
    const receiptFingerprint = fingerprintMetaTestDeliveryReceipt(receipt);
    const existingReceipt = await admin
      .from("atlas_events")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("event_type", deliveryEventType)
      .eq("aggregate_id", gateEvent.aggregate_id)
      .contains("payload", { gateId })
      .maybeSingle();
    if (existingReceipt.error) throw existingReceipt.error;
    if (!existingReceipt.data) {
      const inserted = await admin.from("atlas_events").insert({
        aggregate_id: gateEvent.aggregate_id,
        aggregate_type: "lead",
        correlation_id: crypto.randomUUID(),
        event_type: deliveryEventType,
        organization_id: organizationId,
        payload: { ...receipt, deliveredBy: context.access.access.profile.id, receiptFingerprint },
        source: "meta.controlled-test-delivery",
      });
      if (inserted.error) throw inserted.error;
    }
    const responseBody = { data: { delivery: receipt, reused: Boolean(existingReceipt.data) } };
    await completeIdempotency({ organizationId, scope: META_TEST_DELIVERY_SCOPE, key: gatePayload.idempotencyKey, requestHash, status: 201, body: responseBody });
    return NextResponse.json(responseBody, { headers: context.headers, status: 201 });
  } catch {
    return jsonError("META_CONTROLLED_TEST_FAILED", "O envio controlado não obteve confirmação. Consulte os logs seguros antes de repetir.", 502, context.headers);
  }
}
