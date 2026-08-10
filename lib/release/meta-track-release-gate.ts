export const META_TRACK_RELEASE_GATE_SCHEMA = "atlas.meta.release-gate.v1";

export type MetaTrackReleaseGateStatus =
  | "blocked"
  | "pending_director_approval"
  | "approved_for_single_build";

export type MetaTrackEvidence = {
  id: string;
  passed: boolean;
  reference: string;
};

export type MetaTrackReleaseApproval = {
  approved: boolean;
  approvedAt: string | null;
  approverRole: string | null;
  scope: string | null;
};

export type MetaTrackReleaseGateInput = {
  approval: MetaTrackReleaseApproval | null;
  coreChecks: MetaTrackEvidence[];
  externalDeliveryOccurred: boolean;
  phaseChecks: MetaTrackEvidence[];
  productionMutationOccurred: boolean;
};

export type MetaTrackReleaseGateDecision = {
  buildAllowed: boolean;
  missingEvidence: string[];
  nextAction: string;
  productionAllowed: false;
  schemaVersion: typeof META_TRACK_RELEASE_GATE_SCHEMA;
  status: MetaTrackReleaseGateStatus;
  zipAllowed: false;
};

const REQUIRED_PHASES = ["phase-166", "phase-167", "phase-168", "phase-169"];
const REQUIRED_CORE_CHECKS = ["contracts", "typecheck", "lint", "secret-scan"];

function hasSafeEvidence(evidence: MetaTrackEvidence[], id: string) {
  const item = evidence.find((candidate) => candidate.id === id);
  return Boolean(item?.passed && item.reference.trim().length > 0);
}

function validApproval(approval: MetaTrackReleaseApproval | null) {
  if (!approval?.approved || approval.scope !== "single_release_build") return false;
  if (!approval.approvedAt || Number.isNaN(Date.parse(approval.approvedAt))) return false;
  return approval.approverRole === "director" || approval.approverRole === "director_decisor";
}

export function evaluateMetaTrackReleaseGate(
  input: MetaTrackReleaseGateInput,
): MetaTrackReleaseGateDecision {
  const missingEvidence = [
    ...REQUIRED_PHASES.filter((id) => !hasSafeEvidence(input.phaseChecks, id)),
    ...REQUIRED_CORE_CHECKS.filter((id) => !hasSafeEvidence(input.coreChecks, id)),
  ];

  if (input.externalDeliveryOccurred) missingEvidence.push("no-external-delivery");
  if (input.productionMutationOccurred) missingEvidence.push("no-production-mutation");

  if (missingEvidence.length > 0) {
    return {
      buildAllowed: false,
      missingEvidence,
      nextAction: "Corrigir ou comprovar as evidências pendentes antes de solicitar decisão da diretoria.",
      productionAllowed: false,
      schemaVersion: META_TRACK_RELEASE_GATE_SCHEMA,
      status: "blocked",
      zipAllowed: false,
    };
  }

  if (!validApproval(input.approval)) {
    return {
      buildAllowed: false,
      missingEvidence: [],
      nextAction: "Solicitar aprovação explícita da diretoria para um único build de fechamento.",
      productionAllowed: false,
      schemaVersion: META_TRACK_RELEASE_GATE_SCHEMA,
      status: "pending_director_approval",
      zipAllowed: false,
    };
  }

  return {
    buildAllowed: true,
    missingEvidence: [],
    nextAction: "Executar um único build limpo; ZIP e produção exigem a evidência desse build em gate posterior.",
    productionAllowed: false,
    schemaVersion: META_TRACK_RELEASE_GATE_SCHEMA,
    status: "approved_for_single_build",
    zipAllowed: false,
  };
}
