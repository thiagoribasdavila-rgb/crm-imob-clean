export type DistributionRosterCandidate = {
  id: string;
  enabled: boolean;
  online: boolean;
  availability: string;
  weight: number;
  totalLoad: number;
  projectLoad: number;
  maxActiveLeads: number;
  maxProjectLeads: number;
  lastAssignedAt: string | null;
};

export type DistributionProjectOption = {
  id: string;
  developerName: string | null;
};

export type DistributionDecision<T extends DistributionRosterCandidate> = {
  candidate: T;
  eligible: boolean;
  eligibilityReason: string;
  rank: number | null;
  isNext: boolean;
  weightedProjectLoad: number;
  totalRemaining: number;
  projectRemaining: number;
  decisionReason: string;
};

function weightedProjectLoad(candidate: DistributionRosterCandidate) {
  return candidate.projectLoad / Math.max(candidate.weight, 1);
}

function compareDistributionCandidates(
  left: DistributionRosterCandidate,
  right: DistributionRosterCandidate,
) {
  const loadGap = weightedProjectLoad(left) - weightedProjectLoad(right);
  if (loadGap !== 0) return loadGap;

  if (!left.lastAssignedAt && right.lastAssignedAt) return -1;
  if (left.lastAssignedAt && !right.lastAssignedAt) return 1;

  const assignmentGap = (left.lastAssignedAt || "").localeCompare(
    right.lastAssignedAt || "",
  );
  if (assignmentGap !== 0) return assignmentGap;

  return left.id.localeCompare(right.id);
}

export function resolveDistributionProjectFilter<
  T extends DistributionProjectOption,
>(projects: T[], developerFilter: string, currentProjectId: string) {
  const visibleProjects =
    developerFilter === "all"
      ? projects
      : projects.filter(
          (project) =>
            (project.developerName || "Não informada") === developerFilter,
        );
  const currentProjectIsVisible = visibleProjects.some(
    (project) => project.id === currentProjectId,
  );

  return {
    visibleProjects,
    projectId: currentProjectIsVisible
      ? currentProjectId
      : (visibleProjects[0]?.id ?? ""),
  };
}

export function distributionEligibility(
  candidate: DistributionRosterCandidate,
) {
  if (!candidate.enabled)
    return { eligible: false, reason: "Pausado neste projeto" };
  if (!candidate.online || candidate.availability === "offline") {
    return { eligible: false, reason: "Fora do Atlas agora" };
  }
  if (candidate.availability !== "available") {
    return { eligible: false, reason: "Marcado como ocupado" };
  }
  if (candidate.totalLoad >= candidate.maxActiveLeads) {
    return { eligible: false, reason: "Limite total atingido" };
  }
  if (candidate.projectLoad >= candidate.maxProjectLeads) {
    return { eligible: false, reason: "Limite do projeto atingido" };
  }
  return { eligible: true, reason: "Pronto para receber" };
}

export function buildDistributionRotation<
  T extends DistributionRosterCandidate,
>(candidates: T[]) {
  return candidates
    .filter((candidate) => distributionEligibility(candidate).eligible)
    .sort(compareDistributionCandidates);
}

export function buildDistributionDecisionTrail<
  T extends DistributionRosterCandidate,
>(candidates: T[]): DistributionDecision<T>[] {
  const eligibleCandidates = buildDistributionRotation(candidates);
  const ranks = new Map(
    eligibleCandidates.map((candidate, index) => [candidate.id, index + 1]),
  );
  const blockedCandidates = candidates.filter(
    (candidate) => !distributionEligibility(candidate).eligible,
  );

  return [...eligibleCandidates, ...blockedCandidates].map((candidate) => {
    const eligibility = distributionEligibility(candidate);
    const rank = ranks.get(candidate.id) ?? null;
    const weightedLoad = weightedProjectLoad(candidate);
    const totalRemaining = Math.max(
      0,
      candidate.maxActiveLeads - candidate.totalLoad,
    );
    const projectRemaining = Math.max(
      0,
      candidate.maxProjectLeads - candidate.projectLoad,
    );

    let decisionReason = eligibility.reason;
    if (rank === 1) {
      decisionReason = candidate.lastAssignedAt
        ? "Menor carga ponderada e maior tempo desde a última entrega."
        : "Menor carga ponderada e ainda não recebeu lead neste projeto.";
    } else if (rank) {
      decisionReason =
        "Posição " +
        rank +
        ": carga ponderada " +
        weightedLoad.toFixed(1) +
        ".";
    }

    return {
      candidate,
      eligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
      rank,
      isNext: rank === 1,
      weightedProjectLoad: weightedLoad,
      totalRemaining,
      projectRemaining,
      decisionReason,
    };
  });
}
