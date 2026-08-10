import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import {
  enforceRateLimit,
  readIdempotencyKey,
  requireAccessContext,
} from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type FirstActionBody = {
  actionType?: unknown;
  outcome?: unknown;
  note?: unknown;
  nextActionTitle?: unknown;
  nextActionAt?: unknown;
  humanConfirmed?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_TYPES = new Set(["call", "whatsapp", "email", "meeting", "visit", "contact"]);
const OUTCOMES = new Set(["contacted", "no_response", "meeting_scheduled", "follow_up_needed", "not_interested"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, {
    limit: 20,
    windowMs: 60_000,
    scope: "lead-first-action",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { id: leadId } = await context.params;
  const meta = access.meta;

  if (!UUID_PATTERN.test(leadId)) {
    return apiError("INVALID_LEAD_ID", "Lead inválido.", meta, { status: 400 });
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Não foi possível proteger esta gravação contra duplicidade.",
      meta,
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as FirstActionBody;
  const actionType = text(body.actionType).toLowerCase();
  const outcome = text(body.outcome).toLowerCase();
  const note = text(body.note);
  const nextActionTitle = text(body.nextActionTitle);
  const nextActionAt = text(body.nextActionAt);
  const nextTimestamp = Date.parse(nextActionAt);

  if (body.humanConfirmed !== true) {
    return apiError("HUMAN_CONFIRMATION_REQUIRED", "Confirme a ação antes de registrar.", meta, { status: 400 });
  }
  if (!ACTION_TYPES.has(actionType) || !OUTCOMES.has(outcome)) {
    return apiError("FIRST_ACTION_INVALID", "Tipo de ação ou resultado inválido.", meta, { status: 400 });
  }
  if (note.length < 10 || note.length > 1000) {
    return apiError("FIRST_ACTION_NOTE_INVALID", "Descreva o resultado em 10 a 1.000 caracteres.", meta, { status: 400 });
  }
  if (nextActionTitle.length < 3 || nextActionTitle.length > 120) {
    return apiError("NEXT_ACTION_TITLE_INVALID", "Informe a próxima ação em 3 a 120 caracteres.", meta, { status: 400 });
  }
  if (!Number.isFinite(nextTimestamp) || nextTimestamp <= Date.now()) {
    return apiError("NEXT_ACTION_DATE_INVALID", "Agende a próxima ação para uma data futura.", meta, { status: 400 });
  }

  const organizationId = access.access.organization.id;
  const { data: visibleLead, error: scopeError } = await access.supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (scopeError || !visibleLead) {
    return apiError("LEAD_NOT_ACCESSIBLE", "Lead não encontrada no seu escopo comercial.", meta, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("record_lead_first_action", {
    p_actor: access.access.profile.id,
    p_organization: organizationId,
    p_lead_id: leadId,
    p_action_type: actionType,
    p_outcome: outcome,
    p_note: note,
    p_next_action_title: nextActionTitle,
    p_next_action_at: new Date(nextTimestamp).toISOString(),
    p_idempotency_key: idempotencyKey,
    p_occurred_at: new Date().toISOString(),
  });

  if (error) {
    structuredApiLog("error", "lead.first_action.failed", request, meta, {
      organizationId,
      leadId,
      errorCode: error.code,
    });
    return apiError(
      "FIRST_ACTION_WRITE_FAILED",
      "Não foi possível registrar a ação. Nada foi alterado; tente novamente.",
      meta,
      { status: 500 },
    );
  }

  const result = (data ?? {}) as { replayed?: boolean };
  structuredApiLog("info", "lead.first_action.recorded", request, meta, {
    organizationId,
    leadId,
    replayed: result.replayed === true,
  });
  return apiSuccess(result, meta, {
    status: result.replayed ? 200 : 201,
    headers: rate.headers,
  });
}
