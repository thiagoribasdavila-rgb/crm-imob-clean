export type DistributionEvidenceStatus =
  | "measured"
  | "insufficient_sample"
  | "unavailable";

type EvidenceLead = {
  id: string;
  development_id: string | null;
  assigned_to: string | null;
  created_at: string | null;
};

type EvidenceAssignment = {
  development_id: string | null;
  lead_id: string;
  assigned_to: string;
  created_at: string;
};

type EvidenceQueueMember = {
  development_id: string;
  profile_id: string;
  enabled: boolean;
  weight: number;
};

type AssignmentTimeEvidence = {
  status: DistributionEvidenceStatus;
  sampleSize: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  maximumMinutes: number | null;
};

const rounded = (value: number) => Math.round(value * 10) / 10;

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (fraction === 0.5 && sorted.length % 2 === 0) {
    const upper = sorted.length / 2;
    return rounded((sorted[upper - 1] + sorted[upper]) / 2);
  }
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return rounded(sorted[index]);
}

function assignmentTimeEvidence(minutes: number[]): AssignmentTimeEvidence {
  return {
    status:
      minutes.length >= 5
        ? "measured"
        : minutes.length > 0
          ? "insufficient_sample"
          : "unavailable",
    sampleSize: minutes.length,
    medianMinutes: percentile(minutes, 0.5),
    p90Minutes: percentile(minutes, 0.9),
    maximumMinutes: minutes.length ? rounded(Math.max(...minutes)) : null,
  };
}

export function buildDistributionEvidence(input: {
  leads: EvidenceLead[];
  assignments: EvidenceAssignment[];
  queue: EvidenceQueueMember[];
  projectIds: string[];
  maximumEvents?: number;
}) {
  const leadById = new Map(input.leads.map((lead) => [lead.id, lead]));
  const minutesByEvent = new Map<EvidenceAssignment, number>();

  for (const assignment of input.assignments) {
    const leadCreatedAt = leadById.get(assignment.lead_id)?.created_at;
    const created = Date.parse(leadCreatedAt || "");
    const assigned = Date.parse(assignment.created_at);
    if (Number.isFinite(created) && Number.isFinite(assigned) && assigned >= created) {
      minutesByEvent.set(assignment, (assigned - created) / 60_000);
    }
  }

  const enabledQueueByProject = new Map<string, EvidenceQueueMember[]>();
  for (const member of input.queue) {
    if (!member.enabled) continue;
    const current = enabledQueueByProject.get(member.development_id) ?? [];
    current.push(member);
    enabledQueueByProject.set(member.development_id, current);
  }

  const byProject = input.projectIds.map((developmentId) => {
    const assignments = input.assignments.filter(
      (assignment) => assignment.development_id === developmentId,
    );
    const measuredMinutes = assignments.flatMap((assignment) => {
      const value = minutesByEvent.get(assignment);
      return value === undefined ? [] : [value];
    });
    const members = enabledQueueByProject.get(developmentId) ?? [];
    const assignmentCounts = members.map((member) => ({
      profileId: member.profile_id,
      count: assignments.filter(
        (assignment) => assignment.assigned_to === member.profile_id,
      ).length,
    }));
    const observedAssignments = assignmentCounts.reduce(
      (total, item) => total + item.count,
      0,
    );
    const currentWeightedLoads = members.map((member) => {
      const load = input.leads.filter(
        (lead) =>
          lead.development_id === developmentId &&
          lead.assigned_to === member.profile_id,
      ).length;
      return load / Math.max(1, member.weight);
    });

    return {
      developmentId,
      assignmentTime: assignmentTimeEvidence(measuredMinutes),
      assignmentCoverage: {
        matched: measuredMinutes.length,
        observed: assignments.length,
      },
      observedAssignments,
      enabledBrokerCount: members.length,
      assignmentCounts,
      concentrationPercent:
        observedAssignments > 0 && assignmentCounts.length > 0
          ? rounded(
              (Math.max(...assignmentCounts.map((item) => item.count)) /
                observedAssignments) *
                100,
            )
          : null,
      currentWeightedLoadGap:
        currentWeightedLoads.length >= 2
          ? rounded(
              Math.max(...currentWeightedLoads) -
                Math.min(...currentWeightedLoads),
            )
          : null,
    };
  });

  const allMeasuredMinutes = [...minutesByEvent.values()];
  const timestamps = input.assignments
    .map((assignment) => assignment.created_at)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();

  return {
    scope: "authenticated_organization" as const,
    containsPii: false,
    window: {
      maximumEvents: input.maximumEvents ?? 100,
      observedEvents: input.assignments.length,
      firstEventAt: timestamps[0] ?? null,
      lastEventAt: timestamps.at(-1) ?? null,
    },
    overall: assignmentTimeEvidence(allMeasuredMinutes),
    coverage: {
      matched: allMeasuredMinutes.length,
      observed: input.assignments.length,
    },
    byProject,
    limitations: [
      "A janela contém no máximo os eventos recentes informados pela API.",
      "Concentração descreve entregas observadas e não comprova justiça da decisão.",
      "Tempo de atribuição só é medido quando a criação da lead está disponível na leitura atual.",
    ],
  };
}
