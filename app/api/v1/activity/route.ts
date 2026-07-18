import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  activityCategoryForType,
  type ActivityCategory,
} from "@/lib/atlas/activity-timeline";
import { mapLegacyLead, mapLegacyProfile } from "@/lib/compat/legacy-v2";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type ActivityRow = {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  title: string | null;
  description: string | null;
  type: string | null;
  occurred_at: string | null;
};

const emptyCounts = (): Record<ActivityCategory, number> => ({
  change: 0,
  contact: 0,
  transfer: 0,
  ai: 0,
  proposal: 0,
  external: 0,
});

const dateKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 90,
    scope: "activity-history-read",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const result = await identity.supabase
    .from("activities")
    .select("id,lead_id,user_id,title,description,type,occurred_at")
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (result.error) {
    logger.warn("activity.history.read_failed", {
      organizationId,
      code: result.error.code,
    });
    return apiError(
      "ACTIVITY_HISTORY_LOAD_FAILED",
      "O histórico comercial está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }

  const rows = ((result.data ?? []) as ActivityRow[]).filter((row) => {
    if (!row.occurred_at) return false;
    return Number.isFinite(new Date(row.occurred_at).getTime());
  });
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((value): value is string => Boolean(value)))];
  const profileIds = [...new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value)))];
  const [leadResult, profileResult] = await Promise.all([
    leadIds.length
      ? identity.supabase.from("leads").select("*").eq("organization_id", organizationId).in("id", leadIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    profileIds.length
      ? identity.supabase.from("profiles").select("*").eq("organization_id", organizationId).in("id", profileIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  if (leadResult.error || profileResult.error) {
    logger.warn("activity.history.enrichment_degraded", {
      organizationId,
      leads: leadResult.error?.code,
      profiles: profileResult.error?.code,
    });
  }

  const leads = new Map(
    ((leadResult.data ?? []) as Record<string, unknown>[])
      .map(mapLegacyLead)
      .map((lead) => [String(lead.id), lead]),
  );
  const profiles = new Map(
    ((profileResult.data ?? []) as Record<string, unknown>[])
      .map(mapLegacyProfile)
      .map((profile) => [String(profile.id), profile]),
  );
  const counts = emptyCounts();
  const events = rows.map((row) => {
    const category = activityCategoryForType(row.type);
    const lead = row.lead_id ? leads.get(row.lead_id) : null;
    const profile = row.user_id ? profiles.get(row.user_id) : null;
    counts[category] += 1;
    return {
      id: row.id,
      category,
      title: String(row.title || "Atividade registrada").slice(0, 180),
      description: row.description ? String(row.description).slice(0, 900) : null,
      occurredAt: String(row.occurred_at),
      source: String(row.type || "crm"),
      leadId: row.lead_id,
      leadName: lead ? String(lead.name || "Lead sem nome") : null,
      leadStatus: lead?.status ? String(lead.status) : null,
      actorName: profile
        ? String(profile.full_name || "Equipe Atlas")
        : row.user_id
          ? "Equipe Atlas"
          : "Automação Atlas",
    };
  });
  const today = dateKey(new Date().toISOString());

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        hierarchicalRls: true,
        readOnly: true,
      },
      summary: {
        total: events.length,
        today: events.filter((event) => dateKey(event.occurredAt) === today).length,
        contacts: counts.contact,
        leadsInMotion: new Set(events.map((event) => event.leadId).filter(Boolean)).size,
      },
      counts,
      events,
      generatedAt: new Date().toISOString(),
      compatibility: leadResult.error || profileResult.error ? "safe-base-history" : "canonical-history",
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
