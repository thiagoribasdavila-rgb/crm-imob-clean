import type { NextRequest } from "next/server";
import { readCompatibleDevelopments, readCompatibleLeads } from "@/lib/atlas/core-v2";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_PROFILE_SELECT, mapLegacyProfile, type CompatRow } from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

const clean = (value: string) => value.normalize("NFKC").replace(/[%_(),]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();
const includes = (value: unknown, query: string) => normalize(value).includes(query);
const includesDigits = (value: unknown, digits: string) => digits.length >= 4 && String(value ?? "").replace(/\D/g, "").includes(digits);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, windowMs: 60_000, scope: "crm.smart-search" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;
  const query = clean(request.nextUrl.searchParams.get("q") || "");
  if (query.length < 2) return apiError("QUERY_TOO_SHORT", "Digite ao menos dois caracteres.", access.meta, { status: 400, headers: rate.headers });
  const digits = query.replace(/\D/g, "");
  const db = access.supabase;
  const organizationId = access.access.organization.id;
  const queryNorm = normalize(query);
  const [leads, developments, profileResult] = await Promise.all([
    readCompatibleLeads(db, { organizationId, limit: 5000, includeArchived: true }),
    readCompatibleDevelopments(db, { organizationId, limit: 1000 }),
    db.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(1000),
  ]);

  if (!leads.ok) return apiError("SEARCH_FAILED", "A busca não pôde ser concluída agora.", access.meta, { status: 500, headers: rate.headers });

  const projectRows = developments.ok ? developments.rows : [];
  const brokers = profileResult.error ? [] : ((profileResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyProfile);
  const projectMap = new Map(projectRows.map((item) => [String(item.id), item]));
  const brokerMap = new Map(brokers.map((item) => [String(item.id), item]));
  const reasons = new Map<string, Set<string>>();
  const rows = new Map<string, CompatRow>();
  for (const lead of leads.rows) {
    const project = lead.development_id ? projectMap.get(String(lead.development_id)) : null;
    const broker = lead.assigned_to ? brokerMap.get(String(lead.assigned_to)) : null;
    const matchedBy = new Set<string>();
    if (includes(lead.name, queryNorm)) matchedBy.add("nome");
    if (includes(lead.email, queryNorm)) matchedBy.add("e-mail");
    if (includes(lead.source, queryNorm) || includes(lead.campaign, queryNorm)) matchedBy.add("origem");
    if (includes(lead.purpose, queryNorm)) matchedBy.add("intenção");
    if (includesDigits(lead.phone, digits)) matchedBy.add("telefone");
    if (includes(lead.project, queryNorm) || includes(project?.development_name ?? project?.name, queryNorm) || includes(project?.developer_name, queryNorm)) matchedBy.add("projeto");
    if (includes(broker?.full_name ?? broker?.name, queryNorm) || includes(broker?.email, queryNorm)) matchedBy.add("corretor");
    if (matchedBy.size === 0) continue;
    rows.set(String(lead.id), lead);
    reasons.set(String(lead.id), matchedBy);
  }
  const now = Date.now();
  const results = [...rows.values()].map((lead) => {
    const matchedBy = [...(reasons.get(String(lead.id)) || [])];
    const overdue = Boolean(lead.next_action_at && new Date(String(lead.next_action_at)).getTime() < now);
    const exactName = normalize(lead.name) === normalize(query);
    const rank = Number(exactName) * 100 + matchedBy.length * 12 + Math.min(100, Number(lead.score || 0)) + Number(overdue) * 8;
    const project = lead.development_id ? projectMap.get(String(lead.development_id)) : null;
    const broker = lead.assigned_to ? brokerMap.get(String(lead.assigned_to)) : null;
    const projectName = text(project?.development_name ?? project?.name ?? lead.project);
    const brokerName = text(broker?.full_name ?? broker?.name);
    return { type: "lead", id: lead.id, title: lead.name || "Lead sem nome", subtitle: `${projectName || lead.source || "Origem não informada"}${brokerName ? ` · ${brokerName}` : ""}`, status: lead.status || "novo", score: Number(lead.score || 0), temperature: lead.temperature || null, matchedBy, reason: `Encontrado por ${matchedBy.join(", ")}.`, nextAction: overdue ? "Abrir follow-up vencido" : !lead.next_action_at ? "Definir próxima ação" : "Abrir Lead 360", href: `/leads/${lead.id}`, updatedAt: lead.updated_at, rank };
  }).sort((a, b) => b.rank - a.rank || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 30).map((result) => { const output = { ...result }; Reflect.deleteProperty(output, "rank"); return output; });
  return apiSuccess({ query, results, scope: { organizationId, hierarchicalRls: true, hiddenResultsExcluded: true, compatibilityLayer: true }, searchedFields: ["nome", "telefone", "e-mail", "projeto", "incorporadora", "corretor", "origem", "intenção"], generatedAt: new Date().toISOString() }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
