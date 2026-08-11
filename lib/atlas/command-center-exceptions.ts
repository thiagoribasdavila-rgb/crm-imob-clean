export type CommandCenterExceptionTone = "critical" | "attention" | "monitor";

export type CommandCenterExceptionCandidate = {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  href: string;
  actionLabel: string;
  tone: CommandCenterExceptionTone;
  score: number;
};

export type CommandCenterSupportIndicator = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "positive" | "attention";
};

export const COMMAND_CENTER_EXCEPTION_CONTRACT = Object.freeze({
  phase: 52,
  primaryDecisionCount: 1,
  exceptionQueueLimit: 3,
  supportIndicatorLimit: 3,
  maxClicksToOpportunity: 2,
  deduplicateBy: "normalized-title-and-href",
  aiCalls: 0,
  businessMutation: false,
  databaseMigration: false,
});

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function exceptionKey(
  input: Pick<CommandCenterExceptionCandidate, "title" | "href">,
) {
  return `${normalize(input.title)}::${normalize(input.href)}`;
}

export function buildCommandCenterExceptionQueue(input: {
  primary: { title: string; href: string };
  candidates: readonly CommandCenterExceptionCandidate[];
  limit?: number;
}) {
  const safeLimit = Math.max(
    0,
    Math.min(
      input.limit ?? COMMAND_CENTER_EXCEPTION_CONTRACT.exceptionQueueLimit,
      COMMAND_CENTER_EXCEPTION_CONTRACT.exceptionQueueLimit,
    ),
  );
  const primaryKey = exceptionKey(input.primary);
  const seen = new Set<string>();

  return input.candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => {
      const key = exceptionKey(candidate);
      if (key === primaryKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        right.candidate.score - left.candidate.score ||
        left.index - right.index,
    )
    .slice(0, safeLimit)
    .map(({ candidate }) => candidate);
}

export function selectCommandCenterSupportIndicators(
  indicators: readonly CommandCenterSupportIndicator[],
  limit = COMMAND_CENTER_EXCEPTION_CONTRACT.supportIndicatorLimit,
) {
  const safeLimit = Math.max(
    0,
    Math.min(limit, COMMAND_CENTER_EXCEPTION_CONTRACT.supportIndicatorLimit),
  );
  const seen = new Set<string>();

  return indicators
    .filter((indicator) => {
      const id = normalize(indicator.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, safeLimit);
}
