export type CommercialContextTimelineValue = {
  projectId: string | null;
  projectName: string | null;
  source: string | null;
};

export type CommercialContextCorrectionTimeline = {
  previous: CommercialContextTimelineValue;
  current: CommercialContextTimelineValue;
  reason: string;
  changedDimensions: Array<"project" | "source">;
  policy: {
    currentLeadStateOnly: true;
    futureDecisionsUseCurrentContext: true;
    historicalFactsChanged: false;
    automaticFill: false;
  };
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedText(value: unknown, maximum = 500) {
  if (typeof value !== "string") return null;
  return (
    value
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximum) || null
  );
}

function parseContext(value: unknown): CommercialContextTimelineValue | null {
  const context = recordValue(value);
  if (!context) return null;

  return {
    projectId: normalizedText(context.projectId, 80),
    projectName: normalizedText(context.projectName, 160),
    source: normalizedText(context.source, 160),
  };
}

function projectIdentity(value: CommercialContextTimelineValue) {
  return value.projectId ?? value.projectName;
}

export function parseCommercialContextCorrectionTimeline(
  metadata: unknown,
): CommercialContextCorrectionTimeline | null {
  const record = recordValue(metadata);
  if (!record) return null;

  const previous = parseContext(record.previousContext);
  const current = parseContext(record.currentContext);
  const reason = normalizedText(record.correctionReason);
  const policyIsExplicit =
    record.currentLeadStateOnly === true &&
    record.humanConfirmed === true &&
    record.historicalSnapshotsRewritten === false &&
    record.automaticFill === false;

  if (!previous || !current || !reason || !policyIsExplicit) return null;

  const changedDimensions: Array<"project" | "source"> = [];
  if (projectIdentity(previous) !== projectIdentity(current)) {
    changedDimensions.push("project");
  }
  if (previous.source !== current.source) changedDimensions.push("source");
  if (changedDimensions.length === 0) return null;

  return {
    previous,
    current,
    reason,
    changedDimensions,
    policy: {
      currentLeadStateOnly: true,
      futureDecisionsUseCurrentContext: true,
      historicalFactsChanged: false,
      automaticFill: false,
    },
  };
}

export function commercialContextProjectLabel(
  context: CommercialContextTimelineValue,
) {
  if (context.projectName) return context.projectName;
  if (context.projectId) return "Projeto cadastrado";
  return "Não informado";
}

export function commercialContextSourceLabel(
  context: CommercialContextTimelineValue,
) {
  return context.source ?? "Não informada";
}
