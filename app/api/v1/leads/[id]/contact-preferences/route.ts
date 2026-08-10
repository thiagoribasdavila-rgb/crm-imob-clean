import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ContactPreferenceBody = {
  channel?: unknown;
  status?: unknown;
  lawfulBasis?: unknown;
  evidence?: unknown;
  preferred?: unknown;
  allowedStart?: unknown;
  allowedEnd?: unknown;
  allowedDays?: unknown;
  timezone?: unknown;
  validUntil?: unknown;
  humanConfirmed?: unknown;
};

const allowedChannels = new Set(["whatsapp", "email", "phone", "sms"]);
const allowedStatuses = new Set(["granted", "denied", "unknown"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "lead.contact-preferences.read" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id } = await params;
  const { data: lead } = await access.supabase
    .from("leads")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();

  if (!lead) {
    return apiError("LEAD_NOT_FOUND", "Lead fora do seu escopo.", access.meta, { status: 404 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("lead_contact_preferences")
    .select("id,channel,consent_status,lawful_basis,evidence,preferred,allowed_start,allowed_end,allowed_days,timezone,valid_until,granted_at,revoked_at,updated_at")
    .eq("organization_id", access.access.organization.id)
    .eq("lead_id", id)
    .order("channel");

  if (error) {
    return apiError(
      "CONTACT_PREFERENCES_UNAVAILABLE",
      "Preferências de contato temporariamente indisponíveis.",
      access.meta,
      { status: 503 },
    );
  }

  const channels = ["whatsapp", "email", "phone", "sms"];
  const preferences = channels.map((channel) => data?.find((item) => item.channel === channel) ?? {
    channel,
    consent_status: "unknown",
    preferred: false,
    allowed_start: "09:00",
    allowed_end: "20:00",
    allowed_days: [1, 2, 3, 4, 5, 6],
    timezone: "America/Sao_Paulo",
  });

  const eligibility = Object.fromEntries(await Promise.all(channels.map(async (channel) => {
    const { data: result } = await db.rpc("check_lead_contact_eligibility", {
      p_organization_id: access.access.organization.id,
      p_lead_id: id,
      p_channel: channel,
    });
    return [channel, result];
  })));

  return apiSuccess({
    lead,
    preferences,
    eligibility,
    policy: {
      singleSourceOfTruth: true,
      optOutImmediate: true,
      automationRecheck: true,
      channelSpecific: true,
      timeWindowAware: true,
      humanEvidenceRequired: true,
    },
  }, access.meta, { headers: rate.headers });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "lead.contact-preferences.write" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id } = await params;
  const body = await request.json().catch(() => null) as ContactPreferenceBody | null;
  if (!body) {
    return apiError("CONTACT_PREFERENCE_INVALID", "Preferência não informada.", access.meta, { status: 400 });
  }

  const channel = typeof body.channel === "string" ? body.channel : "";
  const status = typeof body.status === "string" ? body.status : "";
  const lawfulBasis = typeof body.lawfulBasis === "string" ? body.lawfulBasis.trim() : "";
  const evidence = typeof body.evidence === "string" ? body.evidence.trim() : "";

  if (!allowedChannels.has(channel) || !allowedStatuses.has(status)) {
    return apiError("CONTACT_PREFERENCE_INVALID", "Canal ou status inválido.", access.meta, { status: 400 });
  }
  if (body.humanConfirmed !== true) {
    return apiError("HUMAN_CONFIRMATION_REQUIRED", "Revise e confirme a preferência antes de salvar.", access.meta, { status: 409 });
  }
  if (evidence.length < 10) {
    return apiError("CONTACT_EVIDENCE_REQUIRED", "Registre quando e como a preferência foi confirmada.", access.meta, { status: 400 });
  }
  if (status === "granted" && lawfulBasis.length < 10) {
    return apiError("LAWFUL_BASIS_REQUIRED", "Registre a base ou autorização do contato.", access.meta, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("set_lead_contact_preference", {
    p_actor_id: access.access.profile.id,
    p_organization_id: access.access.organization.id,
    p_lead_id: id,
    p_channel: channel,
    p_status: status,
    p_lawful_basis: lawfulBasis,
    p_evidence: evidence,
    p_preferred: Boolean(body.preferred),
    p_allowed_start: typeof body.allowedStart === "string" ? body.allowedStart : "09:00",
    p_allowed_end: typeof body.allowedEnd === "string" ? body.allowedEnd : "20:00",
    p_allowed_days: Array.isArray(body.allowedDays) ? body.allowedDays : [1, 2, 3, 4, 5, 6],
    p_timezone: typeof body.timezone === "string" ? body.timezone : "America/Sao_Paulo",
    p_valid_until: typeof body.validUntil === "string" && body.validUntil ? body.validUntil : null,
  });

  if (error) {
    return apiError("CONTACT_PREFERENCE_REJECTED", "A preferência não pôde ser registrada.", access.meta, { status: 409 });
  }

  structuredApiLog("info", "lead.contact_preference_updated", request, access.meta, {
    leadId: id,
    channel,
    status,
    humanConfirmed: true,
  });
  return apiSuccess(data, access.meta, { headers: rate.headers });
}
