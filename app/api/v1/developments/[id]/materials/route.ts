import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteMaterial, materialStorageReady, signedMaterialUrl, uploadMaterial } from "@/lib/storage/project-materials";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const allowedTypes = new Set(["book", "price_table", "sales_mirror", "floor_plan", "presentation", "technical_memorial", "registration_form", "video", "site_plan", "other"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_VIDEO_SIZE + 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null) {
  if (!value) return true;
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function hasExpectedSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "application/pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  if (file.type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (file.type === "application/vnd.ms-excel") return bytes.slice(0, 8).every((value, index) => value === [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1][index]);
  if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (file.type === "video/mp4" || file.type === "video/quicktime") {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

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
    .select("id,material_type,title,description,file_name,mime_type,file_size,version,valid_from,valid_until,is_current,review_status,verified_at,review_note,created_at,storage_provider,storage_bucket,storage_path")
    .eq("organization_id", access.access.organization.id)
    .eq("development_id", id)
    .eq("is_current", true)
    .order("material_type");

  if (error) return NextResponse.json({ error: "Não foi possível carregar os materiais." }, { status: 500 });

  const expiresInSeconds = 900;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const materials = await Promise.all((data ?? []).map(async (material) => {
    const url = await signedMaterialUrl({ provider: material.storage_provider || "supabase", bucket: material.storage_bucket || "project-materials", path: material.storage_path });
    const safeMaterial = { ...material, storage_path: undefined };
    return { ...safeMaterial, url, urlExpiresAt: url ? expiresAt : null };
  }));
  const today = new Date().toISOString().slice(0, 10);
  const essential = ["book", "price_table", "sales_mirror"].map((type) => { const material = materials.find((item) => item.material_type === type && (!item.valid_from || item.valid_from <= today) && (!item.valid_until || item.valid_until >= today)); return { type, available: Boolean(material?.url), version: material?.version ?? null, expiresAt: material?.urlExpiresAt ?? null }; });
  return NextResponse.json({ development, materials, storageHomologation: { status: essential.every((item) => item.available) ? "passed" : "incomplete", privateBucket: true, tenantPathProtected: true, ...materialStorageReady(), essential } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "development.materials.upload" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const development = await developmentInOrganization(id, access.access.organization.id);
  if (!development) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });
  if (!development.developer_name?.trim()) return NextResponse.json({ error: "Informe a incorporadora do empreendimento antes de publicar materiais." }, { status: 409 });

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return NextResponse.json({ error: "O envio ultrapassa o limite máximo de 200 MB." }, { status: 413 });
  }

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
  const maximumSize = file.type.startsWith("video/") ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
  if (!allowedMimeTypes.has(file.type) || file.size < 1 || file.size > maximumSize) {
    return NextResponse.json({ error: "Use PDF, Excel ou imagem com até 50 MB, ou vídeo MP4/MOV com até 200 MB." }, { status: 400 });
  }
  if (!(await hasExpectedSignature(file))) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde ao formato informado." }, { status: 400 });
  if (!validDate(validFrom) || !validDate(validUntil) || (validFrom && validUntil && validUntil < validFrom)) {
    return NextResponse.json({ error: "Revise as datas de vigência do material." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const storagePath = `${access.access.organization.id}/${id}/${materialType}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let upload;
  try { upload = await uploadMaterial(storagePath, bytes, file.type); }
  catch (uploadError) {
    logger.error("project.material_upload_failed", uploadError, { organizationId: access.access.organization.id, developmentId: id, mimeType: file.type, fileSize: file.size });
    return NextResponse.json({ error: "Não foi possível armazenar o arquivo. Tente novamente ou contate o suporte." }, { status: 502 });
  }

  const { data: result, error } = await admin.rpc("version_project_material_cloud", { p_organization_id: access.access.organization.id, p_development_id: id, p_uploaded_by: access.access.profile.id, p_material_type: materialType, p_title: title, p_description: description, p_storage_provider: upload.provider, p_storage_bucket: upload.bucket, p_storage_path: upload.path, p_file_name: file.name, p_mime_type: file.type, p_file_size: file.size, p_content_sha256: upload.checksum, p_valid_from: validFrom, p_valid_until: validUntil });
  const material = (Array.isArray(result) ? result[0] : result) as { id: string; version: number } | null;

  if (error || !material) {
    await deleteMaterial(upload);
    return NextResponse.json({ error: "Não foi possível registrar a nova versão." }, { status: 500 });
  }

  await admin.from("atlas_events").insert({
    organization_id: access.access.organization.id,
    event_type: "project.material.updated",
    source: "launch-os.material-hub",
    aggregate_type: "development",
    aggregate_id: id,
    payload: { materialId: material.id, materialType, version: material.version, fileName: file.name },
    correlation_id: crypto.randomUUID(),
  });

  return NextResponse.json({ material }, { status: 201 });
}
