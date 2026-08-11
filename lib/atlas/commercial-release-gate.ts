export type AutomatedGateStatus = "passed" | "pending" | "failed";
export type HumanApprovalStatus = "approved" | "pending" | "rejected";
export type CommercialReleaseStatus =
  | "passed"
  | "pending-human"
  | "blocked";

export type AutomatedReleaseGate = {
  id: string;
  status: AutomatedGateStatus;
};

export type HumanReleaseApproval = {
  role: "director" | "manager" | "broker";
  status: HumanApprovalStatus;
};

export type CommercialReleaseGateInput = {
  automatedGates: AutomatedReleaseGate[];
  humanApprovals: HumanReleaseApproval[];
  openP0: number;
  openP1: number;
};

export type CommercialReleaseGateResult = {
  status: CommercialReleaseStatus;
  releaseAllowed: boolean;
  failedGateIds: string[];
  pendingGateIds: string[];
  rejectedRoles: string[];
  pendingRoles: string[];
};

const REQUIRED_APPROVAL_ROLES = ["director", "manager", "broker"] as const;

export function evaluateCommercialReleaseGate(
  input: CommercialReleaseGateInput,
): CommercialReleaseGateResult {
  const failedGateIds = input.automatedGates
    .filter((gate) => gate.status === "failed")
    .map((gate) => gate.id);
  const pendingGateIds = input.automatedGates
    .filter((gate) => gate.status === "pending")
    .map((gate) => gate.id);
  const approvalByRole = new Map(
    input.humanApprovals.map((approval) => [approval.role, approval.status]),
  );
  const rejectedRoles = REQUIRED_APPROVAL_ROLES.filter(
    (role) => approvalByRole.get(role) === "rejected",
  );
  const pendingRoles = REQUIRED_APPROVAL_ROLES.filter(
    (role) => approvalByRole.get(role) !== "approved",
  );
  const hasCriticalRegression = input.openP0 > 0 || input.openP1 > 0;

  if (hasCriticalRegression || failedGateIds.length > 0 || rejectedRoles.length > 0) {
    return {
      status: "blocked",
      releaseAllowed: false,
      failedGateIds,
      pendingGateIds,
      rejectedRoles,
      pendingRoles,
    };
  }

  if (pendingGateIds.length > 0 || pendingRoles.length > 0) {
    return {
      status: "pending-human",
      releaseAllowed: false,
      failedGateIds,
      pendingGateIds,
      rejectedRoles,
      pendingRoles,
    };
  }

  return {
    status: "passed",
    releaseAllowed: true,
    failedGateIds,
    pendingGateIds,
    rejectedRoles,
    pendingRoles,
  };
}
