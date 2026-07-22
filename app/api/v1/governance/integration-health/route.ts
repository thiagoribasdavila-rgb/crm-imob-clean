import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateIntegrationHealth } from "@/lib/integrations/operational-health";
export const dynamic = "force-dynamic";
// 'meta' e 'meta_marketing' são DUAS integrações, com tokens e escopos
// diferentes: Lead Ads/CAPI recebe lead e devolve conversão; a Marketing API é
// a camada que LÊ e GASTA verba. Medi-las na mesma linha fazia o painel ficar
// verde com a camada do dinheiro morta — o token expirado da Marketing API foi
// descoberto por um humano escrevendo docs/META_ASSET_INVENTORY.md, não pelo
// produto.
const envReady: Record<string, () => boolean> = {
  meta: () =>
    Boolean(
      process.env.META_APP_SECRET &&
      process.env.META_LEAD_ACCESS_TOKEN &&
      process.env.META_CONVERSIONS_ACCESS_TOKEN,
    ),
  meta_marketing: () =>
    Boolean(
      process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID,
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
// meta_marketing não tem tópico de fila: ela é síncrona (leitura de insights e
// execução sob aprovação). Fila zero aqui é FATO, não ausência de medição.
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
    { data: tokenStuck, error: tokenStuckError },
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
    // Sem janela de 30 dias DE PROPÓSITO: token expirado há mais tempo continua
    // bloqueando a fila hoje. Consulta separada (e não uma coluna a mais no
    // SELECT acima) porque `cause` depende da migration 20260722150000: se ela
    // não estiver aplicada, o erro fica confinado aqui e vira "não medido", em
    // vez de derrubar o painel inteiro.
    admin
      .from("integration_outbox")
      .select("topic,created_at")
      .eq("organization_id", org)
      .eq("cause", "token_unhealthy")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);
  if (error) throw error;
  const tokenMeasured = !tokenStuckError;
  const tokenRows = tokenStuck || [];
  const providers = Object.keys(envReady).map((provider) => {
    const aliases =
        provider === "google_ads" || provider === "youtube"
          ? ["google", provider]
          // A Marketing API não tem cadastro próprio em `integrations`: ela
          // compartilha a conexão 'meta'. Sem o alias, a linha nova nasceria
          // "sem cadastro" por artefato de nomenclatura.
          : provider === "meta_marketing"
            ? ["meta"]
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
        connection?.status || null,
      lastSyncAt:
        connection?.last_sync_at ||
        (provider === "meta" ? metaEvents?.[0]?.received_at : null),
      lastError: Boolean(connection?.last_error),
      pending: topics.filter((e) =>
        ["pending", "processing"].includes(e.status),
      ).length,
      failed: topics.filter((e) => ["failed", "dead_letter"].includes(e.status))
        .length,
      tokenUnhealthy: tokenMeasured
        ? tokenRows.filter((e) => providerTopic(provider, e.topic)).length
        : undefined,
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
    // Fila presa por credencial: o worker mantém esses eventos retryable e sem
    // consumir tentativa, então eles NÃO aparecem em dead letters — o alarme
    // que existia ficava zero justamente durante o incidente. `measured: false`
    // é lacuna declarada (migration 20260722150000 pendente), não zero.
    tokenUnhealthy: tokenMeasured
      ? {
          measured: true,
          count: tokenRows.length,
          oldestAt: tokenRows[0]?.created_at || null,
        }
      : {
          measured: false,
          reason:
            "coluna integration_outbox.cause indisponível (migration 20260722150000 pendente)",
        },
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
    // A lista continua a mesma de antes (a Marketing API entrou como LINHA
    // nova, não como novo requisito) — mas publicada, para "Produção pronta"
    // não ser lido como "tudo pronto": o chip nunca falou da camada que gasta.
    productionReadyCovers: ["meta", "whatsapp", "storage", "hostinger"],
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
          secretsExposed: false,
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
