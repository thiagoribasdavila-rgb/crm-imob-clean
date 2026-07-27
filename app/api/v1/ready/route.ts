import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

  try {
    const dbStartedAt = Date.now();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStartedAt,
    };
  } catch {
    checks.database = { ok: false };
  }

  const ready = Object.values(checks).every((check) => check.ok);

  // Status de configuração por integração. "configured" significa apenas que a
  // credencial está PRESENTE no ambiente — não que ela é válida (validar aqui
  // custaria chamadas externas a cada readiness probe). Nenhum valor, prefixo
  // ou comprimento de segredo sai na resposta: só o tri-estado.
  const present = (...names: string[]) => names.every((name) => Boolean(process.env[name]?.trim()));
  const integrationStatus = (configured: boolean) => (configured ? "configured" : "not_configured");
  const integrations = {
    supabase: checks.database.ok ? "connected" : "error",
    meta: integrationStatus(present("META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN") && (present("META_LEAD_ACCESS_TOKEN") || present("META_ADS_ACCESS_TOKEN"))),
    metaCapi: process.env.ATLAS_META_CAPI_ENABLED === "true"
      // O dataset saiu do ambiente e passou a viver em meta_conversion_configs,
      // por organização. Checar META_CAPI_DATASET_ID aqui deixaria a tela VERDE
      // enquanto o envio segue bloqueado — sinal verde que mente é pior que
      // vermelho. Aqui só dá para conferir o que é global: o token e a chave.
      ? integrationStatus(present("META_CONVERSIONS_ACCESS_TOKEN", "ATLAS_META_CAPI_ENABLED"))
      : "disabled",
    whatsapp: integrationStatus(present("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID")),
    openai: integrationStatus(present("OPENAI_API_KEY")),
    anthropic: integrationStatus(present("ANTHROPIC_API_KEY")),
    perplexity: integrationStatus(present("PERPLEXITY_API_KEY")),
    // E-mail transacional (recuperação de senha, convite) sai pelo SMTP do
    // Supabase Auth — não há cliente SMTP próprio nesta aplicação, então o
    // status espelha a conexão com o Supabase.
    smtp: checks.database.ok ? "via-supabase-auth" : "error",
  };

  const data = {
    service: "atlas-api-platform",
    status: ready ? "ready" : "not_ready",
    latencyMs: Date.now() - startedAt,
    checks,
    integrations,
  };

  structuredApiLog(ready ? "info" : "warn", "api.readiness.checked", request, meta, {
    ready,
    latencyMs: data.latencyMs,
  });

  return apiSuccess(data, meta, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
