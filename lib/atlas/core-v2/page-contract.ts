export const ATLAS_PAGE_DEPTHS = ["glance", "workspace", "context"] as const;

export type AtlasPageDepth = (typeof ATLAS_PAGE_DEPTHS)[number];
export type AtlasCommercialRole = "director" | "superintendent" | "manager" | "broker";
export type AtlasAccessRole = "admin" | "director_decisor" | "director" | "broker";
export type AtlasPageScope = "organization" | "management-tree" | "team" | "own-portfolio";

export type AtlasPageAction = {
  id: string;
  label: string;
  href: string;
  outcome: string;
};

export type AtlasDecisionMetric = {
  id: string;
  label: string;
  decisionQuestion: string;
};

export type AtlasPageDataDependency = {
  domain: string;
  query: string;
  tenantScoped: true;
  fallback: "empty-state" | "partial-state" | "cached-state";
};

export type AtlasPageContract = {
  id: string;
  route: `/${string}`;
  businessOutcome: string;
  primaryAction: AtlasPageAction;
  decisionMetrics: readonly AtlasDecisionMetric[];
  depths: readonly ["glance", "workspace", "context"];
  priorityQueue: {
    title: string;
    ordering: readonly string[];
  };
  roleScopes: Readonly<Record<AtlasCommercialRole, AtlasPageScope | "hidden">>;
  allowedAccessRoles: readonly AtlasAccessRole[];
  dataDependencies: readonly AtlasPageDataDependency[];
  copilot: {
    contextId: string;
    capabilities: readonly string[];
    maximumAutonomy: 0 | 1 | 2 | 3 | 4;
  };
  rendering: {
    strategy: "server-first";
    interactiveIslands: readonly string[];
  };
};

function hasCanonicalDepths(depths: readonly AtlasPageDepth[]) {
  return depths.length === ATLAS_PAGE_DEPTHS.length
    && depths.every((depth, index) => depth === ATLAS_PAGE_DEPTHS[index]);
}

export function validateAtlasPageContract(contract: AtlasPageContract) {
  const errors: string[] = [];

  if (!/^[a-z0-9-]+$/.test(contract.id)) errors.push("page-id-must-be-kebab-case");
  if (!contract.route.startsWith("/")) errors.push("route-must-be-absolute");
  if (contract.businessOutcome.trim().length < 12) errors.push("business-outcome-is-required");
  if (!contract.primaryAction.id || !contract.primaryAction.label || !contract.primaryAction.href) {
    errors.push("one-primary-action-is-required");
  }
  if (contract.decisionMetrics.length > 5) errors.push("maximum-five-decision-metrics");
  if (!hasCanonicalDepths(contract.depths)) errors.push("canonical-depth-order-is-required");
  if (!contract.priorityQueue.ordering.length) errors.push("priority-ordering-is-required");
  if (!contract.allowedAccessRoles.length) errors.push("access-role-is-required");
  if (contract.dataDependencies.some((dependency) => dependency.tenantScoped !== true)) {
    errors.push("every-commercial-dependency-must-be-tenant-scoped");
  }
  if (contract.rendering.strategy !== "server-first") errors.push("server-first-rendering-is-required");

  return { valid: errors.length === 0, errors } as const;
}

export function defineAtlasPageContract<const T extends AtlasPageContract>(contract: T) {
  const validation = validateAtlasPageContract(contract);
  if (!validation.valid) {
    throw new Error(`Invalid ATLAS page contract: ${validation.errors.join(", ")}`);
  }
  return Object.freeze(contract);
}
