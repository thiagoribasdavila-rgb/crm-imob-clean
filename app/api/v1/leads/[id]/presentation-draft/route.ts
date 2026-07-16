import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateAIText } from "@/lib/ai/provider-router";
import { auditPropertyPresentation, fallbackPropertyPresentation } from "@/lib/ai/property-presentation";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const idPattern = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "property-presentation-draft"), { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de gerar outra apresentação." }, { status: 429 });

  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as { propertyIds?: unknown };
    const propertyIds = Array.isArray(body.propertyIds)
      ? [...new Set(body.propertyIds.filter((value): value is string => typeof value === "string" && idPattern.test(value)))].slice(0, 3)
      : [];
    if (!propertyIds.length) return NextResponse.json({ error: "Selecione de um a três imóveis." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const [leadResult, propertyResult] = await Promise.all([
      admin.from("leads").select("id,name,budget_max,preferred_regions,bedrooms,purpose").eq("id", id).eq("organization_id", identity.organizationId).single(),
      admin.from("properties").select("id,title,price,city,state,bedrooms,bathrooms,parking_spaces,area,status").eq("organization_id", identity.organizationId).in("id", propertyIds),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    if (propertyResult.error || !propertyResult.data?.length) return NextResponse.json({ error: "Imóveis não encontrados no seu portfólio." }, { status: 404 });

    const lead = leadResult.data;
    const orderedProperties = propertyIds.flatMap((propertyId) => {
      const property = propertyResult.data.find((item) => item.id === propertyId);
      return property ? [property] : [];
    });
    const firstName = String(lead.name || "Cliente").trim().split(/\s+/)[0];
    const fallback = fallbackPropertyPresentation(firstName, orderedProperties);
    let content = fallback;
    let mode: "generative" | "local-fallback" = "generative";

    try {
      const result = await generateAIText({
        task: "fast",
        containsPersonalData: true,
        organizationId: identity.organizationId,
        userId: identity.userId,
        feature: "property_presentation_draft",
        system: [
          "Você cria uma mensagem comparativa de imóveis para um corretor enviar por WhatsApp no Brasil.",
          "Entregue apenas a mensagem final em texto simples, com no máximo 1.200 caracteres.",
          "Use somente os dados fornecidos. Não invente diferenciais, condições ou características.",
          "Compare com clareza e tom consultivo, sem pressão artificial.",
          "Nunca garanta preço, desconto, disponibilidade, crédito, rentabilidade ou valorização.",
          "Finalize informando que valores e disponibilidade precisam ser confirmados na tabela e no estoque vigentes.",
        ].join("\n"),
        prompt: JSON.stringify({ client: { firstName, budgetMax: lead.budget_max, regions: lead.preferred_regions, bedrooms: lead.bedrooms, purpose: lead.purpose }, properties: orderedProperties }),
      });
      content = result.text.trim();
    } catch {
      mode = "local-fallback";
    }

    const audit = auditPropertyPresentation(content);
    if (!audit.safe) { content = fallback; mode = "local-fallback"; }
    return NextResponse.json({ draft: { content, mode, warnings: audit.warnings, requiresHumanApproval: true }, propertyCount: orderedProperties.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao preparar apresentação.";
    const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
