import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
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

function clean(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const channel = String(body.channel ?? "")
    .trim()
    .toLowerCase();
  const status = String(body.status ?? "draft")
    .trim()
    .toLowerCase();
  const budget =
    body.budget === "" || body.budget === null ? 0 : Number(body.budget);
  if (name.length < 2 || name.length > 160)
    throw new Error("Informe um nome de campanha entre 2 e 160 caracteres.");
  if (!channel || channel.length > 40)
    throw new Error("Informe um canal válido.");
  if (!allowedStatuses.has(status))
    throw new Error("Status de campanha inválido.");
  if (!Number.isFinite(budget) || budget < 0)
    throw new Error("Orçamento inválido.");
  const startsAt = body.startsAt
    ? new Date(String(body.startsAt)).toISOString()
    : null;
  const endsAt = body.endsAt
    ? new Date(String(body.endsAt)).toISOString()
    : null;
  if (startsAt && endsAt && endsAt < startsAt)
    throw new Error("A data final deve ser posterior à data inicial.");
  return {
    name,
    channel,
    platform: channel,
    status,
    budget,
    development_id: body.developmentId || null,
    developer_id: body.developerId || null,
    responsible_id: body.responsibleId || null,
    objective:
      String(body.objective ?? "")
        .trim()
        .slice(0, 500) || null,
    briefing:
      String(body.briefing ?? "")
        .trim()
        .slice(0, 5000) || null,
    starts_at: startsAt,
    ends_at: endsAt,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "marketing.campaigns.list",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const admin = getSupabaseAdmin();
  const search = request.nextUrl.searchParams.get("q")?.trim();
  let query = admin
    .from("campaigns")
    .select(
      "id,name,channel,platform,status,budget,spend,leads_count,sales_count,revenue,starts_at,ends_at,development_id,developer_id,responsible_id,objective,briefing,currency,archived_at,created_at,updated_at,developments(name,developer_id,developer_name),developers(id,trade_name,legal_name),profiles!campaigns_responsible_id_fkey(name,email)",
    )
    .eq("organization_id", identity.access.organization.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (search) query = query.ilike("name", `%${search.replace(/[%_,]/g, "")}%`);
  const { data, error } = await query.limit(500);
  if (error)
    return apiError(
      "CAMPAIGNS_LOOKUP_FAILED",
      "Não foi possível carregar as campanhas.",
      identity.meta,
      { status: 500 },
    );
  const rows = data ?? [];
  const campaignsWithKnownSpend = rows.filter(
    (row) => Number(row.spend ?? 0) > 0,
  );
  return apiSuccess(
    {
      campaigns: rows,
      summary: {
        total: rows.length,
        active: rows.filter((row) => row.status === "active").length,
        budget: rows.reduce((sum, row) => sum + Number(row.budget ?? 0), 0),
        spend: campaignsWithKnownSpend.length
          ? campaignsWithKnownSpend.reduce(
              (sum, row) => sum + Number(row.spend ?? 0),
              0,
            )
          : null,
        campaignsWithKnownSpend: campaignsWithKnownSpend.length,
        leads: rows.reduce((sum, row) => sum + Number(row.leads_count ?? 0), 0),
        sales: rows.reduce((sum, row) => sum + Number(row.sales_count ?? 0), 0),
        revenue: rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0),
      },
      metaSync: {
        configured: Boolean(process.env.META_ADS_ACCESS_TOKEN),
        requiredForInternalOperation: false,
      },
    },
    identity.meta,
    { headers: rate.headers },
  );
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 15,
    windowMs: 15 * 60_000,
    scope: "marketing.campaigns.create",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (
    !canManage(
      identity.access.profile.role,
      identity.access.profile.commercialRole,
    )
  ) {
    return apiError(
      "FORBIDDEN",
      "Perfil sem permissão para criar campanhas.",
      identity.meta,
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return apiError(
      "INVALID_CAMPAIGN",
      "Dados da campanha não informados.",
      identity.meta,
      { status: 400 },
    );
  let values;
  try {
    values = clean(body);
  } catch (cause) {
    return apiError(
      "INVALID_CAMPAIGN",
      cause instanceof Error ? cause.message : "Revise os dados da campanha.",
      identity.meta,
      { status: 400 },
    );
  }
  const admin = getSupabaseAdmin();
  if (values.development_id) {
    const { data: development } = await admin
      .from("developments")
      .select("id")
      .eq("id", values.development_id)
      .eq("organization_id", identity.access.organization.id)
      .maybeSingle();
    if (!development)
      return apiError(
        "INVALID_DEVELOPMENT",
        "O projeto não pertence a esta organização.",
        identity.meta,
        { status: 400 },
      );
  }
  if (values.developer_id) {
    const { data: developer } = await admin
      .from("developers")
      .select("id")
      .eq("id", values.developer_id)
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
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      ...values,
      organization_id: identity.access.organization.id,
    })
    .select("*")
    .single();
  if (error)
    return apiError(
      "CAMPAIGN_CREATE_FAILED",
      "Não foi possível criar a campanha.",
      identity.meta,
      { status: 409 },
    );
  structuredApiLog(
    "info",
    "marketing.campaign_created",
    request,
    identity.meta,
    { campaignId: data.id, actorId: identity.access.profile.id },
  );
  return apiSuccess({ campaign: data }, identity.meta, {
    status: 201,
    headers: rate.headers,
  });
}
