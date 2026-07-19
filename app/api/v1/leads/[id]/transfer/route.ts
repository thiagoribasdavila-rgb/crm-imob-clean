import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { recordAuditLog, clientIp, userAgentOf } from "@/lib/api/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };
const roles = new Set(["director", "superintendent", "manager"]);
const uuid = /^[0-9a-f-]{36}$/i;
function descendants(rows: Array<{ id: string; reports_to: string | null }>, root: string) { const set = new Set([root]); let changed = true; while (changed) { changed = false; for (const row of rows) if (row.reports_to && set.has(row.reports_to) && !set.has(row.id)) { set.add(row.id); changed = true; } } return set; }
const roleOf = (identity: { access: { profile: { commercialRole: string | null; role: string } } }) => identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);

export async function GET(request: NextRequest, context: Context) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "single-lead-transfer-read" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const role = roleOf(identity); if (!roles.has(role)) return apiError("TRANSFER_FORBIDDEN", "Transferência exclusiva da liderança.", identity.meta, { status: 403 });
  const { id } = await context.params;
  const lead = await identity.supabase.from("leads").select("id,name,assigned_to").eq("id", id).eq("organization_id", identity.access.organization.id).maybeSingle();
  if (lead.error || !lead.data) return apiError("TRANSFER_LEAD_NOT_VISIBLE", "Lead fora do seu escopo.", identity.meta, { status: 404 });
  const leadData = lead.data;
  const profiles = await getSupabaseAdmin().from("profiles").select("id,full_name,commercial_role,role,reports_to,active").eq("organization_id", identity.access.organization.id).eq("active", true);
  if (profiles.error) return apiError("TRANSFER_TARGETS_FAILED", "Não foi possível carregar destinos.", identity.meta, { status: 500 });
  const allowed = role === "director" ? new Set((profiles.data ?? []).map((profile) => profile.id)) : descendants(profiles.data ?? [], identity.access.profile.id);
  const targets = (profiles.data ?? []).filter((profile) => (profile.commercial_role || profile.role) === "broker" && allowed.has(profile.id) && profile.id !== leadData.assigned_to && (role !== "manager" || profile.reports_to === identity.access.profile.id)).map((profile) => ({ id: profile.id, name: profile.full_name || "Corretor" }));
  return apiSuccess({ lead: { id: leadData.id, name: leadData.name || "Lead", expectedOwnerId: leadData.assigned_to }, targets, policy: { reasonRequired: true, minimumReasonLength: 10, optimisticOwnerCheck: true, singleOwner: true, openTasksFollowOwner: true } }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: Context) {
  const rate = enforceRateLimit(request, { limit: 15, scope: "single-lead-transfer-write" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!roles.has(roleOf(identity))) return apiError("TRANSFER_FORBIDDEN", "Transferência exclusiva da liderança.", identity.meta, { status: 403 });
  const { id } = await context.params; const body = await request.json(); const targetOwnerId = String(body.targetOwnerId || ""); const expectedOwnerId = body.expectedOwnerId === null ? null : String(body.expectedOwnerId || ""); const reason = String(body.reason || "").trim();
  if (!uuid.test(id) || !uuid.test(targetOwnerId) || (expectedOwnerId !== null && !uuid.test(expectedOwnerId)) || reason.length < 10 || reason.length > 500) return apiError("TRANSFER_INVALID", "Informe destino e motivo entre 10 e 500 caracteres.", identity.meta, { status: 400 });
  const result = await getSupabaseAdmin().rpc("transfer_single_lead", { p_actor_id: identity.access.profile.id, p_organization_id: identity.access.organization.id, p_lead_id: id, p_expected_owner_id: expectedOwnerId, p_target_owner_id: targetOwnerId, p_reason: reason });
  if (result.error) return apiError(result.error.message.includes("owner_conflict") ? "TRANSFER_OWNER_CONFLICT" : "TRANSFER_REJECTED", result.error.message.includes("owner_conflict") ? "A lead mudou de responsável. Atualize antes de tentar novamente." : "Transferência não permitida.", identity.meta, { status: result.error.message.includes("owner_conflict") ? 409 : 403 });
  await recordAuditLog({ organizationId: identity.access.organization.id, actorId: identity.access.profile.id, action: "leads.transfer", module: "leads", resourceType: "lead", resourceId: id, ip: clientIp(request), userAgent: userAgentOf(request), metadata: { targetOwnerId, reasonLength: reason.length } });
  return apiSuccess(result.data, identity.meta, { headers: rate.headers });
}
