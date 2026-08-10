import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchMetaCampaignInsights } from "@/lib/meta/insights";
import { buildWeeklyAcquisitionReport } from "@/lib/analytics/weekly-acquisition-report";
import {
  isMissingColumn,
  isMissingRelation,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

const CANONICAL_LEADS =
  "id,campaign_id,development_id,source,status,score,metadata,created_at,assigned_to,first_contacted_at";
const LEGACY_LEADS =
  "id,campaign_id,project_id,status,score_ia,created_at,assigned_user_id,campaign";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    scope: "analytics.weekly-acquisition",
  });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, {
    roles: ["admin", "director"],
  });
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const canonicalLeadResult = await admin
    .from("leads")
    .select(CANONICAL_LEADS)
    .eq("organization_id", organizationId)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(10000);
  let leadData = (canonicalLeadResult.data ?? []) as unknown as CompatRow[];
  let leadError = canonicalLeadResult.error;
  if (isMissingColumn(canonicalLeadResult.error)) {
    const legacyLeadResult = await admin
      .from("leads")
      .select(LEGACY_LEADS)
      .eq("organization_id", organizationId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .limit(10000);
    leadData = (legacyLeadResult.data ?? []) as unknown as CompatRow[];
    leadError = legacyLeadResult.error;
  }

  const canonicalDevelopmentResult = await admin
    .from("developments")
    .select("id,name,developer_id,developer_name")
    .eq("organization_id", organizationId)
    .limit(1000);
  let developmentData = (canonicalDevelopmentResult.data ?? []) as unknown[];
  let developmentError = canonicalDevelopmentResult.error;
  if (isMissingColumn(canonicalDevelopmentResult.error)) {
    const compatibleDevelopmentResult = await admin
      .from("developments")
      .select("id,name,developer_name")
      .eq("organization_id", organizationId)
      .limit(1000);
    developmentData = compatibleDevelopmentResult.data ?? [];
    developmentError = compatibleDevelopmentResult.error;
  }
  if (isMissingRelation(developmentError)) {
    const legacyDevelopmentResult = await admin
      .from("crm_projects")
      .select("id,name,developer_name")
      .eq("organization_id", organizationId)
      .limit(1000);
    developmentData = legacyDevelopmentResult.data ?? [];
    developmentError = legacyDevelopmentResult.error;
  }

  const canonicalProfileResult = await admin
    .from("profiles")
    .select("id,full_name")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .limit(1000);
  let profileData = (canonicalProfileResult.data ?? []) as unknown[];
  let profileError = canonicalProfileResult.error;
  if (isMissingColumn(canonicalProfileResult.error)) {
    const compatibleProfileResult = await admin
      .from("profiles")
      .select("id,name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(1000);
    profileData = compatibleProfileResult.data ?? [];
    profileError = compatibleProfileResult.error;
  }

  const [developerResult, activityResult, campaignResult] = await Promise.all([
    admin
      .from("developers")
      .select("id,trade_name,legal_name")
      .eq("organization_id", organizationId)
      .limit(1000),
    admin
      .from("activities")
      .select("lead_id,user_id,type,occurred_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", startIso)
      .lt("occurred_at", endIso)
      .limit(20000),
    admin
      .from("campaigns")
      .select("id,name,developer_id,development_id")
      .eq("organization_id", organizationId)
      .limit(5000),
  ]);

  if (leadError || developmentError || profileError) {
    return NextResponse.json(
      { error: "Não foi possível consolidar o relatório semanal." },
      { status: 500 },
    );
  }

  let paid: Awaited<ReturnType<typeof fetchMetaCampaignInsights>> = [];
  const warnings: string[] = [];
  try {
    paid = await fetchMetaCampaignInsights(7);
  } catch {
    warnings.push("Meta Ads ainda não forneceu o custo semanal.");
  }
  if (activityResult.error)
    warnings.push(
      "As interações dos corretores não puderam ser consolidadas; os avanços do funil continuam disponíveis.",
    );
  if (developerResult.error && !isMissingRelation(developerResult.error))
    warnings.push(
      "O cadastro canônico de incorporadoras não pôde ser lido; nomes legados dos projetos foram preservados.",
    );

  const leads = leadData.map((row) => ({ ...row, ...mapLegacyLead(row) }));
  const report = buildWeeklyAcquisitionReport(
    leads as never[],
    developmentData as never[],
    paid,
    profileData as never[],
    (activityResult.error ? [] : (activityResult.data ?? [])) as never[],
    (developerResult.error ? [] : (developerResult.data ?? [])) as never[],
    (campaignResult.error ? [] : (campaignResult.data ?? [])) as never[],
  );
  return NextResponse.json(
    {
      ...report,
      period: { start: startIso, end: endIso, timezone: "America/Sao_Paulo" },
      warnings,
      generatedAt: new Date().toISOString(),
    },
    { headers: { ...rate.headers, "Cache-Control": "private, no-store" } },
  );
}
