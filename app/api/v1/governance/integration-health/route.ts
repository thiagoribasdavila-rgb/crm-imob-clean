import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateIntegrationHealth } from "@/lib/integrations/operational-health";
export const dynamic = "force-dynamic";
const envReady: Record<string, () => boolean> = {
  meta: () =>
    Boolean(
      process.env.META_APP_SECRET &&
      process.env.META_LEAD_ACCESS_TOKEN &&
      process.env.META_CONVERSIONS_ACCESS_TOKEN,
    ),
  whatsapp: () =>
    Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
  google_ads: () => Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  youtube: () => Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  tiktok_ads: () => Boolean(process.env.TIKTOK_ADS_ACCESS_TOKEN),
  openai: () => Boolean(process.env.OPENAI_API_KEY),
  perplexity: () => Boolean(process.env.PERPLEXITY_API_KEY),
  storage: () =>
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  hostinger: () =>
    process.env.ATLAS_HOSTING_PROVIDER === "hostinger" &&
    /^https:\/\//.test(process.env.ATLAS_BASE_URL || "") &&
    Boolean(process.env.ATLAS_CRON_SECRET),
};
const providerTopic = (p: string, t: string) =>
  p === "meta"
    ? t.startsWith("meta.")
    : p === "whatsapp"
      ? t === "message.send"
      : false;
