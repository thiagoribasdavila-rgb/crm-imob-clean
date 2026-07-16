import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canManageCommission(commercialRole: string | null, role: string) {
  return commercialRole === "director" || role === "admin";
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "sales.commission.update" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManageCommission(access.access.profile.commercialRole, access.access.profile.role)) {
    return apiError("FORBIDDEN", "Somente a diretoria pode registrar ou alterar comissões.", access.meta, { status: 403, headers: rate.headers });
  }
  const { id } = await context.params;
  if (!UUID.test(id)) return apiError("INVALID_SALE", "Venda inválida.", access.meta, { status: 400, headers: rate.headers });

  let body: { action?: unknown; gross?: unknown; percentage?: unknown; splitPercentage?: unknown; net?: unknown; paymentAmount?: unknown; dueAt?: unknown; notes?: unknown };
  try { body = await request.json(); }
  catch { return apiError("INVALID_JSON", "Dados financeiros inválidos.", access.meta, { status: 400, headers: rate.headers }); }

  const admin = getSupabaseAdmin();
  const { data: current } = await admin.from("opportunities").select("id,organization_id,won_at,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,commission_due_at,commission_received_at,commission_status,commission_notes").eq("id", id).eq("organization_id", access.access.organization.id).maybeSingle();
  if (!current || !current.won_at) return apiError("SALE_NOT_WON", "A comissão só pode ser registrada em uma venda ganha.", access.meta, { status: 404, headers: rate.headers });

  const action = String(body.action || "");
  const notes = String(body.notes || "").trim().slice(0, 2000) || null;
  const update: Record<string, unknown> = {};
  let eventType: "configured" | "partial_payment" | "received" | "due_date_changed" | "divergence" | "note";
  let eventAmount: number | null = null;

  if (action === "configure") {
    const gross = amount(body.gross); const percentage = amount(body.percentage); const split = amount(body.splitPercentage); const net = amount(body.net);
    if (gross === null || net === null || (percentage !== null && percentage > 100) || (split !== null && split > 100)) return apiError("INVALID_COMMISSION", "Informe valores e percentuais válidos.", access.meta, { status: 400, headers: rate.headers });
    Object.assign(update, { commission_gross: gross, commission_percentage: percentage, commission_split_percentage: split, commission_net: net, commission_notes: notes });
    eventType = "configured";
  } else if (action === "payment") {
    const payment = amount(body.paymentAmount);
    if (payment === null || payment <= 0) return apiError("INVALID_PAYMENT", "Informe um recebimento maior que zero.", access.meta, { status: 400, headers: rate.headers });
    const received = Math.round((Number(current.commission_received_amount || 0) + payment) * 100) / 100;
    update.commission_received_amount = received;
    if (current.commission_net && received === Number(current.commission_net)) update.commission_received_at = new Date().toISOString();
    update.commission_notes = notes || current.commission_notes;
    eventType = current.commission_net && received === Number(current.commission_net) ? "received" : received > Number(current.commission_net || Number.MAX_SAFE_INTEGER) ? "divergence" : "partial_payment";
    eventAmount = payment;
  } else if (action === "due_date") {
    const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
    if (!dueAt || Number.isNaN(dueAt.getTime())) return apiError("INVALID_DUE_DATE", "Informe uma data de vencimento válida.", access.meta, { status: 400, headers: rate.headers });
    update.commission_due_at = dueAt.toISOString(); update.commission_notes = notes || current.commission_notes; eventType = "due_date_changed";
  } else if (action === "note") {
    if (!notes) return apiError("INVALID_NOTE", "Informe uma observação.", access.meta, { status: 400, headers: rate.headers });
    update.commission_notes = notes; eventType = "note";
  } else return apiError("INVALID_ACTION", "Ação financeira inválida.", access.meta, { status: 400, headers: rate.headers });

  const { data, error } = await admin.from("opportunities").update(update).eq("id", id).eq("organization_id", access.access.organization.id).select("id,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,commission_due_at,commission_received_at,commission_status,commission_notes").single();
  if (error || !data) return apiError("COMMISSION_UPDATE_FAILED", "Não foi possível atualizar a comissão.", access.meta, { status: 400, headers: rate.headers });
  await admin.from("commission_events").insert({ organization_id: access.access.organization.id, opportunity_id: id, actor_id: access.access.profile.id, event_type: eventType, amount: eventAmount, previous_value: current, current_value: data, notes });
  structuredApiLog("info", "sales.commission.updated", request, access.meta, { organizationId: access.access.organization.id, opportunityId: id, action, eventType });
  return apiSuccess({ commission: data }, access.meta, { headers: rate.headers });
}
