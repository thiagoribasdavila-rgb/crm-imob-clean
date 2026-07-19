export const ATLAS_LIVE_DEVELOPMENT_WRITE_HOMOLOGATION_VERSION =
  "live-development-write-homologation-v1" as const;

export const LIVE_DEVELOPMENT_CANONICAL_MANAGER_ROLES = [
  "ADMIN",
  "DIRETOR_DECISOR",
  "DIRETOR",
  "GERENTE",
] as const;

export type LiveDevelopmentCanonicalManagerRole =
  (typeof LIVE_DEVELOPMENT_CANONICAL_MANAGER_ROLES)[number];

export type LiveDevelopmentWriteOperation = "create" | "update";

export type LiveDevelopmentWriteEvidence = {
  migrationApplied: boolean;
  persistentAuditTableLive: boolean;
  projectRoleHelperLive: boolean;
  atomicMutationRpcLive: boolean;
  roleMatrixTested: boolean;
  createRollbackTested: boolean;
  updateRollbackTested: boolean;
  crossTenantIsolationTested: boolean;
  idempotencyTested: boolean;
  signoffRecorded: boolean;
};

export type LiveDevelopmentWriteHomologationState =
  | "design-approved-awaiting-controlled-application"
  | "controlled-test-ready"
  | "approved";

export type LiveDevelopmentRoleScenario = {
  actor: string;
  tenant: "same" | "different" | "none";
  operation: LiveDevelopmentWriteOperation;
  expected: "allow" | "deny";
  proof: string;
};

const EVIDENCE_BLOCKERS: Readonly<
  Record<keyof LiveDevelopmentWriteEvidence, string>
> = {
  migrationApplied: "project-write-gate-migration-not-applied",
  persistentAuditTableLive: "project-audit-table-not-live",
  projectRoleHelperLive: "project-role-helper-not-live",
  atomicMutationRpcLive: "project-write-rpc-not-live",
  roleMatrixTested: "project-role-matrix-not-tested",
  createRollbackTested: "project-create-rollback-not-tested",
  updateRollbackTested: "project-update-rollback-not-tested",
  crossTenantIsolationTested: "project-cross-tenant-isolation-not-tested",
  idempotencyTested: "project-idempotency-not-tested",
  signoffRecorded: "project-write-signoff-not-recorded",
};

export const LIVE_DEVELOPMENT_WRITE_ROLE_MATRIX: readonly LiveDevelopmentRoleScenario[] = [
  ...LIVE_DEVELOPMENT_CANONICAL_MANAGER_ROLES.flatMap((actor) => [
    {
      actor,
      tenant: "same" as const,
      operation: "create" as const,
      expected: "allow" as const,
      proof: "authenticated-active-profile-exact-tenant",
    },
    {
      actor,
      tenant: "same" as const,
      operation: "update" as const,
      expected: "allow" as const,
      proof: "authenticated-active-profile-exact-tenant",
    },
  ]),
  {
    actor: "CORRETOR",
    tenant: "same",
    operation: "create",
    expected: "deny",
    proof: "role-not-authorized-for-project-management",
  },
  {
    actor: "CORRETOR",
    tenant: "same",
    operation: "update",
    expected: "deny",
    proof: "role-not-authorized-for-project-management",
  },
  {
    actor: "DIRETOR",
    tenant: "different",
    operation: "update",
    expected: "deny",
    proof: "cross-tenant-isolation",
  },
  {
    actor: "UNAUTHENTICATED",
    tenant: "none",
    operation: "create",
    expected: "deny",
    proof: "authentication-required",
  },
];

export const LIVE_DEVELOPMENT_WRITE_TRANSACTION_SCENARIOS = [
  {
    scenario: "same-idempotency-key-same-request",
    expected: "return-original-result-without-second-mutation",
  },
  {
    scenario: "same-idempotency-key-different-request",
    expected: "reject-idempotency-conflict",
  },
  {
    scenario: "audit-insert-fails-after-project-command",
    expected: "rollback-project-command",
  },
  {
    scenario: "date-range-invalid-after-update",
    expected: "rollback-project-command",
  },
] as const;

export const EMPTY_LIVE_DEVELOPMENT_WRITE_EVIDENCE: LiveDevelopmentWriteEvidence = {
  migrationApplied: false,
  persistentAuditTableLive: false,
  projectRoleHelperLive: false,
  atomicMutationRpcLive: false,
  roleMatrixTested: false,
  createRollbackTested: false,
  updateRollbackTested: false,
  crossTenantIsolationTested: false,
  idempotencyTested: false,
  signoffRecorded: false,
};

export function evaluateLiveDevelopmentWriteHomologation(
  evidence: LiveDevelopmentWriteEvidence = EMPTY_LIVE_DEVELOPMENT_WRITE_EVIDENCE,
) {
  const missingEvidence = (
    Object.keys(EVIDENCE_BLOCKERS) as Array<keyof LiveDevelopmentWriteEvidence>
  )
    .filter((key) => !evidence[key])
    .map((key) => EVIDENCE_BLOCKERS[key]);

  const infrastructureReady =
    evidence.migrationApplied &&
    evidence.persistentAuditTableLive &&
    evidence.projectRoleHelperLive &&
    evidence.atomicMutationRpcLive;
  const activationAllowed = missingEvidence.length === 0;
  const state: LiveDevelopmentWriteHomologationState = activationAllowed
    ? "approved"
    : infrastructureReady
      ? "controlled-test-ready"
      : "design-approved-awaiting-controlled-application";

  return {
    version: ATLAS_LIVE_DEVELOPMENT_WRITE_HOMOLOGATION_VERSION,
    state,
    designComplete: true,
    activationAllowed,
    directDmlAllowed: false,
    deleteAllowed: false,
    proposedOperations: ["create", "update"] as const,
    approvedOperations: activationAllowed
      ? (["create", "update"] as const)
      : ([] as const),
    managerRoles: LIVE_DEVELOPMENT_CANONICAL_MANAGER_ROLES,
    evidence,
    missingEvidence,
    roleMatrix: LIVE_DEVELOPMENT_WRITE_ROLE_MATRIX,
    transactionScenarios: LIVE_DEVELOPMENT_WRITE_TRANSACTION_SCENARIOS,
    rollout: [
      "apply-isolated-migration-in-homologation",
      "run-role-and-cross-tenant-matrix",
      "prove-create-update-audit-atomicity",
      "prove-idempotency-and-rollback",
      "record-human-signoff",
      "activate-api-command-boundary-only",
    ] as const,
    rollback: [
      "disable-project-command-endpoint",
      "revoke-rpc-from-authenticated",
      "preserve-projects-and-audit-history",
      "restore-last-approved-project-policies",
    ] as const,
  };
}

export function getLiveDevelopmentWriteHomologation() {
  return evaluateLiveDevelopmentWriteHomologation();
}
