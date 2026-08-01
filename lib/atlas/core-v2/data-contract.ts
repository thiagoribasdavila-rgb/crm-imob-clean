import type { AtlasAccessRole, AtlasCommercialRole } from "./page-contract";

export type AtlasTenantContext = {
  organizationId: string;
  userId: string;
  accessRole: AtlasAccessRole;
  commercialRole: AtlasCommercialRole | null;
  permissions: readonly string[];
  resolvedAt: string;
  source: "profile-membership" | "controlled-homologation-fallback";
};

export type AtlasQueryTrace = {
  requestId: string;
  queryName: string;
  organizationId: string;
  durationMs: number;
};

export type AtlasReadRequest<TFilters extends Record<string, unknown>> = {
  tenant: AtlasTenantContext;
  queryName: string;
  filters: Readonly<TFilters>;
};

export type AtlasReadResult<T> = {
  data: T;
  generatedAt: string;
  trace: AtlasQueryTrace;
};

export type AtlasWriteCommand<TPayload extends Record<string, unknown>> = {
  tenant: AtlasTenantContext;
  commandName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Readonly<TPayload>;
  idempotencyKey: string;
  expectedVersion?: number;
};

export interface AtlasRepository<
  TFilters extends Record<string, unknown>,
  TRead,
  TPayload extends Record<string, unknown>,
  TWrite,
> {
  read(request: AtlasReadRequest<TFilters>): Promise<AtlasReadResult<TRead>>;
  write(command: AtlasWriteCommand<TPayload>): Promise<AtlasReadResult<TWrite>>;
}

export type AtlasDataApiGrant = {
  role: "anon" | "authenticated";
  privileges: readonly ("select" | "insert" | "update" | "delete")[];
};

export type AtlasRlsPolicyContract = {
  name: string;
  operation: "select" | "insert" | "update" | "delete";
  roles: readonly ("anon" | "authenticated")[];
  tenantPredicate: string;
  hasUsing: boolean;
  hasWithCheck: boolean;
};

export type AtlasDataApiContract = {
  schema: "public";
  table: string;
  exposed: boolean;
  grants: readonly AtlasDataApiGrant[];
  rowLevelSecurity: {
    enabled: true;
    forced: boolean;
    policies: readonly AtlasRlsPolicyContract[];
  };
};

export function validateAtlasTenantContext(context: AtlasTenantContext) {
  const errors: string[] = [];
  if (!context.organizationId.trim()) errors.push("organization-id-is-required");
  if (!context.userId.trim()) errors.push("user-id-is-required");
  if (!context.resolvedAt || Number.isNaN(Date.parse(context.resolvedAt))) errors.push("resolved-at-must-be-iso-date");
  if (context.source === "controlled-homologation-fallback" && context.accessRole !== "admin") {
    errors.push("homologation-fallback-is-admin-only");
  }
  return { valid: errors.length === 0, errors } as const;
}

export function validateAtlasDataApiContract(contract: AtlasDataApiContract) {
  const errors: string[] = [];
  if (!contract.table.trim()) errors.push("table-is-required");
  if (contract.exposed && !contract.grants.length) errors.push("explicit-data-api-grant-is-required");
  if (contract.exposed && contract.rowLevelSecurity.enabled !== true) errors.push("rls-is-required");
  if (contract.exposed && !contract.rowLevelSecurity.policies.length) errors.push("rls-policy-is-required");

  for (const policy of contract.rowLevelSecurity.policies) {
    if (!policy.tenantPredicate.trim()) errors.push(`tenant-predicate-is-required:${policy.name}`);
    if (["select", "update", "delete"].includes(policy.operation) && !policy.hasUsing) {
      errors.push(`using-clause-is-required:${policy.name}`);
    }
    if (["insert", "update"].includes(policy.operation) && !policy.hasWithCheck) {
      errors.push(`with-check-clause-is-required:${policy.name}`);
    }
  }

  return { valid: errors.length === 0, errors } as const;
}
