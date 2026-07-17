import { NextResponse, type NextRequest } from "next/server";
import { structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext, resolveCommercialRole } from "@/lib/api/security";

export const dynamic = "force-dynamic";
const MAX_ROWS = 10_000;

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value).replace(/[\r\n]+/g, " ").trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 5, windowMs: 15 * 60_000, scope: "leads.export" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = resolveCommercialRole(identity.access.profile);
  if (!["director", "superintendent", "manager", "broker"].includes(role)) return NextResponse.json({ error: "Perfil sem acesso à exportação." }, { status: 403 });

  let query = identity.supabase.from("leads")
    .select("id,name,status,temperature,score,source,assigned_to,development_id,created_at,updated_at,next_action_at,budget_min,budget_max")
    .eq("organization_id", identity.access.organization.id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS + 1);
  if (role === "broker") query = query.eq("assigned_to", identity.access.profile.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível gerar a exportação dentro do seu escopo." }, { status: 500 });

  const truncated = (data?.length ?? 0) > MAX_ROWS;
  const rows = (data ?? []).slice(0, MAX_ROWS);
  const headers = ["ID", "Nome", "Status", "Temperatura", "Score", "Origem", "Responsável", "Projeto", "Criada em", "Atualizada em", "Próxima ação", "Orçamento mínimo", "Orçamento máximo"];
  const keys = ["id", "name", "status", "temperature", "score", "source", "assigned_to", "development_id", "created_at", "updated_at", "next_action_at", "budget_min", "budget_max"] as const;
  const csv = `\uFEFF${headers.map(csvCell).join(";")}\n${rows.map((row) => keys.map((key) => csvCell(row[key])).join(";")).join("\n")}`;
  structuredApiLog("info", "crm.leads_exported", request, identity.meta, { userId: identity.access.profile.id, organizationId: identity.access.organization.id, role, rowCount: rows.length, truncated, personalContactFieldsReturned: false });
  return new NextResponse(csv, { status: 200, headers: { ...rate.headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="atlas-leads-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Atlas-Export-Scope": role, "X-Atlas-Export-Truncated": String(truncated) } });
}
