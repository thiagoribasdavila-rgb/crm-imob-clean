import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildAiCommercialContextReadiness,
  type CommercialContextMemoryRow,
} from "@/lib/analytics/ai-commercial-context-readiness";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const OBSERVED_LIMIT = 5_000;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    scope: "ai-commercial-context-readiness",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const director =
    identity.access.profile.role === "admin" ||
    identity.access.profile.commercialRole === "director";
  if (!director) {
    return apiError(
      "FORBIDDEN",
      "A prontidão consolidada do contexto comercial é exclusiva da diretoria.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const countResult = await admin
    .from("lead_commercial_memory_states")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (countResult.error) {
    return apiError(
      "AI_COMMERCIAL_CONTEXT_READINESS_FAILED",
      "Não foi possível medir a prontidão do contexto comercial.",
      identity.meta,
      { status: 502, headers: rate.headers },
    );
  }

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const memories: CommercialContextMemoryRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("lead_commercial_memory_states")
      .select(
        "development_id,stage_key,broker_id,recommended_action_key,interaction_count,last_interaction_at,expires_at",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) {
      return apiError(
        "AI_COMMERCIAL_CONTEXT_READINESS_FAILED",
        "Não foi possível medir a prontidão do contexto comercial.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    memories.push(...((page.data ?? []) as CommercialContextMemoryRow[]));
  }

  return apiSuccess(
    buildAiCommercialContextReadiness({
      memories,
      sourceTotal,
      observedLimit: OBSERVED_LIMIT,
    }),
    identity.meta,
    { headers: rate.headers },
  );
}
