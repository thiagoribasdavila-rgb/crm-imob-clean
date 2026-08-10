import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import {
  enforceRateLimit,
  isTrustedMutationOrigin,
  readIdempotencyKey,
  requireAccessContext,
} from "@/lib/api/security";
import {
  buildWhatsAppMemoryDecisionEvidence,
  fingerprintWhatsAppMemoryDecisionEvidence,
  parseWhatsAppMemoryDirectorDecisionInput,
} from "@/lib/analytics/whatsapp-memory-director-decision-execution";
import {
  loadWhatsAppMemoryDirectorEvidence,
  WhatsAppMemoryEvidenceLoadError,
} from "@/lib/server/whatsapp-memory-director-evidence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;

function isPersistenceMigrationPending(code: string, message: string) {
  return ["PGRST202", "42883", "42P01"].includes(code) ||
    /record_whatsapp_memory_director_decision|whatsapp_memory_director_decisions|schema cache/i.test(message);
}

function isDirector(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  return identity.ok && (
    identity.access.profile.role === "admin" ||
    identity.access.profile.commercialRole === "director"
  );
}

function summarizeEvidence(
  evidence: Awaited<ReturnType<typeof loadWhatsAppMemoryDirectorEvidence>>,
) {
  return {
    readyForHumanRelease: evidence.gate.gate.readyForHumanRelease,
    canBeReviewed: evidence.review.review.canBeReviewed,
    passedControls: evidence.gate.gate.passedControls,
    totalControls: evidence.gate.gate.totalControls,
    blockers: [...evidence.gate.gate.blockers],
    measuredAt: evidence.gate.measuredAt,
    containsPii: false,
    readsMessageContent: false,
    automaticDecision: false,
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    scope: "whatsapp-memory-director-decision-read",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const meta = identity.meta;
  if (!isDirector(identity)) {
    return apiError("FORBIDDEN", "Esta leitura é exclusiva da diretoria.", meta, {
      status: 403,
      headers: rate.headers,
    });
  }

  const organizationId = identity.access.organization.id;
  let evidence;
  try {
    evidence = await loadWhatsAppMemoryDirectorEvidence(organizationId);
  } catch (cause) {
    const errorCode = cause instanceof WhatsAppMemoryEvidenceLoadError ? cause.code : "UNKNOWN";
    structuredApiLog("error", "whatsapp.memory_decision.read_evidence_failed", request, meta, {
      organizationId,
      errorCode,
    });
    return apiError(
      "WHATSAPP_MEMORY_EVIDENCE_FAILED",
      "Não foi possível recalcular a evidência estrutural neste momento.",
      meta,
      { status: 502, headers: rate.headers },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("whatsapp_memory_director_decisions")
    .select(
      "id,decision,reason,operational_scope_confirmed,evidence_limits_confirmed,evidence_fingerprint,evidence_measured_at,created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    const code = String(error.code ?? "");
    const message = String(error.message ?? "");
    if (isPersistenceMigrationPending(code, message)) {
      return apiSuccess(
        {
          persistenceReady: false,
          evidence: summarizeEvidence(evidence),
          decisions: [],
          learningActivated: false,
          migrationRequired:
            "Aplique a migration de decisão no Supabase antes de registrar a escolha da diretoria.",
        },
        meta,
        { headers: rate.headers },
      );
    }
    structuredApiLog("error", "whatsapp.memory_decision.read_failed", request, meta, {
      organizationId,
      errorCode: code || "READ_FAILED",
    });
    return apiError(
      "WHATSAPP_MEMORY_DECISION_READ_FAILED",
      "Não foi possível consultar o histórico protegido.",
      meta,
      { status: 500, headers: rate.headers },
    );
  }

  return apiSuccess(
    {
      persistenceReady: true,
      evidence: summarizeEvidence(evidence),
      decisions: (data ?? []).map((row) => ({
        id: row.id,
        decision: row.decision,
        reason: row.reason,
        operationalScopeConfirmed: row.operational_scope_confirmed,
        evidenceLimitsConfirmed: row.evidence_limits_confirmed,
        evidenceFingerprint: row.evidence_fingerprint,
        evidenceMeasuredAt: row.evidence_measured_at,
        createdAt: row.created_at,
      })),
      learningActivated: false,
    },
    meta,
    { headers: rate.headers },
  );
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 5,
    windowMs: 60_000,
    scope: "whatsapp-memory-director-decision",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const meta = identity.meta;
  if (!isDirector(identity)) {
    return apiError("FORBIDDEN", "Esta decisão é exclusiva da diretoria.", meta, { status: 403, headers: rate.headers });
  }
  if ((identity.authMode === "cookie" || request.headers.has("origin")) && !isTrustedMutationOrigin(request)) {
    return apiError("ORIGIN_NOT_ALLOWED", "Origem da solicitação não autorizada.", meta, { status: 403, headers: rate.headers });
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "Informe uma chave de idempotência válida.", meta, { status: 400, headers: rate.headers });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return apiError("DECISION_BODY_TOO_LARGE", "A solicitação excede o limite permitido.", meta, { status: 413, headers: rate.headers });
  }
  let decodedBody: unknown;
  try {
    decodedBody = JSON.parse(rawBody);
  } catch {
    return apiError("DECISION_BODY_INVALID", "A solicitação não contém JSON válido.", meta, { status: 400, headers: rate.headers });
  }
  const parsed = parseWhatsAppMemoryDirectorDecisionInput(decodedBody);
  if (!parsed.ok) {
    return apiError(parsed.code, parsed.message, meta, { status: 400, headers: rate.headers });
  }

  const organizationId = identity.access.organization.id;
  const actorId = identity.access.profile.id;
  let evidence;
  try {
    evidence = await loadWhatsAppMemoryDirectorEvidence(organizationId);
  } catch (cause) {
    const errorCode = cause instanceof WhatsAppMemoryEvidenceLoadError ? cause.code : "UNKNOWN";
    structuredApiLog("error", "whatsapp.memory_decision.evidence_failed", request, meta, { organizationId, actorId, errorCode });
    return apiError("WHATSAPP_MEMORY_EVIDENCE_FAILED", "Não foi possível recalcular toda a evidência. Nenhuma decisão foi registrada.", meta, { status: 502, headers: rate.headers });
  }

  if (!evidence.gate.gate.readyForHumanRelease || !evidence.review.review.canBeReviewed) {
    return apiError("WHATSAPP_MEMORY_EVIDENCE_BLOCKED", "A evidência técnica ainda não permite decisão da diretoria.", meta, {
      status: 409,
      headers: rate.headers,
      details: {
        passedControls: evidence.gate.gate.passedControls,
        totalControls: evidence.gate.gate.totalControls,
        blockers: evidence.gate.gate.blockers,
      },
    });
  }

  const snapshot = buildWhatsAppMemoryDecisionEvidence(evidence.gate, evidence.review);
  const fingerprint = fingerprintWhatsAppMemoryDecisionEvidence(snapshot);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("record_whatsapp_memory_director_decision", {
    p_actor_id: actorId,
    p_organization_id: organizationId,
    p_decision: parsed.value.decision,
    p_reason: parsed.value.reason,
    p_operational_scope_confirmed: parsed.value.operationalScopeConfirmed,
    p_evidence_limits_confirmed: parsed.value.evidenceLimitsConfirmed,
    p_evidence_measured_at: snapshot.measuredAt,
    p_evidence_snapshot: snapshot,
    p_evidence_fingerprint: fingerprint,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const code = String(error.code ?? "");
    const message = String(error.message ?? "");
    const pending = isPersistenceMigrationPending(code, message);
    const conflict = /idempotency_conflict/i.test(message);
    const forbidden = /actor_forbidden/i.test(message);
    structuredApiLog("error", "whatsapp.memory_decision.write_failed", request, meta, {
      organizationId,
      actorId,
      decision: parsed.value.decision,
      errorCode: code || (pending ? "MIGRATION_PENDING" : "RPC_FAILED"),
    });
    if (pending) return apiError("PERSISTENCE_MIGRATION_PENDING", "A persistência protegida ainda aguarda reconciliação do banco.", meta, { status: 503, headers: rate.headers });
    if (conflict) return apiError("IDEMPOTENCY_CONFLICT", "A chave de idempotência já foi usada para outra decisão.", meta, { status: 409, headers: rate.headers });
    if (forbidden) return apiError("FORBIDDEN", "O perfil não pode registrar esta decisão.", meta, { status: 403, headers: rate.headers });
    return apiError("WHATSAPP_MEMORY_DECISION_FAILED", "Não foi possível registrar a decisão. Nada foi ativado.", meta, { status: 500, headers: rate.headers });
  }

  const result = (data ?? {}) as { replayed?: boolean };
  structuredApiLog("info", "whatsapp.memory_decision.recorded", request, meta, {
    organizationId,
    actorId,
    decision: parsed.value.decision,
    replayed: result.replayed === true,
    evidenceFingerprint: fingerprint,
  });
  return apiSuccess({
    ...result,
    evidenceFingerprint: fingerprint,
    evidenceMeasuredAt: snapshot.measuredAt,
    learningActivated: false,
  }, meta, { status: result.replayed ? 200 : 201, headers: rate.headers });
}
