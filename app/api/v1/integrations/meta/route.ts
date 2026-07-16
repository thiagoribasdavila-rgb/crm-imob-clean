import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const [{ data: sources, error }, { data: events }] = await Promise.all([
    access.supabase.from("meta_lead_sources").select("id,page_id,form_id,name,active,default_owner_id,created_at,updated_at").order("created_at", { ascending: false }),
    access.supabase.from("meta_lead_events").select("id,status,received_at,processed_at,last_error").order("received_at", { ascending: false }).limit(100),
  ]);
  if (error) return NextResponse.json({ error: "Aplique a migração Meta Lead Ads para configurar fontes." }, { status: 503 });
  const summary = (events ?? []).reduce((total, event) => ({ ...total, [event.status]: (total[event.status] || 0) + 1 }), {} as Record<string, number>);
  return NextResponse.json({ sources: sources ?? [], summary, readiness: { webhookSecret: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN), graphToken: Boolean(process.env.META_LEAD_ACCESS_TOKEN), cronWorker: Boolean(process.env.ATLAS_CRON_SECRET) }, canManage: canManage(access.access.profile.commercialRole, access.access.profile.role) });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Permissão insuficiente para configurar a Meta." }, { status: 403 });
  const body = await request.json() as { pageId?: string; formId?: string; name?: string; defaultOwnerId?: string };
  const pageId = String(body.pageId || "").trim();
  const formId = String(body.formId || "").trim() || null;
  const name = String(body.name || "").trim().slice(0, 120);
  if (!/^\d{5,30}$/.test(pageId) || (formId && !/^\d{5,30}$/.test(formId)) || name.length < 2) return NextResponse.json({ error: "Informe Página, Formulário e nome válidos." }, { status: 400 });
  const admin = getSupabaseAdmin();
  let defaultOwnerId: string | null = null;
  if (body.defaultOwnerId && /^[0-9a-f-]{36}$/i.test(body.defaultOwnerId)) {
    const { data: owner } = await admin.from("profiles").select("id").eq("id", body.defaultOwnerId).eq("organization_id", access.access.organization.id).eq("active", true).maybeSingle();
    if (!owner) return NextResponse.json({ error: "Responsável padrão fora da organização." }, { status: 400 });
    defaultOwnerId = owner.id;
  }
  const { data, error } = await admin.from("meta_lead_sources").upsert({ organization_id: access.access.organization.id, page_id: pageId, form_id: formId, name, active: true, default_owner_id: defaultOwnerId, updated_at: new Date().toISOString() }, { onConflict: "page_id,form_id" }).select("id,page_id,form_id,name,active,default_owner_id").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar a fonte Meta." }, { status: 400 });
  return NextResponse.json({ source: data }, { status: 201 });
}
