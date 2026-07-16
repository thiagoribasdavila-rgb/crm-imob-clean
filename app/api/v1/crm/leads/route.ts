import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

const allowedSorts = new Set(["created_at", "updated_at", "score", "name"]);
const allowedDirections = new Set(["asc", "desc"]);

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

function encodeCursor(row: { created_at: string | null; id: string }) {
  if (!row.created_at) return null;
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), "utf8").toString("base64url");
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
  const minScore = scoreFilter(params.get("min_score"));
  const maxScore = scoreFilter(params.get("max_score"));
  const campaignIds = campaignFilters(params.get("campaign_ids"));
  const search = params.get("q")?.trim() || null;
  const sort = allowedSorts.has(params.get("sort") ?? "") ? params.get("sort")! : "created_at";
  const direction = allowedDirections.has(params.get("direction") ?? "")
    ? (params.get("direction") as "asc" | "desc")
    : "desc";
  const cursor = decodeCursor(params.get("cursor"));

  if (params.has("cursor") && !cursor) {
    return apiError("INVALID_CURSOR", "Cursor de paginação inválido.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const usePagePagination = params.has("page");
  const offset = (page - 1) * limit;
  let query = access.supabase
    .from("leads")
    .select(
      "id, name, email, phone, status, source, organization_id, assigned_to, campaign_id, development_id, temperature, score, budget_min, budget_max, preferred_regions, bedrooms, purpose, metadata, last_interaction_at, next_action_at, created_at, updated_at",
      { count: usePagePagination ? "exact" : undefined },
    )
    .eq("organization_id", access.access.organization.id)
    .order(sort, { ascending: direction === "asc" })
    .order("id", { ascending: direction === "asc" });

  query = usePagePagination
    ? query.range(offset, offset + limit - 1)
    : query.limit(limit + 1);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (assignedTo === "unassigned") query = query.is("assigned_to", null);
  else if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (minScore !== null) query = query.gte("score", minScore);
  if (maxScore !== null) query = query.lte("score", maxScore);
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

  const rows = data ?? [];
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
        minScore,
        maxScore,
        campaignIds,
        search,
        sort,
        direction,
      },
    },
    access.meta,
    { headers: rate.headers },
  );
}
