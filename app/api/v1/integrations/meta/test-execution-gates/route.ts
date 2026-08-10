import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildMetaTestExecutionGate,
  fingerprintMetaTestExecutionGate,
  META_TEST_EXECUTION_CONFIRMATION,
  META_TEST_EXECUTION_GATE_SCHEMA,
  type MetaTestExecutionGate,
} from "@/lib/meta/test-execution-gate";
import {
  fingerprintFrozenMetaTestPayload,
  META_TEST_PAYLOAD_SCHEMA,
  type FrozenMetaTestPayload,
} from "@/lib/meta/test-event-payload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const approvalEventType = "meta.test_lead.approved";
const frozenEventType = "meta.test_lead.payload_frozen";
const gateEventType = "meta.test_lead.execution_authorized";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/i;

type GateBody = {
  confirmation?: unknown;
  payloadFingerprint?: unknown;
  payloadId?: unknown;
};
type ApprovalPayload = {
  candidateFingerprint?: string;
  deliveryAuthorized?: boolean;
  expiresAt?: string;
  externalEventSent?: boolean;
};
type FrozenReceiptPayload = {
  approvalId?: string;
  approvedContextFingerprint?: string;
  deliveryAuthorized?: boolean;
  expiresAt?: string;
  externalEventSent?: boolean;
  frozenPayload?: FrozenMetaTestPayload;
  payloadFingerprint?: string;
  schemaVersion?: string;
};
type GateReceiptPayload = MetaTestExecutionGate & {
  authorizedBy?: string;
  gateFingerprint?: string;
};
type AtlasEvent<T> = {
  aggregate_id: string | null;
  id: string;
  occurred_at: string;
  payload: T | null;
};

function toReceipt(event: AtlasEvent<GateReceiptPayload>) {
  const payload = event.payload;
  return {
    approvalId: payload?.approvalId ?? "",
    authorizationScope: payload?.authorizationScope ?? "",
    authorizedAt: event.occurred_at,
    authorizedBy: payload?.authorizedBy ?? "diretoria",
    deliveryAuthorized: payload?.deliveryAuthorized === true,
    dryRunApproved: payload?.dryRunApproved === true,
    dryRunChecks: payload?.dryRunChecks ?? [],
    executionStatus: payload?.executionStatus ?? "authorized",
    expiresAt: payload?.expiresAt ?? null,
    externalEventSent: false,
    frozenPayloadId: payload?.frozenPayloadId ?? "",
    gateFingerprint: payload?.gateFingerprint ?? "",
    id: event.id,
    idempotencyKey: payload?.idempotencyKey ?? "",
    leadId: event.aggregate_id,
    maxDeliveries: payload?.maxDeliveries ?? 0,
    payloadFingerprint: payload?.payloadFingerprint ?? "",
    schemaVersion: payload?.schemaVersion ?? META_TEST_EXECUTION_GATE_SCHEMA,
  };
}

async function requireDirector(request: NextRequest, scope: string, limit: number) {
  const rate = enforceRateLimit(request, { limit, scope });
  if (!rate.ok) return { ok: false as const, response: rate.response };
  const access = await requireAccessContext(request, {
    accessRoles: ["admin", "director_decisor", "director"],
  });
  if (!access.ok) return { ok: false as const, response: access.response };
  return { ok: true as const, access, headers: rate.headers };
}

