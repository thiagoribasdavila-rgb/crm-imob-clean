import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type Payload = {
  productKey?: string;
  name?: string;
  description?: string;
  schemaVersion?: string;
  contract?: Record<string, unknown>;
  ownerDomain?: string;
  classification?: "public" | "partner" | "internal" | "confidential" | "restricted";
  qualityScore?: number;
};

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas2030-data-product"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Limite de publicação excedido." }, { status: 429 });
  }

  try {
    const identity = await requireApiIdentity(request);
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!profile || !["admin", "manager"].includes(String(profile.role))) {
      return NextResponse.json({ error: "Apenas administradores e gestores podem publicar produtos de dados." }, { status: 403 });
    }

    const body = (await request.json()) as Payload;
    if (!body.productKey?.trim() || !body.name?.trim() || !body.ownerDomain?.trim()) {
      return NextResponse.json({ error: "productKey, name e ownerDomain são obrigatórios." }, { status: 400 });
    }

    const qualityScore = Math.min(100, Math.max(0, Number(body.qualityScore ?? 0)));
    const { data, error } = await admin
      .from("atlas_data_products")
      .upsert(
        {
          organization_id: identity.organizationId,
          product_key: body.productKey.trim(),
          name: body.name.trim(),
          description: body.description ?? null,
          schema_version: body.schemaVersion ?? "1.0.0",
          contract: body.contract ?? {},
          owner_domain: body.ownerDomain.trim(),
          classification: body.classification ?? "internal",
          quality_score: qualityScore,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,product_key" },
      )
      .select("id,product_key,schema_version,classification,quality_score,updated_at")
      .single();

    if (error) throw error;
    logger.info("atlas2030.data_product_published", { productId: data.id, productKey: data.product_key, organizationId: identity.organizationId });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error("atlas2030.data_product_publish_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao publicar produto de dados.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
