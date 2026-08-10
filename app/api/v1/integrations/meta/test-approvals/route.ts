import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { fingerprintMetaCandidate } from "@/lib/meta/test-event-payload";
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
const approvalTtlMs = 24 * 60 * 60 * 1_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApprovalBody = {
  leadId?: unknown;
  reason?: unknown;
};

type ApprovalPayload = {
  approvedBy?: string;
  candidateFingerprint?: string;
  deliveryAuthorized?: boolean;
  expiresAt?: string;
  externalEventSent?: boolean;
  projectName?: string;
  readinessPct?: number;
  reason?: string;
  source?: string;
};

type ApprovalEvent = {
  aggregate_id: string | null;
  id: string;
  occurred_at: string;
  payload: ApprovalPayload | null;
};

function toReceipt(event: ApprovalEvent) {
  const payload = event.payload ?? {};
  return {
    approvedAt: event.occurred_at,
    approvedBy: payload.approvedBy ?? "diretoria",
    candidateFingerprint: payload.candidateFingerprint ?? "",
    deliveryAuthorized: payload.deliveryAuthorized === true,
    expiresAt: payload.expiresAt ?? null,
    externalEventSent: payload.externalEventSent === true,
    id: event.id,
    leadId: event.aggregate_id,
    projectName: payload.projectName ?? "Projeto não informado",
    readinessPct: payload.readinessPct ?? 0,
    reason: payload.reason ?? "",
    source: payload.source ?? "Meta",
  };
}

function isUnexpired(event: ApprovalEvent) {
  const expiresAt = event.payload?.expiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) > Date.now());
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
  const context = await requireDirector(request, "meta-test-approvals-list", 30);
  if (!context.ok) return context.response;

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", context.access.access.organization.id)
      .eq("event_type", approvalEventType)
      .order("occurred_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    const approvals = ((data ?? []) as unknown as ApprovalEvent[]).map(toReceipt);

    return NextResponse.json({ data: { approvals } }, { headers: context.headers });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_APPROVALS_UNAVAILABLE",
        message: "Não foi possível consultar aprovações Meta agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const context = await requireDirector(request, "meta-test-approvals-create", 10);
  if (!context.ok) return context.response;

  let body: ApprovalBody;
  try {
    body = await request.json() as ApprovalBody;
  } catch {
    return NextResponse.json({
      error: { code: "INVALID_JSON", message: "Envie uma solicitação JSON válida." },
    }, { headers: context.headers, status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!uuidPattern.test(leadId)) {
    return NextResponse.json({
      error: { code: "INVALID_LEAD", message: "Selecione uma lead Meta válida." },
    }, { headers: context.headers, status: 400 });
  }
  if (reason.length < 10 || reason.length > 500) {
    return NextResponse.json({
      error: { code: "INVALID_REASON", message: "Registre uma justificativa entre 10 e 500 caracteres." },
    }, { headers: context.headers, status: 400 });
  }

  const organizationId = context.access.access.organization.id;
  const admin = getSupabaseAdmin();

  try {
    const existing = await admin
      .from("atlas_events")
      .select("id,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", approvalEventType)
      .eq("aggregate_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(5);
    if (existing.error) throw existing.error;

    const activeApproval = ((existing.data ?? []) as unknown as ApprovalEvent[]).find(isUnexpired);
    if (activeApproval) {
      return NextResponse.json({
        data: { approval: toReceipt(activeApproval), reused: true },
      }, { headers: context.headers, status: 200 });
    }

    const leadResult = await context.access.supabase
      .from("leads")
      .select(metaLeadSelect)
      .eq("organization_id", organizationId)
      .eq("id", leadId)
      .maybeSingle();
    if (leadResult.error) throw leadResult.error;
    if (!leadResult.data) {
      return NextResponse.json({
        error: { code: "LEAD_NOT_FOUND", message: "A lead não pertence à organização atual ou não existe." },
      }, { headers: context.headers, status: 404 });
    }

    const candidate = buildMetaLeadCandidate(leadResult.data as unknown as MetaLeadRecord);
    if (!isMetaLeadReadyForDirectorApproval(candidate)) {
      return NextResponse.json({
        error: {
          code: "LEAD_NOT_READY",
          message: `A lead ainda não pode ser aprovada. Pendências: ${candidate.missing.join(", ") || "revisão de elegibilidade"}.`,
        },
      }, { headers: context.headers, status: 409 });
    }

    const expiresAt = new Date(Date.now() + approvalTtlMs).toISOString();
    const payload: ApprovalPayload = {
      approvedBy: context.access.access.profile.id,
      candidateFingerprint: fingerprintMetaCandidate(candidate),
      deliveryAuthorized: false,
      expiresAt,
      externalEventSent: false,
      projectName: candidate.projectName,
      readinessPct: candidate.readinessPct,
      reason,
      source: candidate.source,
    };
    const inserted = await admin
      .from("atlas_events")
      .insert({
        aggregate_id: leadId,
        aggregate_type: "lead",
        correlation_id: crypto.randomUUID(),
        event_type: approvalEventType,
        organization_id: organizationId,
        payload,
        source: "meta.director",
      })
      .select("id,aggregate_id,payload,occurred_at")
      .single();
    if (inserted.error) throw inserted.error;

    return NextResponse.json({
      data: { approval: toReceipt(inserted.data as unknown as ApprovalEvent), reused: false },
    }, { headers: context.headers, status: 201 });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_APPROVAL_FAILED",
        message: "Não foi possível registrar a aprovação governada agora.",
      },
    }, { headers: context.headers, status: 503 });
  }
}
