import { canonicalPipelineStage } from "../atlas/pipeline-stages.ts";

export type CommercialContextMemoryRow = {
  development_id: string | null;
  stage_key: string | null;
  broker_id: string | null;
  recommended_action_key: string | null;
  interaction_count: number | null;
  last_interaction_at: string | null;
  expires_at: string | null;
};

const VALID_ACTIONS = new Set([
  "contact",
  "qualify",
  "present",
  "simulate",
  "schedule_visit",
  "confirm_visit",
  "follow_proposal",
  "validate_documents",
  "close",
  "reactivate",
]);

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1_000) / 10 : 0;

const hasValidDate = (value: string | null) =>
  Boolean(value && Number.isFinite(Date.parse(value)));

export function buildAiCommercialContextReadiness(input: {
  memories: CommercialContextMemoryRow[];
  sourceTotal?: number;
  observedLimit?: number;
  now?: string;
}) {
  const memories = input.memories ?? [];
  const sourceTotal = Math.max(
    memories.length,
    Math.trunc(input.sourceTotal ?? memories.length),
  );
  const observedLimit = Math.max(
    memories.length,
    Math.trunc(input.observedLimit ?? memories.length),
  );
  const now = new Date(input.now ?? Date.now());

  let projectLinked = 0;
  let stageValid = 0;
  let responsibleLinked = 0;
  let nextActionValid = 0;
  let complete = 0;
  let interacted = 0;
  let nonExpired = 0;
  let totalInteractions = 0;

  for (const memory of memories) {
    const hasProject = Boolean(memory.development_id);
    const hasStage = Boolean(canonicalPipelineStage(memory.stage_key));
    const hasResponsible = Boolean(memory.broker_id);
    const hasNextAction = Boolean(
      memory.recommended_action_key &&
        VALID_ACTIONS.has(memory.recommended_action_key),
    );

    if (hasProject) projectLinked += 1;
    if (hasStage) stageValid += 1;
    if (hasResponsible) responsibleLinked += 1;
    if (hasNextAction) nextActionValid += 1;
    if (hasProject && hasStage && hasResponsible && hasNextAction) complete += 1;

    const interactions = Math.max(0, Math.trunc(memory.interaction_count ?? 0));
    totalInteractions += interactions;
    if (interactions > 0 && hasValidDate(memory.last_interaction_at)) interacted += 1;
    if (
      hasValidDate(memory.expires_at) &&
      new Date(memory.expires_at as string).getTime() > now.getTime()
    ) {
      nonExpired += 1;
    }
  }

  const truncated = sourceTotal > memories.length;
  const decisionSupportReady =
    memories.length > 0 && complete === memories.length && !truncated;

  return {
    scope: "authenticated_organization" as const,
    containsPii: false as const,
    readsMessageContent: false as const,
    automaticDecision: false as const,
    inferenceMode: "evidence_only" as const,
    source: {
      total: sourceTotal,
      observed: memories.length,
      observedLimit,
      truncated,
    },
    context: {
      total: memories.length,
      projectLinked,
      stageValid,
      responsibleLinked,
      nextActionValid,
      complete,
      completenessPercent: percent(complete, memories.length),
      projectCoveragePercent: percent(projectLinked, memories.length),
      stageCoveragePercent: percent(stageValid, memories.length),
      responsibleCoveragePercent: percent(responsibleLinked, memories.length),
      nextActionCoveragePercent: percent(nextActionValid, memories.length),
    },
    activity: {
      totalInteractions,
      interacted,
      nonExpired,
      activeCoveragePercent: percent(nonExpired, memories.length),
    },
    gaps: {
      missingProject: memories.length - projectLinked,
      invalidStage: memories.length - stageValid,
      missingResponsible: memories.length - responsibleLinked,
      invalidNextAction: memories.length - nextActionValid,
    },
    readiness: {
      decisionSupportReady,
      rawContentUsed: false as const,
      requiresHumanReview: true as const,
    },
    measuredAt: now.toISOString(),
    limitations: [
      "A medição utiliza apenas o estado estruturado da memória comercial e não abre conversas, nomes ou telefones.",
      "Cobertura completa indica contexto disponível; não comprova precisão preditiva nem autoriza decisão automática.",
      "Ausência de projeto, etapa, responsável ou próxima ação deve ser corrigida na operação antes de orientar a equipe.",
    ],
  };
}
