import { createHash } from "node:crypto";

const ALLOWED_KEYS = new Set([
  "decision",
  "reason",
  "operationalScopeConfirmed",
  "evidenceLimitsConfirmed",
]);

export type WhatsAppMemoryDirectorDecisionInput = {
  decision: "approve" | "reject";
  reason: string;
  operationalScopeConfirmed: true;
  evidenceLimitsConfirmed: true;
};

type ValidationResult =
  | { ok: true; value: WhatsAppMemoryDirectorDecisionInput }
  | { ok: false; code: string; message: string };

export function parseWhatsAppMemoryDirectorDecisionInput(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "DECISION_BODY_INVALID", message: "Informe os dados da decisão." };
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    return { ok: false, code: "DECISION_BODY_FIELDS_INVALID", message: "A solicitação contém campos não permitidos." };
  }
  const decision = typeof record.decision === "string" ? record.decision.trim().toLowerCase() : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, code: "DECISION_INVALID", message: "Escolha aprovar ou rejeitar." };
  }
  if (reason.length < 20 || reason.length > 1_000) {
    return { ok: false, code: "DECISION_REASON_INVALID", message: "Descreva a decisão em 20 a 1.000 caracteres." };
  }
  if (record.operationalScopeConfirmed !== true || record.evidenceLimitsConfirmed !== true) {
    return { ok: false, code: "DIRECTOR_CONFIRMATIONS_REQUIRED", message: "As duas confirmações da diretoria são obrigatórias." };
  }
  return {
    ok: true,
    value: {
      decision,
      reason,
      operationalScopeConfirmed: true,
      evidenceLimitsConfirmed: true,
    },
  };
}

type ReleaseGate = {
  containsPii: false;
  readsMessageContent: false;
  automaticDecision: false;
  proof: Record<string, number>;
  controls: Array<{ code: string; passed: boolean }>;
  gate: {
    readyForHumanRelease: boolean;
    passedControls: number;
    totalControls: number;
    blockers: string[];
  };
  measuredAt: string;
};

type HumanReview = { review: { canBeReviewed: boolean } };

export function buildWhatsAppMemoryDecisionEvidence(gate: ReleaseGate, review: HumanReview) {
  return {
    schemaVersion: 1,
    source: "server_recalculation",
    technicalGateReady: gate.gate.readyForHumanRelease,
    canBeReviewed: review.review.canBeReviewed,
    containsPii: false,
    readsMessageContent: false,
    automaticDecision: false,
    passedControls: gate.gate.passedControls,
    totalControls: gate.gate.totalControls,
    blockers: [...gate.gate.blockers],
    measuredAt: gate.measuredAt,
    proof: { ...gate.proof },
    controls: gate.controls.map((control) => ({ code: control.code, passed: control.passed })),
  };
}

export function fingerprintWhatsAppMemoryDecisionEvidence(evidence: ReturnType<typeof buildWhatsAppMemoryDecisionEvidence>) {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}
