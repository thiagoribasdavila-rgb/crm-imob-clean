import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function canManage(commercialRole: string | null, role: string) {
  return commercialRole === "director" || commercialRole === "superintendent" || role === "admin";
}

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.from("developer_payment_flow_rules").select("id,developer_name,version,rule_name,payment_flow,down_payment_percent,installments_count,balloon_payment_notes,financing_notes,valid_from,valid_until,active,created_at").order("developer_name").order("version", { ascending: false });
  if (error) return NextResponse.json({ error: "Aplique a migração das regras de pagamento." }, { status: 503 });
  return NextResponse.json({ rules: data ?? [], canManage: canManage(access.access.profile.commercialRole, access.access.profile.role) });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Somente diretoria e superintendência podem versionar regras." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const developerName = String(body.developerName || "").trim().slice(0, 160);
  const ruleName = String(body.ruleName || "").trim().slice(0, 160);
  const paymentFlow = String(body.paymentFlow || "").trim().slice(0, 5000);
  if (developerName.length < 2 || ruleName.length < 2 || paymentFlow.length < 10) return NextResponse.json({ error: "Informe incorporadora, nome e descrição completa do fluxo." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const org = access.access.organization.id;
  const { data: previous } = await admin.from("developer_payment_flow_rules").select("id,version").eq("organization_id", org).ilike("developer_name", developerName).order("version", { ascending: false }).limit(1).maybeSingle();
  if (previous) await admin.from("developer_payment_flow_rules").update({ active: false, updated_at: new Date().toISOString() }).eq("organization_id", org).eq("id", previous.id);
  const numberOrNull = (value: unknown) => value === "" || value === null || value === undefined ? null : Number(value);
  const { data, error } = await admin.from("developer_payment_flow_rules").insert({ organization_id: org, developer_name: developerName, version: Number(previous?.version || 0) + 1, rule_name: ruleName, payment_flow: paymentFlow, down_payment_percent: numberOrNull(body.downPaymentPercent), installments_count: numberOrNull(body.installmentsCount), balloon_payment_notes: String(body.balloonPaymentNotes || "").trim().slice(0, 2000) || null, financing_notes: String(body.financingNotes || "").trim().slice(0, 2000) || null, valid_from: body.validFrom || null, valid_until: body.validUntil || null, active: true, created_by: access.access.profile.id }).select("*").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar a regra. Revise percentuais, parcelas e vigência." }, { status: 400 });
  return NextResponse.json({ rule: data }, { status: 201 });
}
