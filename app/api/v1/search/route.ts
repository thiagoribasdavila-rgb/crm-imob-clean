import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

type Lead = { id: string; name: string | null; phone: string | null; email: string | null; status: string | null; source: string | null; purpose: string | null; score: number | null; temperature: string | null; development_id: string | null; assigned_to: string | null; next_action_at: string | null; updated_at: string | null };
const clean = (value: string) => value.normalize("NFKC").replace(/[%_(),]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  const leadSelect = "id,name,phone,email,status,source,purpose,score,temperature,development_id,assigned_to,next_action_at,updated_at";
  const [names, emails, sources, purposes, phones, projectsByName, projectsByDeveloper, brokers] = await Promise.all([
    db.from("leads").select(leadSelect).eq("organization_id", organizationId).ilike("name", `%${query}%`).limit(20),
    db.from("leads").select(leadSelect).eq("organization_id", organizationId).ilike("email", `%${query}%`).limit(20),
    db.from("leads").select(leadSelect).eq("organization_id", organizationId).ilike("source", `%${query}%`).limit(20),
    db.from("leads").select(leadSelect).eq("organization_id", organizationId).ilike("purpose", `%${query}%`).limit(20),
    digits.length >= 4 ? db.from("leads").select(leadSelect).eq("organization_id", organizationId).ilike("phone", `%${digits}%`).limit(20) : Promise.resolve({ data: [], error: null }),
    db.from("developments").select("id,name,developer_name").eq("organization_id", organizationId).ilike("name", `%${query}%`).limit(20),
    db.from("developments").select("id,name,developer_name").eq("organization_id", organizationId).ilike("developer_name", `%${query}%`).limit(20),
    db.from("profiles").select("id,full_name").eq("organization_id", organizationId).eq("active", true).ilike("full_name", `%${query}%`).limit(20),
  ]);
  const initial = [names, emails, sources, purposes, phones, projectsByName, projectsByDeveloper, brokers];
  if (initial.some((result) => result.error)) return apiError("SEARCH_FAILED", "A busca não pôde ser concluída agora.", access.meta, { status: 500, headers: rate.headers });
  const projects = [...(projectsByName.data ?? []), ...(projectsByDeveloper.data ?? [])].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
  const projectIds = projects.map((item) => item.id);
  const brokerIds = (brokers.data ?? []).map((item) => item.id);
  const [projectLeads, brokerLeads] = await Promise.all([
    projectIds.length ? db.from("leads").select(leadSelect).eq("organization_id", organizationId).in("development_id", projectIds).limit(40) : Promise.resolve({ data: [], error: null }),
    brokerIds.length ? db.from("leads").select(leadSelect).eq("organization_id", organizationId).in("assigned_to", brokerIds).limit(40) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectLeads.error || brokerLeads.error) return apiError("SEARCH_RELATION_FAILED", "Não foi possível relacionar projetos ou corretores.", access.meta, { status: 500, headers: rate.headers });
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const brokerMap = new Map((brokers.data ?? []).map((item) => [item.id, item]));
  const reasons = new Map<string, Set<string>>();
  const rows = new Map<string, Lead>();
  const add = (items: Lead[], reason: string) => { for (const lead of items) { rows.set(lead.id, lead); const current = reasons.get(lead.id) || new Set<string>(); current.add(reason); reasons.set(lead.id, current); } };
  add((names.data ?? []) as Lead[], "nome"); add((emails.data ?? []) as Lead[], "e-mail"); add((sources.data ?? []) as Lead[], "origem"); add((purposes.data ?? []) as Lead[], "intenção"); add((phones.data ?? []) as Lead[], "telefone"); add((projectLeads.data ?? []) as Lead[], "projeto"); add((brokerLeads.data ?? []) as Lead[], "corretor");
  const now = Date.now();
  const results = [...rows.values()].map((lead) => {
    const matchedBy = [...(reasons.get(lead.id) || [])];
    const overdue = Boolean(lead.next_action_at && new Date(lead.next_action_at).getTime() < now);
    const exactName = normalize(lead.name) === normalize(query);
    const rank = Number(exactName) * 100 + matchedBy.length * 12 + Math.min(100, Number(lead.score || 0)) + Number(overdue) * 8;
    const project = lead.development_id ? projectMap.get(lead.development_id) : null;
    const broker = lead.assigned_to ? brokerMap.get(lead.assigned_to) : null;
    return { type: "lead", id: lead.id, title: lead.name || "Lead sem nome", subtitle: `${project?.name || lead.source || "Origem não informada"}${broker?.full_name ? ` · ${broker.full_name}` : ""}`, status: lead.status || "novo", score: Number(lead.score || 0), temperature: lead.temperature || null, matchedBy, reason: `Encontrado por ${matchedBy.join(", ")}.`, nextAction: overdue ? "Abrir follow-up vencido" : !lead.next_action_at ? "Definir próxima ação" : "Abrir Lead 360", href: `/leads/${lead.id}`, updatedAt: lead.updated_at, rank };
  }).sort((a, b) => b.rank - a.rank || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 30).map((result) => { const output = { ...result }; Reflect.deleteProperty(output, "rank"); return output; });
  return apiSuccess({ query, results, scope: { organizationId, hierarchicalRls: true, hiddenResultsExcluded: true }, searchedFields: ["nome", "telefone", "e-mail", "projeto", "incorporadora", "corretor", "origem", "intenção"], generatedAt: new Date().toISOString() }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
