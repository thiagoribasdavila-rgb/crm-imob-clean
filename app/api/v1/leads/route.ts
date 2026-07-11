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
};

function normalizePhone(value?: string) {
  return value?.replace(/\D/g, "") || null;
}

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

    if (!name) {
      return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json({ error: "Informe pelo menos telefone ou e-mail." }, { status: 400 });
    }
    if (body.budgetMin && body.budgetMax && body.budgetMin > body.budgetMax) {
      return NextResponse.json({ error: "O orçamento mínimo não pode superar o máximo." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let duplicateQuery = admin
      .from("leads")
      .select("id,name,email,phone")
      .eq("organization_id", identity.organizationId)
      .limit(1);

    if (email && phone) duplicateQuery = duplicateQuery.or(`email.eq.${email},phone.eq.${phone}`);
    else if (email) duplicateQuery = duplicateQuery.eq("email", email);
    else duplicateQuery = duplicateQuery.eq("phone", phone);

    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe um lead com este contato.", duplicateLeadId: duplicate.id },
        { status: 409 },
      );
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

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .insert({
        organization_id: identity.organizationId,
        assigned_to: identity.userId,
        name,
        email,
        phone,
        source: body.source?.trim() || "Manual",
        purpose: body.purpose?.trim() || null,
        budget_min: body.budgetMin ?? null,
        budget_max: body.budgetMax ?? null,
        bedrooms: body.bedrooms ?? null,
        preferred_regions: body.preferredRegions ?? [],
        notes: body.notes?.trim() || null,
        status: "novo",
        score: score.score,
        temperature: score.temperature,
        metadata: { scoreReasons: score.reasons, createdVia: "atlas_v1_api" },
      })
      .select("id,name,score,temperature")
      .single();

    if (leadError) throw leadError;

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
