import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
function reportDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 2, windowMs: 60 * 60_000, scope: "meta-daily-report-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Ensaio do relatório diário é exclusivo da diretoria.", identity.meta, { status: 403 });
  const secret = process.env.ATLAS_CRON_SECRET;
  const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
  if (!secret || !/^https:\/\//i.test(baseUrl)) return apiError("DAILY_REPORT_NOT_READY", "Configure cron e URL HTTPS na Hostinger.", identity.meta, { status: 503 });
  try {
    const execute = async () => { const response = await fetch(`${baseUrl}/api/v2/meta/daily-report`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(55_000) }); const body = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(`Cron HTTP ${response.status}`); return body; };
    const admin = getSupabaseAdmin();
    const first = await execute();
    const { data: afterFirst } = await admin.from("meta_daily_reports").select("id,updated_at").eq("organization_id", identity.access.organization.id).eq("report_date", reportDate()).maybeSingle();
    const second = await execute();
    const { data: reports, count } = await admin.from("meta_daily_reports").select("id,status,report_date,payload,created_at,updated_at", { count: "exact" }).eq("organization_id", identity.access.organization.id).eq("report_date", reportDate());
    const report = reports?.[0];
    const duplicateWorkPrevented = Boolean(afterFirst && report && afterFirst.id === report.id && afterFirst.updated_at === report.updated_at && Number(second.skipped || 0) >= 1);
    if (count !== 1 || !report || !["ready", "reviewed"].includes(report.status) || !duplicateWorkPrevented) throw new Error("O relatório único do dia não foi confirmado.");
    return apiSuccess({ status: "passed", reportDate: report.report_date, reportId: report.id, reportCount: count, firstExecution: first, secondExecution: second, duplicateWorkPrevented, reportStatus: report.status, generatedAt: report.payload && typeof report.payload === "object" ? (report.payload as Record<string, unknown>).generatedAt || null : null, testedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch (error) {
    return apiError("DAILY_REPORT_TEST_FAILED", "O ensaio não comprovou um único relatório diário. Consulte os logs seguros.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}
