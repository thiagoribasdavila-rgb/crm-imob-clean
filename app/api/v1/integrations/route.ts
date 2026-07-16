import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { integrationCatalog, integrationProviders } from "@/lib/integrations/catalog";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.from("integrations").select("id,provider,name,status,external_account_id,config,last_sync_at,last_error,updated_at").order("provider");
  if (error) return NextResponse.json({ error: "Não foi possível ler as integrações." }, { status: 500 });
  return NextResponse.json({ catalog: integrationCatalog, connections: data ?? [], canManage: canManage(access.access.profile.commercialRole, access.access.profile.role) });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Permissão insuficiente." }, { status: 403 });
  const body = await request.json() as { provider?: string; name?: string; externalAccountId?: string; config?: Record<string, unknown> };
  const provider = String(body.provider || "").trim();
  const name = String(body.name || "").trim().slice(0, 100);
  if (!integrationProviders.has(provider) || name.length < 2) return NextResponse.json({ error: "Provedor ou nome inválido." }, { status: 400 });
  const safeConfig = body.config && typeof body.config === "object" ? body.config : {};
  if (Object.keys(safeConfig).some((key) => /token|secret|password|private.?key/i.test(key))) return NextResponse.json({ error: "Segredos devem ser configurados no ambiente seguro da Hostinger, nunca nesta API." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("integrations").upsert({ organization_id: access.access.organization.id, provider, name, external_account_id: String(body.externalAccountId || "").trim().slice(0, 200) || null, config: safeConfig, status: "disconnected", updated_at: new Date().toISOString() }, { onConflict: "organization_id,provider,name" }).select("id,provider,name,status,external_account_id,config,updated_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar a integração." }, { status: 400 });
  return NextResponse.json({ connection: data }, { status: 201 });
}
