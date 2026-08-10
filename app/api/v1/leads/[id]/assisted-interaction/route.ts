import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  assistedInteractionDescription,
  buildDeterministicInteractionDraft,
  mergeGeneratedInteractionDraft,
  validateAssistedConfirmation,
  validateAssistedSource,
} from "@/lib/ai/assisted-interaction";
import { generateAIText } from "@/lib/ai/provider-router";
import { mapLiveLeadEvent, recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { logger } from "@/lib/observability/logger";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assistedInteractionMetricTypes } from "@/lib/ai/assisted-interaction-measurement";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type RequestBody = Record<string, unknown> & { action?: unknown };
const feedbackOptions = new Set(["helpful", "needs_adjustment", "not_useful"]);

async function recordMeasurement(
  organizationId: string,
  leadId: string,
  eventType: string,
  captureId: unknown,
  detail: Record<string, unknown> = {},
) {
  const safeCaptureId = typeof captureId === "string" && captureId.trim().length <= 128
    ? captureId.trim()
    : null;
  if (!safeCaptureId) return;
  const { error } = await getSupabaseAdmin().from("atlas_events").insert({
    organization_id: organizationId,
    event_type: eventType,
    source: "atlas.assisted_interaction",
    aggregate_type: "lead",
    aggregate_id: leadId,
    payload: { captureId: safeCaptureId, ...detail },
    correlation_id: safeCaptureId,
  });
  if (error) logger.warn("lead.assisted_interaction_measurement_failed", { eventType, leadId, code: error.code });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : "Não foi possível concluir a captura assistida.";
  if (/sessão|token|autenticação/i.test(message)) {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }
  if (/escopo/i.test(message)) {
    return NextResponse.json({ error: "Este atendimento não está no seu escopo comercial." }, { status: 403 });
  }
  return NextResponse.json(
    { error: "O Atlas não conseguiu concluir esta ação agora. Tente novamente." },
    { status: 500 },
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const action = String(body.action ?? "draft");
    const rate = checkRateLimit(
      clientKey(request, `assisted-interaction-${action}`),
      { limit: action === "confirm" ? 30 : 20, windowMs: 60_000 },
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Aguarde um instante antes de repetir esta ação." },
        { status: 429 },
      );
    }

    const identity = await requireApiIdentity(request);
    const { id: leadId } = await context.params;
    await requireLeadAccess(identity, leadId);
    if (action === "draft") {
      const validated = validateAssistedSource({
        sourceText: body.sourceText,
        channel: body.channel,
      });
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 422 });
      }

      const fallback = buildDeterministicInteractionDraft(
        validated.value.sourceText,
      );
      const { data: lead } = await identity.supabase
        .from("leads")
        .select("status,purpose")
        .eq("id", leadId)
        .eq("organization_id", identity.organizationId)
        .maybeSingle();

      const result = await generateAIText({
        task: "fast",
        containsPersonalData: true,
        organizationId: identity.organizationId,
        userId: identity.userId,
        feature: "assisted_interaction_capture",
        system: [
          "Você estrutura anotações de atendimentos imobiliários no Brasil.",
          "Extraia somente fatos explicitamente presentes no registro; não invente intenção, objeção, prazo, renda, orçamento ou resultado.",
          "Não prometa preço, disponibilidade, aprovação de crédito, rentabilidade ou valorização.",
          "Responda somente um objeto JSON válido, sem markdown.",
          "Use exatamente as chaves: outcome, intent, objections, summary, nextAction, confidence.",
          "objections deve ser um array de strings; confidence deve ficar entre 0 e 1.",
          "Quando um dado não estiver explícito, use 'A confirmar' ou uma lista vazia.",
          "A próxima ação deve ser concreta, prudente e exigir decisão humana.",
        ].join("\n"),
        prompt: JSON.stringify({
          channel: validated.value.channel,
          currentStatus: lead?.status ?? null,
          knownPurpose: lead?.purpose ?? null,
          originalServiceNote: validated.value.sourceText,
        }),
      });

      const draft = result.provider === "local"
        ? fallback
        : mergeGeneratedInteractionDraft(result.text, fallback);
      await recordMeasurement(identity.organizationId, leadId, assistedInteractionMetricTypes.draft, body.captureId, {
        channel: validated.value.channel,
        provider: result.provider,
        generated: result.provider !== "local",
      });
      return NextResponse.json({
        draft,
        generation: {
          provider: result.provider,
          model: result.model,
          mode: result.provider === "local" ? "local-fallback" : "generative",
          guardrail: result.guardrail ?? null,
        },
        policy: {
          requiresHumanConfirmation: true,
          leadDataWritten: false,
          commercialMemoryWritten: false,
          rawConversationStoredInAiMemory: false,
        },
      });
    }

    if (action === "confirm") {
      const validated = validateAssistedConfirmation(body);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 422 });
      }

      const confirmation = validated.value;
      const admin = getSupabaseAdmin();
      const { data: existing } = await admin
        .from("lead_events")
        .select("id,lead_id,event_type,type,description,metadata,created_by,created_at")
        .eq("organization_id", identity.organizationId)
        .eq("lead_id", leadId)
        .eq("event_type", "assisted_interaction_confirmed")
        .contains("metadata", { captureId: confirmation.captureId })
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          activity: mapLiveLeadEvent(existing as Record<string, unknown>),
          duplicated: true,
        });
      }

      const event = await recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId,
        actorId: identity.userId,
        type: "assisted_interaction_confirmed",
        title: `Atendimento confirmado · ${confirmation.channel}`,
        description: assistedInteractionDescription(confirmation),
        metadata: {
          captureVersion: "v1",
          captureId: confirmation.captureId,
          channel: confirmation.channel,
          outcome: confirmation.outcome,
          intent: confirmation.intent,
          objections: confirmation.objections,
          summary: confirmation.summary,
          nextAction: confirmation.nextAction,
          originalNote: confirmation.sourceText,
          confidence: confirmation.confidence,
          generatedBy: confirmation.generatedBy,
          model: confirmation.model,
          humanConfirmed: true,
          humanReviewStatus: "confirmed",
          rawConversationInCommercialMemory: false,
          automaticExternalAction: false,
        },
      });
      if (event.error || !event.data) {
        logger.warn("lead.assisted_interaction_save_failed", {
          leadId,
          actorId: identity.userId,
          message: event.error?.message ?? "event_not_returned",
        });
        return NextResponse.json(
          { error: "Não foi possível salvar o atendimento revisado." },
          { status: 503 },
        );
      }

      logger.info("lead.assisted_interaction_confirmed", {
        leadId,
        actorId: identity.userId,
        captureId: confirmation.captureId,
        channel: confirmation.channel,
      });
      await recordMeasurement(identity.organizationId, leadId, assistedInteractionMetricTypes.confirmed, confirmation.captureId, {
        channel: confirmation.channel,
        provider: confirmation.generatedBy,
      });
      return NextResponse.json(
        {
          activity: mapLiveLeadEvent(event.data as Record<string, unknown>),
          policy: {
            humanConfirmed: true,
            originalNotePreserved: true,
            commercialMemoryWritten: false,
            automaticExternalAction: false,
          },
        },
        { status: 201 },
      );
    }

    if (action === "discard") {
      await recordMeasurement(identity.organizationId, leadId, assistedInteractionMetricTypes.discarded, body.captureId, {
        channel: typeof body.channel === "string" ? body.channel.slice(0, 32) : "unknown",
      });
      return NextResponse.json({ recorded: true, policy: { aggregateOnly: true, sourceTextStored: false } });
    }

    if (action === "feedback") {
      const feedback = typeof body.feedback === "string" ? body.feedback : "";
      if (!feedbackOptions.has(feedback)) {
        return NextResponse.json({ error: "Informe uma avaliação válida da preparação." }, { status: 422 });
      }
      const safeCaptureId = typeof body.captureId === "string" && body.captureId.trim().length <= 128
        ? body.captureId.trim()
        : null;
      if (!safeCaptureId) {
        return NextResponse.json({ error: "Esta preparação não pode mais receber avaliação." }, { status: 422 });
      }
      const { data: confirmedCapture, error: confirmedCaptureError } = await getSupabaseAdmin()
        .from("lead_events")
        .select("id")
        .eq("organization_id", identity.organizationId)
        .eq("lead_id", leadId)
        .eq("event_type", "assisted_interaction_confirmed")
        .contains("metadata", { captureId: safeCaptureId })
        .maybeSingle();
      if (confirmedCaptureError || !confirmedCapture) {
        return NextResponse.json(
          { error: "Confirme a preparação antes de registrar a avaliação." },
          { status: 409 },
        );
      }
      await recordMeasurement(identity.organizationId, leadId, assistedInteractionMetricTypes.feedback, body.captureId, {
        feedback,
        humanReviewed: true,
      });
      return NextResponse.json({
        recorded: true,
        policy: {
          aggregateOnly: true,
          sourceTextStored: false,
          automaticExternalAction: false,
        },
      });
    }

    return NextResponse.json(
      { error: "Ação de captura assistida inválida." },
      { status: 400 },
    );
  } catch (error) {
    logger.warn("lead.assisted_interaction_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error);
  }
}