async function live(org: string) {
  const admin = getSupabaseAdmin(),
    since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [
    { data: connections, error },
    { data: outbox },
    { count: dlq },
    { data: metaEvents },
    { data: usage },
  ] = await Promise.all([
    admin
      .from("integrations")
      .select(
        "provider,name,status,external_account_id,last_sync_at,last_error",
      )
      .eq("organization_id", org),
    admin
      .from("integration_outbox")
      .select("topic,status,created_at")
      .eq("organization_id", org)
      .gte("created_at", since)
      .limit(30000),
    admin
      .from("dead_letter_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("resolved", false),
    admin
      .from("meta_lead_events")
      .select("received_at,status")
      .eq("organization_id", org)
      .order("received_at", { ascending: false })
      .limit(1),
    admin
      .from("ai_usage_events")
      .select("estimated_cost_usd,provider,created_at")
      .eq("organization_id", org)
      .gte("created_at", since)
      .limit(20000),
  ]);
  if (error) throw error;
  const providers = Object.keys(envReady).map((provider) => {
    const aliases =
        provider === "google_ads" || provider === "youtube"
          ? ["google", provider]
          : [provider],
      connection = (connections || []).find((c) =>
        aliases.includes(c.provider),
      ),
      topics = (outbox || []).filter((e) => providerTopic(provider, e.topic));
    return evaluateIntegrationHealth({
      provider,
      environmentReady: envReady[provider](),
      registered:
        Boolean(connection) ||
        ["openai", "perplexity", "storage", "hostinger"].includes(provider),
      verifiedStatus:
        connection?.status ||
        (["storage", "hostinger"].includes(provider) && envReady[provider]()
          ? "connected"
          : null),
      lastSyncAt:
        connection?.last_sync_at ||
        (provider === "meta" ? metaEvents?.[0]?.received_at : null),
      lastError: Boolean(connection?.last_error),
      pending: topics.filter((e) =>
        ["pending", "processing"].includes(e.status),
      ).length,
      failed: topics.filter((e) => ["failed", "dead_letter"].includes(e.status))
        .length,
    });
  });
  const queues = {
    pending: (outbox || []).filter((e) =>
      ["pending", "processing"].includes(e.status),
    ).length,
    failed: (outbox || []).filter((e) =>
      ["failed", "dead_letter"].includes(e.status),
    ).length,
    unresolvedDeadLetters: dlq || 0,
    oldestPendingAt:
      (outbox || [])
        .filter((e) => ["pending", "processing"].includes(e.status))
        .map((e) => e.created_at)
        .sort()[0] || null,
  };
  const aiCostUsd =
    Math.round(
      (usage || []).reduce((s, u) => s + Number(u.estimated_cost_usd || 0), 0) *
        1000000,
    ) / 1000000;
  const summary = {
    healthy: providers.filter((p) => p.healthy).length,
    degraded: providers.filter((p) => p.state === "degraded").length,
    readyToTest: providers.filter((p) => p.state === "ready_to_test").length,
    notReady: providers.filter((p) =>
      ["not_configured", "environment_only", "registered_only"].includes(
        p.state,
      ),
    ).length,
    total: providers.length,
    productionReady: providers
      .filter((p) =>
        ["meta", "whatsapp", "storage", "hostinger"].includes(p.provider),
      )
      .every((p) => p.healthy),
  };
  return {
    summary,
    providers,
    queues,
    runtime: {
      hostingProvider: process.env.ATLAS_HOSTING_PROVIDER || "unknown",
      publicHttps: /^https:\/\//.test(process.env.ATLAS_BASE_URL || ""),
      environment: process.env.ATLAS_ENV || "unknown",
      aiCostUsd30d: aiCostUsd,
      valuesReturned: false,
      secretsExposed: false,
    },
    generatedAt: new Date().toISOString(),
  };
}
export async function GET(req: NextRequest) {
  const rate = enforceRateLimit(req, {
    limit: 30,
    scope: "integration-health.read",
  });
  if (!rate.ok) return rate.response;
  const a = await requireAccessContext(req, { roles: ["director"] });
  if (!a.ok) return a.response;
  try {
    const current = await live(a.access.organization.id),
      { data: snapshots, error } = await getSupabaseAdmin()
        .from("integration_health_snapshots")
        .select("id,summary,queues,runtime,created_at")
        .eq("organization_id", a.access.organization.id)
        .order("created_at", { ascending: false })
        .limit(20);
    if (error)
      return apiError(
        "INTEGRATION_HEALTH_UNAVAILABLE",
        "Aplique a migration da Fase 97.",
        a.meta,
        { status: 503 },
      );
    return apiSuccess(
      {
        current,
        snapshots: snapshots || [],
        policy: {
          secretsMasked: true,
          valuesReturned: false,
          connectedRequiresVerifiedTest: true,
          healthRequiresFreshEvidence: true,
          noAutomaticStatusPromotion: true,
          directorOnly: true,
        },
      },
      a.meta,
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  } catch {
    return apiError(
      "INTEGRATION_HEALTH_FAILED",
      "Não foi possível consolidar a saúde operacional.",
      a.meta,
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  const rate = enforceRateLimit(req, {
    limit: 6,
    scope: "integration-health.snapshot",
  });
  if (!rate.ok) return rate.response;
  const a = await requireAccessContext(req, { roles: ["director"] });
  if (!a.ok) return a.response;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Envie JSON válido.", a.meta, {
      status: 400,
    });
  }
  if (body.action !== "snapshot")
    return apiError("INVALID_ACTION", "Use snapshot.", a.meta, { status: 400 });
  const current = await live(a.access.organization.id),
    hash = createHash("sha256")
      .update(
        JSON.stringify({
          summary: current.summary,
          providers: current.providers,
          queues: current.queues,
          runtime: current.runtime,
        }),
      )
      .digest("hex"),
    { data, error } = await getSupabaseAdmin()
      .from("integration_health_snapshots")
      .upsert(
        {
          organization_id: a.access.organization.id,
          summary: current.summary,
          providers: current.providers,
          queues: current.queues,
          runtime: current.runtime,
          snapshot_hash: hash,
          created_by: a.access.profile.id,
        },
        { onConflict: "organization_id,snapshot_hash", ignoreDuplicates: true },
      )
      .select("id,created_at")
      .maybeSingle();
  if (error)
    return apiError(
      "HEALTH_SNAPSHOT_FAILED",
      "Não foi possível registrar o diagnóstico.",
      a.meta,
      { status: 409 },
    );
  return apiSuccess(
    { snapshot: data, duplicatePrevented: !data, secretsStored: false },
    a.meta,
    { status: data ? 201 : 200, headers: rate.headers },
  );
}
