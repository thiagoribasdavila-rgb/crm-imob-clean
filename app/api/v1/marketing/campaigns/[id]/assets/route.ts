import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteMaterial, signedMaterialUrl, uploadMaterial } from "@/lib/storage/project-materials";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const MAX_SIZE = 50 * 1024 * 1024;
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
}

async function validSignature(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "application/pdf") return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (file.type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.type === "image/png") return b.slice(0, 8).every((v, i) => v === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][i]);
  return file.type === "image/webp" && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
}

async function campaign(id: string, organizationId: string) {
  const { data } = await getSupabaseAdmin().from("campaigns").select("id,development_id").eq("id", id).eq("organization_id", organizationId).is("archived_at", null).maybeSingle();
  return data;
}

export async function GET(request: NextRequest, context: Context) {
  const rate = enforceRateLimit(request, { limit: 90, windowMs: 60_000, scope: "campaign.assets.list" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!(await campaign(id, access.access.organization.id))) return NextResponse.json({ error: { message: "Campanha não encontrada." } }, { status: 404 });
  const { data, error } = await getSupabaseAdmin().from("campaign_assets").select("id,asset_type,title,file_name,mime_type,file_size,version,is_current,created_at,storage_bucket,storage_path").eq("organization_id", access.access.organization.id).eq("campaign_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: { message: "Não foi possível carregar os anexos." } }, { status: 500 });
  const assets = await Promise.all((data ?? []).map(async ({ storage_path, storage_bucket, ...item }) => ({
    ...item,
    url: await signedMaterialUrl({ provider: "supabase", bucket: storage_bucket, path: storage_path }),
  })));
  return NextResponse.json({ data: { assets } });
}

export async function POST(request: NextRequest, context: Context) {
  const rate = enforceRateLimit(request, { limit: 12, windowMs: 60_000, scope: "campaign.assets.upload" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const currentCampaign = await campaign(id, access.access.organization.id);
  if (!currentCampaign) return NextResponse.json({ error: { message: "Campanha não encontrada." } }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  const assetType = String(form.get("assetType") || "");
  const title = String(form.get("title") || "").trim();
  if (!(file instanceof File) || !["briefing", "creative"].includes(assetType) || title.length < 2) return NextResponse.json({ error: { message: "Informe tipo, título e arquivo." } }, { status: 400 });
  if (!allowed.has(file.type) || file.size < 1 || file.size > MAX_SIZE || !(await validSignature(file))) return NextResponse.json({ error: { message: "Use PDF, JPG, PNG ou WEBP válido com até 50 MB." } }, { status: 400 });

  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const path = `${organizationId}/campaigns/${id}/${assetType}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const uploaded = await uploadMaterial(path, new Uint8Array(await file.arrayBuffer()), file.type);
  const { data: last } = await admin.from("campaign_assets").select("version").eq("organization_id", organizationId).eq("campaign_id", id).eq("asset_type", assetType).order("version", { ascending: false }).limit(1).maybeSingle();
  await admin.from("campaign_assets").update({ is_current: false }).eq("organization_id", organizationId).eq("campaign_id", id).eq("asset_type", assetType);
  const { data, error } = await admin.from("campaign_assets").insert({
    organization_id: organizationId, campaign_id: id, development_id: currentCampaign.development_id,
    asset_type: assetType, title, storage_bucket: uploaded.bucket, storage_path: uploaded.path,
    file_name: file.name, mime_type: file.type, file_size: file.size, version: Number(last?.version || 0) + 1,
    uploaded_by: access.access.profile.id,
  }).select("id,version").single();
  if (error) { await deleteMaterial(uploaded); return NextResponse.json({ error: { message: "Não foi possível registrar o anexo." } }, { status: 500 }); }
  return NextResponse.json({ data }, { status: 201 });
}
