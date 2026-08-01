import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { copyMaterialToS3, materialStorageReady } from "@/lib/storage/project-materials";

export const dynamic = "force-dynamic";

async function director(request: NextRequest) {
  return requireAccessContext(request, { roles: ["admin", "director"] });
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "material-storage-migration.status" });
  if (!rate.ok) return rate.response;
  const access = await director(request); if (!access.ok) return access.response;
  const admin = getSupabaseAdmin(); const organizationId = access.access.organization.id;
  const [supabase, s3, migrations] = await Promise.all([
    admin.from("project_materials").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("storage_provider", "supabase"),
    admin.from("project_materials").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("storage_provider", "s3"),
    admin.from("project_material_migrations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "verified"),
  ]);
  return NextResponse.json({ storage: materialStorageReady(), materials: { pending: supabase.count ?? 0, migrated: s3.count ?? 0, verifiedCopies: migrations.count ?? 0 }, strategy: "copy-verify-switch-keep-source" });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60_000, scope: "material-storage-migration.batch" });
  if (!rate.ok) return rate.response;
  const access = await director(request); if (!access.ok) return access.response;
  const storage = materialStorageReady();
  if (!storage.s3Configured) return NextResponse.json({ error: "Configure o armazenamento S3 antes do ensaio." }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { batchSize?: number; confirm?: boolean };
  if (body.confirm !== true) return NextResponse.json({ error: "Confirme explicitamente o lote de migração." }, { status: 400 });
  const batchSize = Math.max(1, Math.min(10, Math.floor(Number(body.batchSize) || 3)));
  const admin = getSupabaseAdmin(); const organizationId = access.access.organization.id;
  const { data, error } = await admin.from("project_materials").select("id,storage_provider,storage_bucket,storage_path").eq("organization_id", organizationId).eq("storage_provider", "supabase").order("created_at").limit(batchSize);
  if (error) return NextResponse.json({ error: "Não foi possível preparar o lote." }, { status: 500 });
  const results: Array<{ id: string; status: "migrated" | "failed"; error?: string }> = [];
  for (const material of data ?? []) {
    try {
      const target = await copyMaterialToS3({ provider: "supabase", bucket: material.storage_bucket, path: material.storage_path });
      const finalized = await admin.rpc("finalize_project_material_migration", { p_organization_id: organizationId, p_material_id: material.id, p_target_bucket: target.bucket, p_target_path: target.path, p_content_sha256: target.checksum });
      if (finalized.error) throw finalized.error;
      results.push({ id: material.id, status: "migrated" });
    } catch (migrationError) { results.push({ id: material.id, status: "failed", error: migrationError instanceof Error ? migrationError.message.slice(0, 160) : "Falha de migração" }); }
  }
  await admin.from("atlas_events").insert({ organization_id: organizationId, event_type: "project.material.storage_migration", source: "governance.material-storage", aggregate_type: "organization", aggregate_id: organizationId, payload: { requested: batchSize, migrated: results.filter((item) => item.status === "migrated").length, failed: results.filter((item) => item.status === "failed").length }, correlation_id: crypto.randomUUID() });
  return NextResponse.json({ results, sourceFilesRetained: true, next: "Repita o lote após validar a abertura dos arquivos migrados." });
}
