import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  descendantsFromLiveProfiles,
  resolveLiveHierarchy,
} from "@/lib/compat/live-hierarchy";
import type { CompatRow } from "@/lib/compat/legacy-v2";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value : "";

async function transferScope(
  request: NextRequest,
  options: { limit?: number; scope?: string } = {},
) {
  const rate = enforceRateLimit(request, {
    limit: options.limit ?? 30,
    windowMs: 60_000,
    scope: options.scope ?? "crm.leads.bulk-transfer.scope",
  });
  if (!rate.ok) return { ok: false as const, response: rate.response };
  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!access.ok) return { ok: false as const, response: access.response };

  const profilesResult = await access.supabase
    .from("profiles")
    .select("*")
    .eq("organization_id", access.access.organization.id)
    .eq("active", true)
    .order("name");
  if (profilesResult.error) {
    structuredApiLog("error", "crm.leads.bulk_transfer_scope_failed", request, access.meta, {
      organizationId: access.access.organization.id,
      message: profilesResult.error.message,
    });
    return {
      ok: false as const,
      response: apiError("TRANSFER_SCOPE_FAILED", "Não foi possível validar os destinos agora.", access.meta, {
        status: 503,
        headers: rate.headers,
      }),
    };
  }

  const hierarchy = resolveLiveHierarchy((profilesResult.data ?? []) as unknown as CompatRow[]);
  const actorRole = access.access.profile.commercialRole;
  const actorIsAdmin = access.access.profile.accessRole === "admin";
  const actorId = access.access.profile.id;
  const allowed = actorIsAdmin || actorRole === "director"
    ? new Set(hierarchy.map((profile) => text(profile.id)))
    : descendantsFromLiveProfiles(hierarchy, actorId);
  const targets = hierarchy.filter((profile) => {
    const role = text(profile.commercial_role);
    if (!allowed.has(text(profile.id)) || text(profile.id) === actorId) return false;
    if (actorRole === "manager") return role === "broker" && text(profile.reports_to) === actorId;
    return role === "broker" || role === "manager";
  });

  return { ok: true as const, access, rate, hierarchy, targets };
}

export async function GET(request: NextRequest) {
  const scope = await transferScope(request);
  if (!scope.ok) return scope.response;
  return apiSuccess({
    targets: scope.targets.map((profile) => ({
      id: text(profile.id),
      name: text(profile.full_name || profile.name) || "Usuário comercial",
      role: text(profile.commercial_role),
      team: text(profile.team) || null,
      hierarchySource: text(profile.hierarchy_source) || "live-profile",
    })),
    policy: {
      managerRestrictedToDirectBrokers: true,
      leadershipCanTargetManagerOrBroker: true,
      reasonRequired: true,
      humanConfirmationRequired: true,
      maximumLeadCount: 200,
      audited: true,
    },
  }, scope.access.meta, { headers: scope.rate.headers });
}

export async function POST(request: NextRequest) {
  const scope = await transferScope(request, {
    limit: 15,
    scope: "crm.leads.bulk-transfer",
  });
  if (!scope.ok) return scope.response;
  const { access, rate } = scope;

  let body: { leadIds?: unknown; targetOwnerId?: unknown; reason?: unknown; humanConfirmed?: unknown };
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

  if (!leadIds.length || leadIds.length > 200 || !UUID.test(targetOwnerId) || reason.length < 10 || body.humanConfirmed !== true) {
    return apiError("INVALID_TRANSFER", "Selecione de 1 a 200 leads, confirme um destino válido e informe o motivo.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const target = scope.targets.find((profile) => text(profile.id) === targetOwnerId);
  if (!target) return apiError("TRANSFER_TARGET_INVALID", "Destino fora do seu escopo comercial ou inativo.", access.meta, { status: 400, headers: rate.headers });
  const admin = getSupabaseAdmin();
  const targetRole = text(target.commercial_role);
  const rpc = targetRole === "manager" ? "transfer_leads_to_team" : "bulk_transfer_leads";
  const params = targetRole === "manager" ? { p_actor_id: access.access.profile.id, p_organization_id: access.access.organization.id, p_lead_ids: leadIds, p_target_manager_id: targetOwnerId, p_reason: reason } : {
    p_actor_id: access.access.profile.id,
    p_organization_id: access.access.organization.id,
    p_lead_ids: leadIds,
    p_target_owner_id: targetOwnerId,
    p_reason: reason,
  };
  const { data, error } = await admin.rpc(rpc, params);

  if (error) {
    structuredApiLog("warn", "crm.leads.bulk_transfer_rejected", request, access.meta, {
      organizationId: access.access.organization.id,
      actorId: access.access.profile.id,
      count: leadIds.length,
      message: error.message,
    });
    return apiError(
      "TRANSFER_REJECTED",
      "A transferência não foi autorizada. Revise o escopo, as leads selecionadas e tente novamente.",
      access.meta,
      { status: 403, headers: rate.headers },
    );
  }

  structuredApiLog("info", "crm.leads.bulk_transfer_success", request, access.meta, {
    organizationId: access.access.organization.id,
    actorId: access.access.profile.id,
    count: leadIds.length,
    targetOwnerId,
  });
  return apiSuccess(data, access.meta, { headers: rate.headers });
}
