import progressSnapshot from "@/config/v3000-progress.json";

export type V3000ConsolidationStatus = "complete" | "next" | "pending";

export type V3000ConsolidationPhase = {
  id: number;
  name: string;
  status: V3000ConsolidationStatus;
  outcome: string;
};

const phases = progressSnapshot.consolidation.phases as V3000ConsolidationPhase[];
const completedPhases = phases.filter((phase) => phase.status === "complete").length;
const verifiedHistoricalPhases = progressSnapshot.program.verifiedHistoricalPhases;
const targetPhases = progressSnapshot.program.targetPhases;
const requestedLegacyPhases = progressSnapshot.program.legacyPhasesRequested;

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1_000) / 10;
}

export const v3000Progress = {
  program: progressSnapshot.program,
  consolidation: {
    ...progressSnapshot.consolidation,
    phases,
    completedPhases,
    percentage: percent(completedPhases, progressSnapshot.consolidation.totalPhases),
    nextPhase: phases.find((phase) => phase.status === "next") ?? null,
  },
  coverage: {
    verifiedHistoricalPhases,
    requestedLegacyPhases,
    unverifiedLegacyGap: Math.max(0, requestedLegacyPhases - verifiedHistoricalPhases),
    v3000Percentage: percent(verifiedHistoricalPhases, targetPhases),
    contractPercentage: percent(
      progressSnapshot.program.phaseContractsFound,
      verifiedHistoricalPhases,
    ),
  },
} as const;

export type V3000Progress = typeof v3000Progress;
