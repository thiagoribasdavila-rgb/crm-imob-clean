import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const allowedTypes = new Set(["book", "price_table", "sales_mirror", "floor_plan", "presentation", "other"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase()}` : "";
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "material";
  return `${base}${extension}`;
}

async function developmentInOrganization(id: string, organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("developments")
    .select("id,name,developer_name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 90, windowMs: 60_000, scope: "development.materials.list" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const development = await developmentInOrganization(id, access.access.organization.id);
  if (!development) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("project_materials")
    .select("id,material_type,title,description,file_name,mime_type,file_size,version,valid_from,valid_until,is_current,created_at,storage_path")
    .eq("organization_id", access.access.organization.id)
    .eq("development_id", id)
    .eq("is_current", true)
    .order("material_type");

  if (error) return NextResponse.json({ error: "Não foi possível carregar os materiais." }, { status: 500 });

  const materials = await Promise.all((data ?? []).map(async (material) => {
    const { data: signed } = await admin.storage.from("project-materials").createSignedUrl(material.storage_path, 3600);
    return { ...material, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ development, materials });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "development.materials.upload" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const development = await developmentInOrganization(id, access.access.organization.id);
  if (!development) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const materialType = String(form.get("materialType") || "");
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim().slice(0, 1000);
  const validFrom = String(form.get("validFrom") || "") || null;
  const validUntil = String(form.get("validUntil") || "") || null;

  if (!(file instanceof File) || !allowedTypes.has(materialType) || title.length < 2) {
    return NextResponse.json({ error: "Informe tipo, título e arquivo do material." }, { status: 400 });
  }
  if (!allowedMimeTypes.has(file.type) || file.size < 1 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Use PDF, Excel ou imagem com até 50 MB." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: previous } = await admin
    .from("project_materials")
    .select("id,version")
    .eq("organization_id", access.access.organization.id)
    .eq("development_id", id)
    .eq("material_type", materialType)
    .eq("is_current", true)
    .maybeSingle();

  const version = Number(previous?.version ?? 0) + 1;
  const storagePath = `${access.access.organization.id}/${id}/${materialType}/v${version}-${Date.now()}-${safeFileName(file.name)}`;
  const upload = await admin.storage.from("project-materials").upload(storagePath, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: `Falha no envio: ${upload.error.message}` }, { status: 400 });

  if (previous) await admin.from("project_materials").update({ is_current: false, updated_at: new Date().toISOString() }).eq("id", previous.id);

  const { data: material, error } = await admin
    .from("project_materials")
    .insert({
      organization_id: access.access.organization.id,
      development_id: id,
      material_type: materialType,
      title,
      description: description || null,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      version,
      valid_from: validFrom,
      valid_until: validUntil,
      uploaded_by: access.access.profile.id,
    })
    .select("id,material_type,title,file_name,version,valid_from,valid_until,created_at")
    .single();

  if (error) {
    await admin.storage.from("project-materials").remove([storagePath]);
    if (previous) await admin.from("project_materials").update({ is_current: true }).eq("id", previous.id);
    return NextResponse.json({ error: "Não foi possível registrar a nova versão." }, { status: 500 });
  }

  await admin.from("atlas_events").insert({
    organization_id: access.access.organization.id,
    event_type: "project.material.updated",
    source: "launch-os.material-hub",
    aggregate_type: "development",
    aggregate_id: id,
    payload: { materialId: material.id, materialType, version, fileName: file.name },
    correlation_id: crypto.randomUUID(),
  });

  return NextResponse.json({ material }, { status: 201 });
}
