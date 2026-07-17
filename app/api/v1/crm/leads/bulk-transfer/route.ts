import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "crm.leads.bulk-transfer" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!access.ok) return access.response;

  let body: { leadIds?: unknown; targetOwnerId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Envie os dados da transferência em formato válido.", access.meta, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds)
    ? [...new Set(body.leadIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];
  const targetOwnerId = typeof body.targetOwnerId === "string" ? body.targetOwnerId : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!leadIds.length || leadIds.length > 200 || !UUID.test(targetOwnerId) || reason.length < 5) {
    return apiError("INVALID_TRANSFER", "Selecione de 1 a 200 leads, um destino válido e informe o motivo.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("bulk_transfer_leads", {
    p_actor_id: access.access.profile.id,
    p_organization_id: access.access.organization.id,
    p_lead_ids: leadIds,
    p_target_owner_id: targetOwnerId,
    p_reason: reason,
  });

  if (error) {
    structuredApiLog("warn", "crm.leads.bulk_transfer_rejected", request, access.meta, {
      organizationId: access.access.organization.id,
      actorId: access.access.profile.id,
      count: leadIds.length,
      message: error.message,
    });
    return apiError("TRANSFER_REJECTED", error.message, access.meta, { status: 403, headers: rate.headers });
  }

  structuredApiLog("info", "crm.leads.bulk_transfer_success", request, access.meta, {
    organizationId: access.access.organization.id,
    actorId: access.access.profile.id,
    count: leadIds.length,
    targetOwnerId,
  });
  return apiSuccess(data, access.meta, { headers: rate.headers });
}
