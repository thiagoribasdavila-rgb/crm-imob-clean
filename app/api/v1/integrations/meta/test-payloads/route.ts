import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildFrozenMetaTestPayload,
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
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const approvalEventType = "meta.test_lead.approved";
const frozenEventType = "meta.test_lead.payload_frozen";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FreezeBody = { approvalId?: unknown };
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
  frozenBy?: string;
  frozenPayload?: FrozenMetaTestPayload;
  payloadFingerprint?: string;
  schemaVersion?: string;
};
type AtlasEvent<T> = {
  aggregate_id: string | null;
  id: string;
  occurred_at: string;
  payload: T | null;
};

function toReceipt(event: AtlasEvent<FrozenReceiptPayload>) {
  const payload = event.payload ?? {};
  return {
    approvalId: payload.approvalId ?? "",
    approvedContextFingerprint: payload.approvedContextFingerprint ?? "",
    deliveryAuthorized: payload.deliveryAuthorized === true,
    expiresAt: payload.expiresAt ?? null,
    externalEventSent: payload.externalEventSent === true,
    frozenAt: event.occurred_at,
    frozenBy: payload.frozenBy ?? "diretoria",
    frozenPayload: payload.frozenPayload ?? null,
    id: event.id,
    leadId: event.aggregate_id,
    payloadFingerprint: payload.payloadFingerprint ?? "",
    schemaVersion: payload.schemaVersion ?? META_TEST_PAYLOAD_SCHEMA,
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
  const context = await requireDirector(request, "meta-test-payloads-list", 30);
  if (!context.ok) return context.response;

  try {
    const admin = getSupabaseAdmin();
    const result = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", context.access.access.organization.id)
      .eq("event_type", frozenEventType)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (result.error) throw result.error;

    return NextResponse.json({
      data: {
        payloads: ((result.data ?? []) as unknown as AtlasEvent<FrozenReceiptPayload>[]).map(toReceipt),
      },
    }, { headers: context.headers });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_PAYLOADS_UNAVAILABLE",
        message: "Não foi possível consultar os payloads congelados agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-payloads-create", 10);
  if (!context.ok) return context.response;

  let body: FreezeBody;
  try {
    body = await request.json() as FreezeBody;
  } catch {
    return NextResponse.json({
      error: { code: "INVALID_JSON", message: "Envie uma solicitação JSON válida." },
    }, { headers: context.headers, status: 400 });
  }

  const approvalId = typeof body.approvalId === "string" ? body.approvalId.trim() : "";
  if (!uuidPattern.test(approvalId)) {
    return NextResponse.json({
      error: { code: "INVALID_APPROVAL", message: "Selecione uma aprovação Meta válida." },
    }, { headers: context.headers, status: 400 });
  }

  const organizationId = context.access.access.organization.id;
  const admin = getSupabaseAdmin();

  try {
    const approvalResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", approvalEventType)
      .eq("id", approvalId)
      .maybeSingle();
    if (approvalResult.error) throw approvalResult.error;
    if (!approvalResult.data) {
      return NextResponse.json({
        error: { code: "APPROVAL_NOT_FOUND", message: "A aprovação não pertence à organização atual ou não existe." },
      }, { headers: context.headers, status: 404 });
    }

    const approval = approvalResult.data as unknown as AtlasEvent<ApprovalPayload>;
    const approvalPayload = approval.payload ?? {};
    const expiresAt = approvalPayload.expiresAt ?? "";
    const expiresAtMs = Date.parse(expiresAt);
    const approvedContextFingerprint = approvalPayload.candidateFingerprint ?? "";
    if (
      !approval.aggregate_id
      || !approvedContextFingerprint
      || !expiresAt
      || !Number.isFinite(expiresAtMs)
      || expiresAtMs <= Date.now()
      || approvalPayload.deliveryAuthorized === true
      || approvalPayload.externalEventSent === true
    ) {
      return NextResponse.json({
        error: { code: "APPROVAL_NOT_ACTIVE", message: "A aprovação expirou ou não atende aos guardrails do ensaio." },
      }, { headers: context.headers, status: 409 });
    }

    const existingResult = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", frozenEventType)
      .eq("aggregate_id", approval.aggregate_id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (existingResult.error) throw existingResult.error;
    const existing = ((existingResult.data ?? []) as unknown as AtlasEvent<FrozenReceiptPayload>[])
      .find((event) => event.payload?.approvalId === approvalId);
    if (existing) {
      return NextResponse.json({
        data: { payload: toReceipt(existing), reused: true },
      }, { headers: context.headers });
    }

    const leadResult = await context.access.supabase
      .from("leads")
      .select(metaLeadSelect)
      .eq("organization_id", organizationId)
      .eq("id", approval.aggregate_id)
      .maybeSingle();
    if (leadResult.error) throw leadResult.error;
    if (!leadResult.data) {
      return NextResponse.json({
        error: { code: "LEAD_NOT_FOUND", message: "A lead aprovada não está mais disponível nesta organização." },
      }, { headers: context.headers, status: 404 });
    }

    const candidate = buildMetaLeadCandidate(leadResult.data as unknown as MetaLeadRecord);
    if (!isMetaLeadReadyForDirectorApproval(candidate)) {
      return NextResponse.json({
        error: { code: "LEAD_NOT_READY", message: "A lead deixou de atender aos critérios do ensaio controlado." },
      }, { headers: context.headers, status: 409 });
    }
    if (fingerprintMetaCandidate(candidate) !== approvedContextFingerprint) {
      return NextResponse.json({
        error: { code: "APPROVED_CONTEXT_CHANGED", message: "Os dados elegíveis mudaram após a aprovação. Revise e aprove novamente." },
      }, { headers: context.headers, status: 409 });
    }

    const frozenPayload = buildFrozenMetaTestPayload(candidate, approvalId, approvedContextFingerprint);
    const payloadFingerprint = fingerprintFrozenMetaTestPayload(frozenPayload);
    const receiptPayload: FrozenReceiptPayload = {
      approvalId,
      approvedContextFingerprint,
      deliveryAuthorized: false,
      expiresAt,
      externalEventSent: false,
      frozenBy: context.access.access.profile.id,
      frozenPayload,
      payloadFingerprint,
      schemaVersion: META_TEST_PAYLOAD_SCHEMA,
    };
    const inserted = await admin
      .from("atlas_events")
      .insert({
        aggregate_id: approval.aggregate_id,
        aggregate_type: "lead",
        correlation_id: crypto.randomUUID(),
        event_type: frozenEventType,
        organization_id: organizationId,
        payload: receiptPayload,
        source: "meta.payload-freeze",
      })
      .select("id,aggregate_id,payload,occurred_at")
      .single();
    if (inserted.error) throw inserted.error;

    return NextResponse.json({
      data: {
        payload: toReceipt(inserted.data as unknown as AtlasEvent<FrozenReceiptPayload>),
        reused: false,
      },
    }, { headers: context.headers, status: 201 });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_PAYLOAD_FREEZE_FAILED",
        message: "Não foi possível congelar o payload governado agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}
