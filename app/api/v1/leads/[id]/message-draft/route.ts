import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateAIText } from "@/lib/ai/provider-router";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { auditMessageDraft, fallbackMessageDraft } from "@/lib/ai/real-estate-message";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "lead-message-draft"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de gerar outro rascunho." }, { status: 429 });
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as { channel?: string; objective?: string; tone?: string; projectId?: string };
    const channel = body.channel === "email" ? "email" : "whatsapp";
    const objective = String(body.objective || "retomar contato").slice(0, 200);
    const tone = ["consultivo", "direto", "acolhedor", "executivo"].includes(String(body.tone)) ? String(body.tone) : "consultivo";
    const admin = getSupabaseAdmin();
    const [leadResult, activityResult, projectResult] = await Promise.all([
      admin.from("leads").select("id,name,status,source,budget_min,budget_max,preferred_regions,bedrooms,purpose,next_action_at").eq("id", id).eq("organization_id", identity.organizationId).single(),
      admin.from("activities").select("title,type,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(5),
      body.projectId ? admin.from("developments").select("id,name,developer_name,status").eq("id", body.projectId).eq("organization_id", identity.organizationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    const lead = leadResult.data;
    const fallback = fallbackMessageDraft({ name: lead.name || "Cliente", channel, objective, tone, project: projectResult.data?.name, nextAction: lead.next_action_at });
    let content = fallback;
    let mode: "generative" | "local-fallback" = "generative";
    try {
      const result = await generateAIText({
        task: "fast",
        containsPersonalData: true,
        system: [
          "Você redige rascunhos comerciais para corretores de imóveis no Brasil.",
          "Entregue somente o texto final, sem markdown e sem comentários.",
          "Seja humano, conciso e específico, sem pressão artificial.",
          "Nunca prometa preço, desconto, disponibilidade, aprovação, subsídio, rentabilidade ou valorização.",
          "Sempre diga que preço e disponibilidade precisam ser confirmados quando mencionar produto.",
          "Não inclua dados pessoais além do primeiro nome fornecido.",
          "Não invente características do empreendimento ou do cliente.",
          channel === "whatsapp" ? "Use no máximo 700 caracteres." : "Inclua uma linha de assunto e use no máximo 1.500 caracteres.",
        ].join("\n"),
        prompt: JSON.stringify({ channel, objective, tone, lead: { firstName: String(lead.name || "Cliente").split(" ")[0], status: lead.status, source: lead.source, budgetRangeKnown: Boolean(lead.budget_max), regions: lead.preferred_regions, bedrooms: lead.bedrooms, purpose: lead.purpose }, project: projectResult.data, recentActivityTypes: (activityResult.data ?? []).map((item) => item.type) }),
      });
      content = result.text.trim();
    } catch {
      mode = "local-fallback";
    }
    const audit = auditMessageDraft(content);
    if (!audit.safe) { content = fallback; mode = "local-fallback"; }
    return NextResponse.json({ draft: { content, channel, objective, tone, mode, warnings: audit.warnings, requiresHumanApproval: true }, lead: { id: lead.id, name: lead.name }, project: projectResult.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar rascunho.";
    const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
