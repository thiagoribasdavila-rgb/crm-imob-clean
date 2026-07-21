import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateKaizen, kaizenPriority, kaizenQuadrant, type KaizenInput } from "@/lib/atlas/kaizen";

export const dynamic = "force-dynamic";

function isLeadership(role: string): boolean {
  return ["director", "superintendent", "manager"].includes(role);
}
function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

// GET — lista as ideias. Liderança vê todas; corretor vê as suas + as decididas
// (aprovadas/implementadas/rejeitadas) para transparência do que a operação decidiu.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "kaizen-list" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const org = identity.access.organization.id;
  const userId = identity.access.profile.id;
  const leadership = isLeadership(roleOf(identity.access));

  const admin = getSupabaseAdmin();
  const { data: ideas, error } = await admin
    .from("kaizen_ideas")
    .select("id,title,description,category,impact,effort,priority,quadrant,status,votes,author_id,decision_reason,decided_at,created_at")
    .eq("organization_id", org)
    .order("priority", { ascending: false })
    .order("votes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return apiError("KAIZEN_UNAVAILABLE", "Kaizen indisponível até a ativação do banco.", identity.meta, { status: 503 });

  const visible = (ideas ?? []).filter(
    (i) => leadership || i.author_id === userId || ["aprovada", "implementada", "rejeitada"].includes(i.status),
  );

  // marca as ideias que este usuário já votou
  const ids = visible.map((i) => i.id);
  const { data: myVotes } = ids.length
    ? await admin.from("kaizen_votes").select("idea_id").eq("user_id", userId).in("idea_id", ids)
    : { data: [] };
  const voted = new Set((myVotes ?? []).map((v) => v.idea_id));

  const items = visible.map((i) => ({ ...i, mine: i.author_id === userId, votedByMe: voted.has(i.id) }));
  return apiSuccess({ scope: { leadership }, count: items.length, items }, identity.meta, { headers: limited.headers });
}

// POST — submete uma ideia (qualquer pessoa da operação).
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "kaizen-submit" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const body = (await request.json().catch(() => null)) as KaizenInput | null;
  const valid = validateKaizen(body ?? {});
  if (!valid.ok) return apiError("INVALID_KAIZEN", valid.error, identity.meta, { status: 422 });
  const idea = valid.value;

  const admin = getSupabaseAdmin();
  const { data: created, error } = await admin
    .from("kaizen_ideas")
    .insert({
      organization_id: identity.access.organization.id,
      author_id: identity.access.profile.id,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      impact: idea.impact,
      effort: idea.effort,
      priority: kaizenPriority(idea.impact, idea.effort),
      quadrant: kaizenQuadrant(idea.impact, idea.effort),
      status: "nova",
    })
    .select("id,status,priority,quadrant")
    .single();
  if (error || !created) return apiError("KAIZEN_FAILED", "Não foi possível registrar a ideia.", identity.meta, { status: 500 });
  return apiSuccess({ id: created.id, status: created.status, priority: created.priority, quadrant: created.quadrant }, identity.meta, { headers: limited.headers });
}
