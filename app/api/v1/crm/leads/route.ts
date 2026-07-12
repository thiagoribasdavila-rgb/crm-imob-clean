import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, readIdempotencyKey, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

const allowedSorts = new Set(["created_at", "updated_at", "score", "name"]);
const allowedDirections = new Set(["asc", "desc"]);

function clampLimit(raw: string | null) {
  const parsed = Number(raw ?? "25");
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed.createdAt)) return null;
    if (!validId(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: string | null; id: string }) {
  if (!row.created_at) return null;
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), "utf8").toString("base64url");
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function normalizePhone(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\D/g, "") || null : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.leads.list" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;

  const params = request.nextUrl.searchParams;
  const limit = clampLimit(params.get("limit"));
  const status = params.get("status")?.trim() || null;
  const source = params.get("source")?.trim() || null;
  const assignedTo = params.get("assigned_to")?.trim() || null;
  const search = params.get("q")?.trim() || null;
  const sort = allowedSorts.has(params.get("sort") ?? "") ? params.get("sort")! : "created_at";
  const direction = allowedDirections.has(params.get("direction") ?? "") ? (params.get("direction") as "asc" | "desc") : "desc";
  const cursor = decodeCursor(params.get("cursor"));

  if (params.has("cursor") && !cursor) {
    return apiError("INVALID_CURSOR", "Cursor de paginação inválido.", access.meta, { status: 400, headers: rate.headers });
  }

  let query = access.supabase
    .from("leads")
    .select("id, name, email, phone, status, source, organization_id, assigned_to, campaign_id, temperature, score, budget_min, budget_max, preferred_regions, bedrooms, purpose, last_interaction_at, next_action_at, created_at, updated_at")
    .eq("organization_id", access.access.organization.id)
    .order(sort, { ascending: direction === "asc" })
    .order("id", { ascending: direction === "asc" })
    .limit(limit + 1);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (search) {
    const escaped = search.replace(/[,%()]/g, " ").trim();
    if (escaped) query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  if (cursor && sort === "created_at") {
    const operator = direction === "desc" ? "lt" : "gt";
    query = query.or(`created_at.${operator}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${operator}.${cursor.id})`);
  }

  const { data, error } = await query;

  if (error) {
    structuredApiLog("error", "crm.leads.list_failed", request, access.meta, { organizationId: access.access.organization.id, message: error.message });
    return apiError("LEADS_QUERY_FAILED", "Não foi possível carregar os leads.", access.meta, { status: 500, headers: rate.headers });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && sort === "created_at" ? encodeCursor(items[items.length - 1]) : null;

  structuredApiLog("info", "crm.leads.list_success", request, access.meta, { organizationId: access.access.organization.id, count: items.length, hasMore });

  return apiSuccess({ items, page: { limit, hasMore, nextCursor }, filters: { status, source, assignedTo, search, sort, direction } }, access.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 40, windowMs: 60_000, scope: "crm.leads.create" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker"] });
  if (!access.ok) return access.response;

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "Envie o header Idempotency-Key para criar lead.", access.meta, { status: 400, headers: rate.headers });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("INVALID_JSON", "Payload JSON inválido.", access.meta, { status: 400, headers: rate.headers });
  }

  const name = stringOrNull(body.name);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  if (!name) return apiError("VALIDATION_ERROR", "Nome é obrigatório.", access.meta, { status: 422, headers: rate.headers });
  if (!email && !phone) return apiError("VALIDATION_ERROR", "Informe e-mail ou telefone.", access.meta, { status: 422, headers: rate.headers });

  const idempotencyScope = "crm.leads.create";
  const existingKey = await access.supabase
    .from("idempotency_keys")
    .select("response_status,response_body")
    .eq("organization_id", access.access.organization.id)
    .eq("scope", idempotencyScope)
    .eq("key", idempotencyKey)
    .maybeSingle();
  if (existingKey.error) return apiError("IDEMPOTENCY_LOOKUP_FAILED", "Não foi possível validar a chave de idempotência.", access.meta, { status: 500, headers: rate.headers });
  if (existingKey.data?.response_body) return apiSuccess(existingKey.data.response_body, access.meta, { status: existingKey.data.response_status ?? 200, headers: rate.headers });
  if (existingKey.data) return apiError("IDEMPOTENCY_IN_PROGRESS", "Esta chave de idempotência já está em processamento.", access.meta, { status: 409, headers: rate.headers });

  let duplicateQuery = access.supabase.from("leads").select("id").eq("organization_id", access.access.organization.id).limit(1);
  if (email && phone) duplicateQuery = duplicateQuery.or(`email.eq.${email},phone.eq.${phone}`);
  else if (email) duplicateQuery = duplicateQuery.eq("email", email);
  else duplicateQuery = duplicateQuery.eq("phone", phone);
  const duplicate = await duplicateQuery.maybeSingle();
  if (duplicate.data?.id) return apiError("LEAD_CONFLICT", "Já existe um lead com este contato.", access.meta, { status: 409, headers: rate.headers, details: { leadId: duplicate.data.id } });

  const requestedAssignee = stringOrNull(body.assigned_to);
  const assignedTo = requestedAssignee ?? access.access.user.id;
  if (!validId(assignedTo)) {
    return apiError("INVALID_ASSIGNEE", "Corretor responsável inválido.", access.meta, { status: 422, headers: rate.headers });
  }

  const { data: assignee, error: assigneeError } = await access.supabase
    .from("profiles")
    .select("id")
    .eq("id", assignedTo)
    .eq("organization_id", access.access.organization.id)
    .eq("active", true)
    .maybeSingle();
  if (assigneeError) return apiError("ASSIGNEE_LOOKUP_FAILED", "Não foi possível validar o corretor responsável.", access.meta, { status: 500, headers: rate.headers });
  if (!assignee) return apiError("INVALID_ASSIGNEE", "O corretor responsável não pertence à organização ou está inativo.", access.meta, { status: 422, headers: rate.headers });

  const reservedKey = await access.supabase.from("idempotency_keys").insert({
    organization_id: access.access.organization.id,
    scope: idempotencyScope,
    key: idempotencyKey,
    locked_until: new Date(Date.now() + 60_000).toISOString(),
  });
  if (reservedKey.error) return apiError("IDEMPOTENCY_RESERVATION_FAILED", "Não foi possível reservar a chave de idempotência.", access.meta, { status: 409, headers: rate.headers });

  const record = {
    organization_id: access.access.organization.id,
    assigned_to: assignedTo,
    name,
    email,
    phone,
    status: stringOrNull(body.status) ?? "novo",
    source: stringOrNull(body.source) ?? "manual",
    purpose: stringOrNull(body.purpose),
    budget_min: numberOrNull(body.budget_min ?? body.budgetMin),
    budget_max: numberOrNull(body.budget_max ?? body.budgetMax),
    bedrooms: numberOrNull(body.bedrooms),
    preferred_regions: Array.isArray(body.preferred_regions) ? body.preferred_regions : [],
    notes: stringOrNull(body.notes),
  };

  const { data, error } = await access.supabase.from("leads").insert(record).select("*").single();
  if (error) {
    await access.supabase
      .from("idempotency_keys")
      .delete()
      .eq("organization_id", access.access.organization.id)
      .eq("scope", idempotencyScope)
      .eq("key", idempotencyKey);
    structuredApiLog("error", "crm.leads.create_failed", request, access.meta, { organizationId: access.access.organization.id, message: error.message });
    return apiError("LEAD_CREATE_FAILED", "Não foi possível criar o lead.", access.meta, { status: 500, headers: rate.headers });
  }

  const responseBody = { lead: data };
  await access.supabase
    .from("idempotency_keys")
    .update({ response_status: 201, response_body: responseBody, locked_until: null, updated_at: new Date().toISOString() })
    .eq("organization_id", access.access.organization.id)
    .eq("scope", idempotencyScope)
    .eq("key", idempotencyKey);

  await access.supabase.from("atlas_events").insert({ organization_id: access.access.organization.id, event_type: "lead.created", source: "api.v1.crm.leads", aggregate_type: "lead", aggregate_id: data.id, payload: { idempotencyKey }, correlation_id: access.meta.correlationId });

  return apiSuccess(responseBody, access.meta, { status: 201, headers: rate.headers });
}
