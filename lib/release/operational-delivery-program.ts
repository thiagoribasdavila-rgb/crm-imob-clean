export const OPERATIONAL_DELIVERY_PROGRAM_SCHEMA =
  "atlas.operational-delivery-program.v1";

export type DeliveryEvidence = {
  id: string;
  verified: boolean;
  reference: string;
};

export type DeliveryCapability = {
  id: string;
  canonicalOwner: string;
  complete: boolean;
};

export type DeliveryApproval = {
  approved: boolean;
  approverRole?: "director" | "director_decisor";
  scope?: "large_module_package";
};

export type OperationalDeliveryInput = {
  moduleId: string;
  capabilities: DeliveryCapability[];
  evidence: DeliveryEvidence[];
  requiredEvidenceIds: string[];
  rollbackReady: boolean;
  approval?: DeliveryApproval;
};

export type OperationalDeliveryStatus =
  | "blocked"
  | "in_progress"
  | "ready_for_homologation"
  | "homologated";

export type OperationalDeliveryResult = {
  schema: typeof OPERATIONAL_DELIVERY_PROGRAM_SCHEMA;
  moduleId: string;
  status: OperationalDeliveryStatus;
  blockers: string[];
  verifiedEvidenceIds: string[];
  buildAllowed: boolean;
  zipAllowed: boolean;
  deployAllowed: false;
  productionMutationAllowed: false;
};

function detectCapabilityConflicts(capabilities: DeliveryCapability[]) {
  const owners = new Map<string, string>();
  const conflicts: string[] = [];

  for (const capability of capabilities) {
    const currentOwner = owners.get(capability.id);
    if (currentOwner && currentOwner !== capability.canonicalOwner) {
      conflicts.push(`duplicate-capability-owner:${capability.id}`);
      continue;
    }
    owners.set(capability.id, capability.canonicalOwner);
  }

  return conflicts;
}

export function evaluateOperationalDelivery(
  input: OperationalDeliveryInput,
): OperationalDeliveryResult {
  const blockers = detectCapabilityConflicts(input.capabilities);
  const verifiedEvidenceIds = Array.from(
    new Set(
      input.evidence
        .filter((item) => item.verified)
        .map((item) => item.id),
    ),
  ).sort();
  const verifiedEvidence = new Set(verifiedEvidenceIds);

  for (const evidenceId of input.requiredEvidenceIds) {
    if (!verifiedEvidence.has(evidenceId)) {
      blockers.push(`missing-verified-evidence:${evidenceId}`);
    }
  }

  if (input.capabilities.length === 0) blockers.push("empty-module-scope");
  if (input.capabilities.some((capability) => !capability.complete)) {
    blockers.push("incomplete-module-scope");
  }
  if (!input.rollbackReady) blockers.push("rollback-not-ready");

  const technicalReady = blockers.length === 0;
  const humanApproved =
    input.approval?.approved === true &&
    input.approval.scope === "large_module_package" &&
    (input.approval.approverRole === "director" ||
      input.approval.approverRole === "director_decisor");

  let status: OperationalDeliveryStatus = "in_progress";
  if (blockers.some((blocker) => blocker.startsWith("duplicate-"))) {
    status = "blocked";
  } else if (technicalReady && humanApproved) {
    status = "homologated";
  } else if (technicalReady) {
    status = "ready_for_homologation";
  }

  return {
    schema: OPERATIONAL_DELIVERY_PROGRAM_SCHEMA,
    moduleId: input.moduleId,
    status,
    blockers,
    verifiedEvidenceIds,
    buildAllowed: status === "homologated",
    zipAllowed: status === "homologated",
    deployAllowed: false,
    productionMutationAllowed: false,
  };
}

