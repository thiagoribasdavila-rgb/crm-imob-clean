import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canTransition, decisionRequiresReason } from "@/lib/atlas/kaizen";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

type Body = { action?: "vote" | "decide"; to?: string; reason?: string };

// POST — vote (qualquer um, 1 por pessoa, alterna) OU decide (liderança move o status).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "kaizen-action" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const { id } = await context.params;
  const org = identity.access.organization.id;
  const userId = identity.access.profile.id;
  const admin = getSupabaseAdmin();

  const { data: idea, error } = await admin
    .from("kaizen_ideas").select("id,status,votes").eq("id", id).eq("organization_id", org).maybeSingle();
  if (error || !idea) return apiError("KAIZEN_NOT_FOUND", "Ideia não encontrada.", identity.meta, { status: 404 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const action = body?.action ?? "vote";

  // ---- VOTAR (alterna, 1 por pessoa) ----
  if (action === "vote") {
    const { data: existing } = await admin
      .from("kaizen_votes").select("id").eq("idea_id", id).eq("user_id", userId).maybeSingle();
    let votes = idea.votes;
    if (existing) {
      await admin.from("kaizen_votes").delete().eq("id", existing.id);
      votes = Math.max(0, votes - 1);
    } else {
      const { error: insErr } = await admin.from("kaizen_votes").insert({ idea_id: id, user_id: userId });
      if (insErr) return apiError("VOTE_FAILED", "Não foi possível registrar o voto.", identity.meta, { status: 500 });
      votes = votes + 1;
    }
    await admin.from("kaizen_ideas").update({ votes }).eq("id", id);
    return apiSuccess({ id, votes, votedByMe: !existing }, identity.meta, { headers: limited.headers });
  }

  // ---- DECIDIR (só liderança) ----
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Só a liderança avalia ideias do Kaizen.", identity.meta, { status: 403 });
  }
  const to = String(body?.to ?? "").trim();
  if (!canTransition(idea.status, to)) {
    return apiError("INVALID_TRANSITION", `Não dá para mover de "${idea.status}" para "${to || "?"}".`, identity.meta, { status: 409 });
  }
  const reason = String(body?.reason ?? "").trim();
  if (decisionRequiresReason(to) && reason.length < 5) {
    return apiError("REASON_REQUIRED", "Informe o motivo da recusa.", identity.meta, { status: 400 });
  }
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("kaizen_ideas")
    .update({ status: to, decided_by: userId, decision_reason: reason || null, decided_at: now, updated_at: now })
    .eq("id", id).eq("status", idea.status); // guard contra corrida
  if (upErr) return apiError("DECIDE_FAILED", "Não foi possível registrar a decisão.", identity.meta, { status: 500 });
  return apiSuccess({ id, status: to, decidedAt: now }, identity.meta, { headers: limited.headers });
}
