import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  canonicalCommercialRole,
  compatibleLeadStatuses,
  LIVE_LEAD_SELECT,
  LIVE_PROFILE_SELECT,
  liveLeadSortColumn,
  mapLegacyLead,
  mapLegacyProfile,
} from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

const allowedSorts = new Set(["created_at", "updated_at", "score", "name"]);
const allowedDirections = new Set(["asc", "desc"]);
const allowedAttentionFilters = new Set(["overdue", "no_action", "hot", "unassigned"]);
const allowedNextActionFilters = new Set(["today", "next_7_days", "scheduled"]);

function clampLimit(raw: string | null) {
  const parsed = Number(raw ?? "25");
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function clampPage(raw: string | null) {
  const parsed = Number(raw ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function scoreFilter(raw: string | null) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.trunc(parsed)));
}

function campaignFilters(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
    .slice(0, 50);
}
const uuidPattern = /^[0-9a-f-]{36}$/i;
const terminalStorageStatuses = ["ganho", "GANHO", "venda", "VENDA", "vendido", "VENDIDO", "perdido", "PERDIDO", "comprou_outro", "COMPROU_OUTRO"];

type CompatibleProfile = Record<string, unknown> & {
  id: string;
  team: string | null;
  commercial_role: string;
};

function profileTeamScope(profiles: CompatibleProfile[], ownerId: string) {
  const owner = profiles.find((profile) => profile.id === ownerId);
  if (!owner) return [];
  const team = String(owner.team || "").trim().toLocaleLowerCase("pt-BR");
  if (!team) return [owner.id];
  return profiles
    .filter((profile) => String(profile.team || "").trim().toLocaleLowerCase("pt-BR") === team)
    .map((profile) => profile.id);
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed.createdAt)) return null;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: Record<string, unknown> | undefined) {
  const createdAt = typeof row?.created_at === "string" ? row.created_at : null;
  const id = typeof row?.id === "string" ? row.id : null;
  if (!createdAt || !id) return null;
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.leads.list" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker", "viewer"],
  });
  if (!access.ok) return access.response;

  const params = request.nextUrl.searchParams;
  const limit = clampLimit(params.get("limit"));
  const page = clampPage(params.get("page"));
  const status = params.get("status")?.trim() || null;
  const source = params.get("source")?.trim() || null;
  const assignedTo = params.get("assigned_to")?.trim() || null;
  const developmentId = params.get("development_id")?.trim() || null;
  const teamOwner = params.get("team_owner")?.trim() || null;
  const minScore = scoreFilter(params.get("min_score"));
  const maxScore = scoreFilter(params.get("max_score"));
  const campaignIds = campaignFilters(params.get("campaign_ids"));
  const search = params.get("q")?.trim() || null;
  const sort = allowedSorts.has(params.get("sort") ?? "") ? params.get("sort")! : "created_at";
  const direction = allowedDirections.has(params.get("direction") ?? "")
    ? (params.get("direction") as "asc" | "desc")
    : "desc";
  const cursor = decodeCursor(params.get("cursor"));
  const attention = allowedAttentionFilters.has(params.get("attention") ?? "")
    ? params.get("attention")
    : null;
  const nextAction = allowedNextActionFilters.has(params.get("next_action") ?? "")
    ? params.get("next_action")
    : null;

  if (teamOwner && assignedTo) {
    return apiError("AMBIGUOUS_OWNER_FILTER", "Escolha uma equipe ou um corretor, não os dois ao mesmo tempo.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }
  if (assignedTo && assignedTo !== "unassigned" && !uuidPattern.test(assignedTo)) {
    return apiError("INVALID_OWNER", "Corretor inválido.", access.meta, { status: 400, headers: rate.headers });
  }
  if (developmentId && !uuidPattern.test(developmentId)) {
    return apiError("INVALID_DEVELOPMENT", "Projeto inválido.", access.meta, { status: 400, headers: rate.headers });
  }

  if (params.has("cursor") && !cursor) {
    return apiError("INVALID_CURSOR", "Cursor de paginação inválido.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const usePagePagination = params.has("page");
  const offset = (page - 1) * limit;
  const storageSort = liveLeadSortColumn(sort);
  let query = access.supabase
    .from("leads")
    .select(LIVE_LEAD_SELECT, { count: usePagePagination ? "exact" : undefined })
    .eq("organization_id", access.access.organization.id)
    .not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)")
    .order(storageSort, { ascending: direction === "asc" })
    .order("id", { ascending: direction === "asc" });

  query = usePagePagination
    ? query.range(offset, offset + limit - 1)
    : query.limit(limit + 1);

  if (status) query = query.in("status", compatibleLeadStatuses(status));
  if (source) query = query.eq("source", source);
  if (developmentId) query = query.eq("project_id", developmentId);
  if (teamOwner || (assignedTo && assignedTo !== "unassigned")) {
    const { data: visibleProfiles, error: profilesError } = await access.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", access.access.organization.id)
      .eq("active", true);
    if (profilesError) return apiError("TEAM_SCOPE_FAILED", "Não foi possível validar o escopo da equipe.", access.meta, { status: 500, headers: rate.headers });

    const profiles = ((visibleProfiles ?? []) as Record<string, unknown>[]).map(mapLegacyProfile) as CompatibleProfile[];

    if (assignedTo && assignedTo !== "unassigned") {
      const owner = profiles.find((profile) => profile.id === assignedTo);
      if (!owner) return apiError("OWNER_OUT_OF_SCOPE", "Responsável fora do seu escopo comercial.", access.meta, { status: 403, headers: rate.headers });
    }
    if (teamOwner) {
      if (!uuidPattern.test(teamOwner)) return apiError("INVALID_TEAM", "Gerente inválido.", access.meta, { status: 400, headers: rate.headers });
      const manager = profiles.find((profile) => profile.id === teamOwner);
      if (!manager || canonicalCommercialRole(manager.commercial_role) !== "manager") return apiError("TEAM_OUT_OF_SCOPE", "Equipe fora do seu escopo comercial.", access.meta, { status: 403, headers: rate.headers });
      query = query.in("assigned_user_id", profileTeamScope(profiles, manager.id));
    } else if (assignedTo) query = query.eq("assigned_user_id", assignedTo);
  } else if (assignedTo === "unassigned") query = query.is("assigned_user_id", null);
  if (minScore !== null) query = query.gte("score_ia", minScore);
  if (maxScore !== null) query = query.lte("score_ia", maxScore);
  if (attention) {
    query = query.not("status", "in", `(${terminalStorageStatuses.join(",")})`);
    if (attention === "overdue") query = query.lt("next_contact", new Date().toISOString());
    if (attention === "no_action") query = query.is("next_contact", null);
    if (attention === "hot") query = query.or("temperature.ilike.quente,score_ia.gte.70");
    if (attention === "unassigned") query = query.is("assigned_user_id", null);
  }
  if (nextAction) {
    query = query.not("status", "in", `(${terminalStorageStatuses.join(",")})`).not("next_contact", "is", null);
    const now = new Date();
    if (nextAction === "scheduled") query = query.gte("next_contact", now.toISOString());
    if (nextAction === "today") {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      query = query.gte("next_contact", now.toISOString()).lte("next_contact", end.toISOString());
    }
    if (nextAction === "next_7_days") {
      const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      query = query.gte("next_contact", now.toISOString()).lte("next_contact", end.toISOString());
    }
  }
  if (campaignIds.length) query = query.in("campaign_id", campaignIds);
  if (search) {
    const escaped = search.replace(/[,%()]/g, " ").trim();
    if (escaped) query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  if (!usePagePagination && cursor && sort === "created_at") {
    const operator = direction === "desc" ? "lt" : "gt";
    query = query.or(
      `created_at.${operator}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${operator}.${cursor.id})`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    structuredApiLog("error", "crm.leads.list_failed", request, access.meta, {
      organizationId: access.access.organization.id,
      message: error.message,
    });
    return apiError("LEADS_QUERY_FAILED", "Não foi possível carregar os leads.", access.meta, {
      status: 500,
      headers: rate.headers,
    });
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapLegacyLead);
  const hasMore = usePagePagination
    ? offset + rows.length < (count ?? 0)
    : rows.length > limit;
  const items = !usePagePagination && hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = !usePagePagination && hasMore && sort === "created_at"
    ? encodeCursor(items[items.length - 1])
    : null;
  const total = usePagePagination ? count ?? 0 : null;
  const pages = total === null ? null : Math.max(1, Math.ceil(total / limit));

  structuredApiLog("info", "crm.leads.list_success", request, access.meta, {
    organizationId: access.access.organization.id,
    count: items.length,
    hasMore,
  });

  return apiSuccess(
    {
      items,
      page: {
        limit,
        number: usePagePagination ? page : null,
        total,
        pages,
        hasMore,
        nextCursor,
      },
      filters: {
        status,
        source,
        assignedTo,
        developmentId,
        teamOwner,
        minScore,
        maxScore,
        campaignIds,
        search,
        sort,
        direction,
        attention,
        nextAction,
      },
      compatibility: {
        canonicalContract: "lead-v1",
        storageContract: "atlas-live-legacy",
        databasePagination: true,
      },
    },
    access.meta,
    { headers: rate.headers },
  );
}