export async function GET(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-execution-gates-list", 30);
  if (!context.ok) return context.response;

  try {
    const result = await getSupabaseAdmin()
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", context.access.access.organization.id)
      .eq("event_type", gateEventType)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (result.error) throw result.error;

    return NextResponse.json({
      data: {
        gates: ((result.data ?? []) as unknown as AtlasEvent<GateReceiptPayload>[]).map(toReceipt),
      },
    }, { headers: context.headers });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_EXECUTION_GATES_UNAVAILABLE",
        message: "Não foi possível consultar as autorizações de execução agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-execution-gates-create", 5);
  if (!context.ok) return context.response;

  let body: GateBody;
  try {
    body = await request.json() as GateBody;
  } catch {
    return NextResponse.json({
      error: { code: "INVALID_JSON", message: "Envie uma solicitação JSON válida." },
    }, { headers: context.headers, status: 400 });
  }

  const payloadId = typeof body.payloadId === "string" ? body.payloadId.trim() : "";
  const payloadFingerprint = typeof body.payloadFingerprint === "string"
    ? body.payloadFingerprint.trim().toLowerCase()
    : "";
  if (!uuidPattern.test(payloadId) || !fingerprintPattern.test(payloadFingerprint)) {
    return NextResponse.json({
      error: { code: "INVALID_FROZEN_PAYLOAD", message: "Selecione um payload Meta congelado válido." },
    }, { headers: context.headers, status: 400 });
  }
  if (body.confirmation !== META_TEST_EXECUTION_CONFIRMATION) {
    return NextResponse.json({
      error: {
        code: "EXPLICIT_CONFIRMATION_REQUIRED",
        message: "A autorização explícita da diretoria é obrigatória para abrir o gate.",
      },
    }, { headers: context.headers, status: 400 });
  }

  const organizationId = context.access.access.organization.id;
  const admin = getSupabaseAdmin();

  try {
    const frozenResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", frozenEventType)
      .eq("id", payloadId)
      .maybeSingle();
    if (frozenResult.error) throw frozenResult.error;
    if (!frozenResult.data) {
      return NextResponse.json({
        error: { code: "FROZEN_PAYLOAD_NOT_FOUND", message: "O payload não pertence à organização atual ou não existe." },
      }, { headers: context.headers, status: 404 });
    }

    const frozen = frozenResult.data as unknown as AtlasEvent<FrozenReceiptPayload>;
    const frozenPayload = frozen.payload ?? {};
    const approvalId = frozenPayload.approvalId ?? "";
    const approvalExpiresAt = frozenPayload.expiresAt ?? "";
    const approvalExpiresAtMs = Date.parse(approvalExpiresAt);
    const approvedContextFingerprint = frozenPayload.approvedContextFingerprint ?? "";
    const payload = frozenPayload.frozenPayload;
    if (
      !frozen.aggregate_id
      || !uuidPattern.test(approvalId)
      || !Number.isFinite(approvalExpiresAtMs)
      || approvalExpiresAtMs <= Date.now()
      || frozenPayload.schemaVersion !== META_TEST_PAYLOAD_SCHEMA
      || frozenPayload.deliveryAuthorized === true
      || frozenPayload.externalEventSent === true
      || !payload
      || payload.deliveryAuthorized !== false
      || payload.externalEventSent !== false
      || payload.leadId !== frozen.aggregate_id
      || payload.approvalId !== approvalId
      || payload.approvedContextFingerprint !== approvedContextFingerprint
      || frozenPayload.payloadFingerprint !== payloadFingerprint
      || fingerprintFrozenMetaTestPayload(payload) !== payloadFingerprint
    ) {
      return NextResponse.json({
        error: { code: "FROZEN_PAYLOAD_INVALID", message: "O payload congelado expirou ou perdeu integridade. Gere uma nova aprovação." },
      }, { headers: context.headers, status: 409 });
    }

    const approvalResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", approvalEventType)
      .eq("id", approvalId)
      .maybeSingle();
    if (approvalResult.error) throw approvalResult.error;
    const approval = approvalResult.data as unknown as AtlasEvent<ApprovalPayload> | null;
    const approvalPayload = approval?.payload ?? {};
    if (
      !approval
      || approval.aggregate_id !== frozen.aggregate_id
      || approvalPayload.candidateFingerprint !== approvedContextFingerprint
      || approvalPayload.expiresAt !== approvalExpiresAt
      || !Number.isFinite(approvalExpiresAtMs)
      || approvalExpiresAtMs <= Date.now()
      || approvalPayload.deliveryAuthorized === true
      || approvalPayload.externalEventSent === true
    ) {
      return NextResponse.json({
        error: { code: "APPROVAL_NOT_ACTIVE", message: "A aprovação vinculada não está mais ativa." },
      }, { headers: context.headers, status: 409 });
    }

    const gate = buildMetaTestExecutionGate({
      approvalExpiresAt,
      approvalId,
      frozenPayloadId: payloadId,
      organizationId,
      payloadFingerprint,
    });
    const existingResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", gateEventType)
      .eq("aggregate_id", frozen.aggregate_id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (existingResult.error) throw existingResult.error;
    const existing = ((existingResult.data ?? []) as unknown as AtlasEvent<GateReceiptPayload>[])
      .find((event) => event.payload?.idempotencyKey === gate.idempotencyKey);
    if (existing) {
      return NextResponse.json({
        data: { gate: toReceipt(existing), reused: true },
      }, { headers: context.headers });
    }

    const gateFingerprint = fingerprintMetaTestExecutionGate(gate);
    const receiptPayload: GateReceiptPayload = {
      ...gate,
      authorizedBy: context.access.access.profile.id,
      gateFingerprint,
    };
    const inserted = await admin
      .from("atlas_events")
      .insert({
        aggregate_id: frozen.aggregate_id,
        aggregate_type: "lead",
        correlation_id: crypto.randomUUID(),
        event_type: gateEventType,
        organization_id: organizationId,
        payload: receiptPayload,
        source: "meta.execution-gate",
      })
      .select("id,aggregate_id,payload,occurred_at")
      .single();
    if (inserted.error) throw inserted.error;

    return NextResponse.json({
      data: {
        gate: toReceipt(inserted.data as unknown as AtlasEvent<GateReceiptPayload>),
        reused: false,
      },
    }, { headers: context.headers, status: 201 });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_EXECUTION_GATE_FAILED",
        message: "Não foi possível abrir o gate controlado agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}
