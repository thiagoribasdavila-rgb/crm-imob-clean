import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { homologationChecklist } from "@/lib/atlas/homologation-checklist";
import { requireAccessContext } from "@/lib/api/security";
import { buildAiCalibration } from "@/lib/atlas/ai-calibration";
import { evolutionPhases, overallEvolution, technicalEvolution } from "@/lib/atlas/evolution-phases";
import { aiProviderReadiness } from "@/lib/ai/provider-router";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const organizationId = access.access.organization.id;
  const { data, error } = await access.supabase.from("homologation_results").select("id,check_key,outcome,notes,verified_by,verified_at").eq("organization_id", organizationId).order("verified_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Aplique a migração de homologação para iniciar o roteiro." }, { status: 503 });
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [usageResult, memoryResult, knowledgeResult, decisionsResult] = await Promise.all([
    access.supabase.from("ai_usage_events").select("provider,created_at").eq("organization_id", organizationId).gte("created_at", since).order("created_at", { ascending: false }).limit(5_000),
    access.supabase.from("lead_commercial_memory_states").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    access.supabase.from("project_materials").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_current", true).eq("review_status", "verified"),
    access.supabase.from("ai_orchestration_decisions").select("id,created_at,completed_at", { count: "exact" }).eq("organization_id", organizationId).gte("created_at", since).order("created_at", { ascending: false }).limit(1),
  ]);
  const latestByCheck = new Map<string, { outcome: string; verified_at: string | null }>();
  for (const result of data ?? []) {
    if (!latestByCheck.has(result.check_key)) latestByCheck.set(result.check_key, result);
  }
  const providers = aiProviderReadiness();
  const configuredProviders = [providers.openai, providers.deepseek, providers.qwen, providers.kimi, providers.glm].filter(Boolean).length;
  const usageRows = usageResult.data ?? [];
  const validatedProviders = new Set(usageRows.filter((row) => row.provider !== "local" && row.provider !== "perplexity").map((row) => row.provider)).size;
  const passedChecks = [...latestByCheck.values()].filter((result) => result.outcome === "passed").length;
  const measuredAt = [usageRows[0]?.created_at, decisionsResult.data?.[0]?.completed_at || decisionsResult.data?.[0]?.created_at, ...[...latestByCheck.values()].map((result) => result.verified_at)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const aiCalibration = buildAiCalibration({
    configuredGenerativeProviders: configuredProviders,
    validatedGenerativeProviders: validatedProviders,
    usageEvents: usageRows.length,
    memoryRecords: memoryResult.count ?? 0,
    verifiedKnowledgeDocuments: knowledgeResult.count ?? 0,
    supervisedDecisions: decisionsResult.count ?? 0,
    passedHomologationChecks: passedChecks,
    totalHomologationChecks: homologationChecklist.length,
    measuredAt,
  });
  const deployment = { hostinger: process.env.ATLAS_HOSTING_PROVIDER === "hostinger", publicUrl: Boolean(process.env.ATLAS_BASE_URL), passwordRecovery: Boolean((process.env.ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL)?.startsWith("https://")), cron: Boolean(process.env.ATLAS_CRON_SECRET), openai: Boolean(process.env.OPENAI_API_KEY), perplexity: Boolean(process.env.PERPLEXITY_API_KEY), metaLeads: Boolean(process.env.META_APP_SECRET && process.env.META_LEAD_ACCESS_TOKEN), metaConversions: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN), metaInsights: Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID), nightlyTemplate: Boolean(process.env.WHATSAPP_NIGHTLY_APPROACH_TEMPLATE) };
  return NextResponse.json({ checks: homologationChecklist, results: data ?? [], readiness: { overallEvolution, technicalEvolution, aiCalibration, phases: evolutionPhases, deployment }, currentUser: { id: access.access.profile.id, commercialRole: access.access.profile.commercialRole || (access.access.profile.role === "admin" ? "director" : access.access.profile.role) } });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const body = await request.json() as { checkKey?: string; outcome?: string; notes?: string };
  const check = homologationChecklist.find((item) => item.key === body.checkKey);
  const role = access.access.profile.commercialRole || (access.access.profile.role === "admin" ? "director" : access.access.profile.role);
  if (!check || ![check.role, "director"].includes(role)) return NextResponse.json({ error: "Este teste deve ser validado pelo perfil responsável ou supervisionado pela diretoria." }, { status: 403 });
  if (body.outcome !== "passed" && body.outcome !== "failed") return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });
  const { data, error } = await access.supabase.from("homologation_results").upsert({ organization_id: access.access.organization.id, check_key: check.key, outcome: body.outcome, notes: String(body.notes || "").trim().slice(0, 1000) || null, verified_by: access.access.profile.id, verified_at: new Date().toISOString() }, { onConflict: "organization_id,check_key,verified_by" }).select("id,check_key,outcome,notes,verified_by,verified_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível registrar a evidência." }, { status: 400 });
  return NextResponse.json({ result: data });
}
