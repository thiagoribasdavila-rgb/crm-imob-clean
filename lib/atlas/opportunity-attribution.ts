export type OpportunityAttributionStepKey =
  | "campaign"
  | "lead"
  | "broker"
  | "stage";

export type OpportunityAttributionStep = {
  key: OpportunityAttributionStepKey;
  label: string;
  state: "linked" | "missing";
  value: string;
};

export type OpportunityAttributionContext = {
  key: "source" | "project" | "developer";
  label: string;
  state: "linked" | "missing" | "conflict";
  value: string;
};

export type OpportunityAttributionFinancials = {
  attributedCost: number;
  attributedRevenue: number;
  periodEnd: string;
  periodStart: string;
};

export type OpportunityAttributionSnapshot = {
  contexts: OpportunityAttributionContext[];
  financials: OpportunityAttributionFinancials | null;
  missing: string[];
  status: "complete" | "partial" | "conflict";
  statusLabel: "Rastro completo" | "Rastro parcial" | "Revisar vínculo";
  steps: OpportunityAttributionStep[];
};

export type OpportunityAttributionInput = {
  assignedName?: string | null;
  assignedTo?: string | null;
  attributedCost?: number | null;
  attributedRevenue?: number | null;
  campaignId?: string | null;
  campaignName?: string | null;
  leadId: string;
  leadName?: string | null;
  metadata?: Record<string, unknown> | null;
  periodEnd?: string | null;
  periodStart?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  source?: string | null;
  stageKey?: string | null;
  stageLabel?: string | null;
};

function explicitText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function validMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function buildOpportunityAttribution(
  input: OpportunityAttributionInput,
): OpportunityAttributionSnapshot {
  const metadata = recordValue(input.metadata) ?? {};
  const meta = recordValue(metadata.meta) ?? {};

  const campaignId = explicitText(
    input.campaignId,
    meta.campaignId,
    meta.campaign_id,
    metadata.campaignId,
    metadata.campaign_id,
  );
  const campaignName = explicitText(
    input.campaignName,
    meta.campaignName,
    meta.campaign_name,
    metadata.campaignName,
    metadata.campaign_name,
  );
  const source = explicitText(
    input.source,
    meta.source,
    meta.origin,
    metadata.source,
    metadata.origin,
  );
  const projectId = explicitText(
    input.projectId,
    metadata.project_id,
    metadata.development_id,
  );
  const projectName = explicitText(
    input.projectName,
    metadata.project_name,
    metadata.development_name,
  );
  const projectDeveloperId = explicitText(
    metadata.project_developer_id,
    metadata.project_incorporadora_id,
    metadata.developer_id,
    metadata.incorporadora_id,
  );
  const campaignDeveloperId = explicitText(
    meta.developerId,
    meta.developer_id,
    meta.incorporadoraId,
    meta.incorporadora_id,
    metadata.campaign_developer_id,
    metadata.campaign_incorporadora_id,
  );
  const developerName = explicitText(
    metadata.developer_name,
    metadata.incorporadora_name,
    metadata.incorporadora,
    meta.developerName,
    meta.incorporadoraName,
  );
  const developerId = projectDeveloperId ?? campaignDeveloperId;
  const developerConflict = Boolean(
    projectDeveloperId &&
      campaignDeveloperId &&
      projectDeveloperId !== campaignDeveloperId,
  );

  const steps: OpportunityAttributionStep[] = [
    {
      key: "campaign",
      label: "Campanha",
      state: campaignName || campaignId ? "linked" : "missing",
      value: campaignName ?? campaignId ?? "Não vinculada",
    },
    {
      key: "lead",
      label: "Lead",
      state: input.leadId ? "linked" : "missing",
      value:
        explicitText(input.leadName) ??
        (input.leadId ? `Lead ${shortId(input.leadId)}` : "Não identificado"),
    },
    {
      key: "broker",
      label: "Corretor",
      state: explicitText(input.assignedName, input.assignedTo)
        ? "linked"
        : "missing",
      value:
        explicitText(input.assignedName, input.assignedTo) ?? "Não distribuído",
    },
    {
      key: "stage",
      label: "Etapa",
      state: explicitText(input.stageLabel, input.stageKey)
        ? "linked"
        : "missing",
      value: explicitText(input.stageLabel, input.stageKey) ?? "Não registrada",
    },
  ];

  const contexts: OpportunityAttributionContext[] = [
    {
      key: "source",
      label: "Origem",
      state: source ? "linked" : "missing",
      value: source ?? "Não informada",
    },
    {
      key: "project",
      label: "Projeto",
      state: projectName || projectId ? "linked" : "missing",
      value: projectName ?? projectId ?? "Não vinculado",
    },
    {
      key: "developer",
      label: "Incorporadora",
      state: developerConflict
        ? "conflict"
        : developerName || developerId
          ? "linked"
          : "missing",
      value: developerConflict
        ? "Vínculos divergentes"
        : developerName ?? developerId ?? "Não vinculada",
    },
  ];

  const missing = [
    ...steps
      .filter((step) => step.state === "missing")
      .map((step) => step.label),
    ...contexts
      .filter((context) => context.state === "missing")
      .map((context) => context.label),
  ];
  const status = developerConflict
    ? "conflict"
    : missing.length === 0
      ? "complete"
      : "partial";

  const periodStart = validDate(input.periodStart);
  const periodEnd = validDate(input.periodEnd);
  const attributedCost = validMoney(input.attributedCost);
  const attributedRevenue = validMoney(input.attributedRevenue);
  const validPeriod = Boolean(
    periodStart && periodEnd && Date.parse(periodStart) <= Date.parse(periodEnd),
  );
  const financials =
    status === "complete" &&
    validPeriod &&
    attributedCost !== null &&
    attributedRevenue !== null
      ? {
          attributedCost,
          attributedRevenue,
          periodEnd: periodEnd as string,
          periodStart: periodStart as string,
        }
      : null;

  return {
    contexts,
    financials,
    missing,
    status,
    statusLabel:
      status === "complete"
        ? "Rastro completo"
        : status === "conflict"
          ? "Revisar vínculo"
          : "Rastro parcial",
    steps,
  };
}

export const OPPORTUNITY_ATTRIBUTION_CONTRACT = {
  aggregation: "none-per-opportunity",
  financialVisibility: "valid-period-and-complete-attribution-only",
  path: ["campaign", "lead", "broker", "stage"],
  registeredFactsOnly: true,
  rejectsDeveloperConflict: true,
} as const;
