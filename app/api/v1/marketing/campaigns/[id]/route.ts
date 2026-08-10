import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const allowedStatuses = new Set([
  "draft",
  "planned",
  "active",
  "paused",
  "completed",
  "archived",
]);
const canManage = (role: string, commercialRole: string | null) =>
  role === "admin" ||
  ["director", "superintendent", "manager"].includes(commercialRole ?? "");

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, {
    limit: 20,
    windowMs: 15 * 60_000,
    scope: "marketing.campaigns.update",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (
    !canManage(
      identity.access.profile.role,
      identity.access.profile.commercialRole,
    )
  )
    return apiError(
      "FORBIDDEN",
      "Perfil sem permissão para alterar campanhas.",
      identity.meta,
      { status: 403 },
    );
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return apiError(
      "INVALID_CAMPAIGN",
      "Nenhuma alteração foi informada.",
      identity.meta,
      { status: 400 },
    );
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("name" in body) {
    const value = String(body.name ?? "").trim();
    if (value.length < 2 || value.length > 160)
      return apiError(
        "INVALID_CAMPAIGN",
        "Nome de campanha inválido.",
        identity.meta,
        { status: 400 },
      );
    patch.name = value;
  }
  if ("status" in body) {
    const value = String(body.status ?? "").toLowerCase();
    if (!allowedStatuses.has(value))
      return apiError("INVALID_CAMPAIGN", "Status inválido.", identity.meta, {
        status: 400,
      });
    patch.status = value;
  }
  if ("budget" in body) {
    const value = Number(body.budget);
    if (!Number.isFinite(value) || value < 0)
      return apiError(
        "INVALID_CAMPAIGN",
        "Orçamento inválido.",
        identity.meta,
        { status: 400 },
      );
    patch.budget = value;
  }
  if ("developerId" in body) {
    const developerId = body.developerId ? String(body.developerId) : null;
    if (developerId) {
      const { data: developer } = await getSupabaseAdmin()
        .from("developers")
        .select("id")
        .eq("id", developerId)
        .eq("organization_id", identity.access.organization.id)
        .maybeSingle();
      if (!developer)
        return apiError(
          "INVALID_DEVELOPER",
          "A incorporadora não pertence a esta organização.",
          identity.meta,
          { status: 400 },
        );
    }
    patch.developer_id = developerId;
  }
  for (const [input, column] of [
    ["objective", "objective"],
    ["briefing", "briefing"],
  ] as const)
    if (input in body) patch[column] = String(body[input] ?? "").trim() || null;
  const { data, error } = await getSupabaseAdmin()
    .from("campaigns")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", identity.access.organization.id)
    .select("*")
    .maybeSingle();
  if (error)
    return apiError(
      "CAMPAIGN_UPDATE_FAILED",
      "Não foi possível atualizar a campanha.",
      identity.meta,
      { status: 409 },
    );
  if (!data)
    return apiError(
      "CAMPAIGN_NOT_FOUND",
      "Campanha não encontrada.",
      identity.meta,
      { status: 404 },
    );
  structuredApiLog(
    "info",
    "marketing.campaign_updated",
    request,
    identity.meta,
    { campaignId: id, actorId: identity.access.profile.id },
  );
  return apiSuccess({ campaign: data }, identity.meta, {
    headers: rate.headers,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, {
    limit: 8,
    windowMs: 15 * 60_000,
    scope: "marketing.campaigns.archive",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (
    !canManage(
      identity.access.profile.role,
      identity.access.profile.commercialRole,
    )
  )
    return apiError(
      "FORBIDDEN",
      "Perfil sem permissão para arquivar campanhas.",
      identity.meta,
      { status: 403 },
    );
  const { id } = await context.params;
  const { data, error } = await getSupabaseAdmin()
    .from("campaigns")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", identity.access.organization.id)
    .select("id,status,archived_at")
    .maybeSingle();
  if (error)
    return apiError(
      "CAMPAIGN_ARCHIVE_FAILED",
      "Não foi possível arquivar a campanha.",
      identity.meta,
      { status: 409 },
    );
  if (!data)
    return apiError(
      "CAMPAIGN_NOT_FOUND",
      "Campanha não encontrada.",
      identity.meta,
      { status: 404 },
    );
  structuredApiLog(
    "info",
    "marketing.campaign_archived",
    request,
    identity.meta,
    { campaignId: id, actorId: identity.access.profile.id },
  );
  return apiSuccess({ campaign: data }, identity.meta, {
    headers: rate.headers,
  });
}
