import { NextResponse } from "next/server";
import { calculateLeadScore } from "@/lib/atlas/scoring";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CreateLeadPayload = {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  purpose?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  bedrooms?: number | null;
  preferredRegions?: string[];
  notes?: string;
  developmentId?: string | null;
};

function normalizePhone(value?: string) {
  return value?.replace(/\D/g, "") || null;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedPurposes = new Set(["moradia", "investimento", "locacao"]);
const allowedSources = new Set(["Meta Ads", "Google", "WhatsApp", "Indicação", "Portal", "Orgânico", "Manual"]);

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v1-leads-create"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns segundos." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) },
      },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as CreateLeadPayload;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase() || null;
    const phone = normalizePhone(body.phone);

    if (!name || name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: "Informe um nome entre 2 e 120 caracteres.", field: "name" }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json({ error: "Informe pelo menos telefone ou e-mail.", field: "contact" }, { status: 400 });
    }
    if (email && (email.length > 254 || !emailPattern.test(email))) return NextResponse.json({ error: "Informe um e-mail válido.", field: "email" }, { status: 400 });
    if (phone && (phone.length < 10 || phone.length > 15)) return NextResponse.json({ error: "Informe um telefone válido com DDD.", field: "phone" }, { status: 400 });
    if (body.source && !allowedSources.has(body.source)) return NextResponse.json({ error: "Origem inválida.", field: "source" }, { status: 400 });
    if (body.purpose && !allowedPurposes.has(body.purpose)) return NextResponse.json({ error: "Objetivo inválido.", field: "purpose" }, { status: 400 });
    if ((body.budgetMin != null && (!Number.isFinite(body.budgetMin) || body.budgetMin < 0 || body.budgetMin > 1_000_000_000)) || (body.budgetMax != null && (!Number.isFinite(body.budgetMax) || body.budgetMax < 0 || body.budgetMax > 1_000_000_000))) return NextResponse.json({ error: "Informe um orçamento válido.", field: "budget" }, { status: 400 });
    if (body.budgetMin != null && body.budgetMax != null && body.budgetMin > body.budgetMax) {
      return NextResponse.json({ error: "O orçamento mínimo não pode superar o máximo.", field: "budgetMax" }, { status: 400 });
    }
    if (body.bedrooms != null && (!Number.isInteger(body.bedrooms) || body.bedrooms < 0 || body.bedrooms > 20)) return NextResponse.json({ error: "Quantidade de dormitórios inválida.", field: "bedrooms" }, { status: 400 });
    if ((body.notes?.length ?? 0) > 5000 || (body.preferredRegions?.length ?? 0) > 20) return NextResponse.json({ error: "O contexto informado ultrapassa o limite permitido.", field: "notes" }, { status: 400 });
    if (body.developmentId && !uuidPattern.test(body.developmentId)) {
      return NextResponse.json({ error: "Projeto inválido.", field: "developmentId" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (body.developmentId) {
      const { data: development } = await admin.from("developments").select("id").eq("id", body.developmentId).eq("organization_id", identity.organizationId).maybeSingle();
      if (!development) return NextResponse.json({ error: "Projeto não encontrado nesta organização." }, { status: 400 });
    }
    const score = calculateLeadScore({
      email,
      phone,
      source: body.source,
      purpose: body.purpose,
      budgetMax: body.budgetMax ?? null,
      bedrooms: body.bedrooms ?? null,
      preferredRegions: body.preferredRegions ?? [],
      status: "novo",
    });

    const { data: atomicResult, error: leadError } = await identity.supabase.rpc("create_lead_atomic", { p_organization_id: identity.organizationId, p_development_id: body.developmentId || null, p_assigned_to: identity.userId, p_name: name, p_email: email, p_phone: phone, p_source: body.source?.trim() || "Manual", p_purpose: body.purpose?.trim() || null, p_budget_min: body.budgetMin ?? null, p_budget_max: body.budgetMax ?? null, p_bedrooms: body.bedrooms ?? null, p_preferred_regions: (body.preferredRegions ?? []).map((region) => region.trim()).filter(Boolean).slice(0, 20), p_notes: body.notes?.trim() || null, p_score: score.score, p_temperature: score.temperature, p_metadata: { scoreReasons: score.reasons, createdVia: "atlas_v1_api" } });
    if (leadError?.message.includes("invalid_phone_suppressed")) return NextResponse.json({ error: "Este telefone possui histórico de qualidade inválida e não pode ser recadastrado.", field: "phone" }, { status: 422 });
    if (leadError) throw leadError;
    const atomic = atomicResult as { status: "created" | "duplicate"; leadId: string; name?: string; score?: number; temperature?: string };
    if (atomic.status === "duplicate") {
      const { data: visibleDuplicate } = await identity.supabase.from("leads").select("id").eq("id", atomic.leadId).eq("organization_id", identity.organizationId).maybeSingle();
      return NextResponse.json({ error: "Já existe um lead com este contato.", ...(visibleDuplicate ? { duplicateLeadId: atomic.leadId } : {}) }, { status: 409 });
    }
    const lead = { id: atomic.leadId, name: atomic.name || name, score: atomic.score ?? score.score, temperature: atomic.temperature || score.temperature };

    await Promise.allSettled([
      admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: lead.id,
        user_id: identity.userId,
        type: "lead_created",
        title: "Lead criado",
        description: `Lead ${lead.name} criado manualmente no Atlas.`,
        metadata: { score: lead.score, temperature: lead.temperature },
      }),
      admin.from("atlas_events").insert({
        organization_id: identity.organizationId,
        event_type: "lead.created",
        source: "atlas-v1",
        aggregate_type: "lead",
        aggregate_id: lead.id,
        payload: { score: lead.score, temperature: lead.temperature },
        correlation_id: crypto.randomUUID(),
      }),
    ]);

    logger.info("v1.lead_created", {
      leadId: lead.id,
      organizationId: identity.organizationId,
      userId: identity.userId,
      score: lead.score,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    logger.error("v1.lead_create_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao criar lead.";
    const status = /token|sessão|organização|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
