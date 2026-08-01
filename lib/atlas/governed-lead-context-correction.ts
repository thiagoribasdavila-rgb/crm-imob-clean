export type GovernedLeadCommercialContext = {
  projectId: string | null;
  source: string | null;
};

export type GovernedLeadContextCorrection = GovernedLeadCommercialContext & {
  reason: string;
  humanConfirmed: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCommercialContextText(value: unknown, maximum = 160) {
  if (typeof value !== "string") return null;
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum) || null;
}

export function normalizeCommercialProjectId(value: unknown) {
  const normalized = normalizeCommercialContextText(value, 80);
  return normalized || null;
}

export function sameGovernedLeadCommercialContext(
  left: GovernedLeadCommercialContext,
  right: GovernedLeadCommercialContext,
) {
  return left.projectId === right.projectId && left.source === right.source;
}

export function validateGovernedLeadContextCorrection(input: {
  projectId?: unknown;
  source?: unknown;
  reason?: unknown;
  humanConfirmed?: unknown;
}):
  | { ok: true; correction: GovernedLeadContextCorrection }
  | { ok: false; error: string } {
  const projectId = normalizeCommercialProjectId(input.projectId);
  const source = normalizeCommercialContextText(input.source);
  const reason = normalizeCommercialContextText(input.reason, 500) || "";

  if (projectId && !uuidPattern.test(projectId)) {
    return { ok: false, error: "Selecione um projeto válido da organização." };
  }
  if (source && source.length < 2) {
    return { ok: false, error: "Informe uma origem com pelo menos 2 caracteres ou deixe o campo vazio." };
  }
  if (reason.length < 10) {
    return { ok: false, error: "Explique o motivo da correção em pelo menos 10 caracteres." };
  }
  if (input.humanConfirmed !== true) {
    return { ok: false, error: "Confirme que projeto e origem atuais foram revisados." };
  }

  return {
    ok: true,
    correction: { projectId, source, reason, humanConfirmed: true },
  };
}

export function buildGovernedLeadContextAuditMetadata(input: {
  previous: GovernedLeadCommercialContext & { projectName: string | null };
  current: GovernedLeadCommercialContext & { projectName: string | null };
  reason: string;
}) {
  return {
    phase: 87,
    correctionSurface: "lead_360",
    correctionReason: input.reason,
    previousContext: input.previous,
    currentContext: input.current,
    currentLeadStateOnly: true,
    humanConfirmed: true,
    historicalSnapshotsRewritten: false,
    automaticFill: false,
  } as const;
}
