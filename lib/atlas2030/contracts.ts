export type AtlasEntityType =
  | "buyer"
  | "customer"
  | "broker"
  | "developer"
  | "development"
  | "property"
  | "inventory_unit"
  | "campaign"
  | "region"
  | "investor"
  | "organization";

export type AtlasEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  organizationId: string;
  eventType: string;
  source: string;
  aggregateType?: string;
  aggregateId?: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  schemaVersion: string;
  payload: TPayload;
};

export type GraphEntity = {
  entityType: AtlasEntityType;
  externalKey?: string;
  canonicalName?: string;
  attributes: Record<string, unknown>;
  confidence: number;
  source: string;
};

export type GraphRelationship = {
  fromEntityId: string;
  relationshipType: string;
  toEntityId: string;
  attributes?: Record<string, unknown>;
  weight?: number;
  confidence?: number;
};

export type MemoryRecord = {
  scopeType: "organization" | "user" | "lead" | "customer" | "property" | "development" | "campaign" | "agent" | "market";
  scopeId?: string;
  memoryType: string;
  content: Record<string, unknown>;
  importance: number;
  confidence: number;
  expiresAt?: string;
};

export type SimulationRequest = {
  type: "budget" | "pricing" | "inventory" | "launch" | "campaign" | "construction_delay" | "commission";
  name: string;
  baseline: Record<string, number | string | boolean>;
  assumptions: Record<string, number | string | boolean>;
  scenarios: Array<Record<string, number | string | boolean>>;
};

export type Recommendation = {
  type: string;
  subjectType: string;
  subjectId?: string;
  title: string;
  rationale: string;
  recommendation: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  expectedImpact: Record<string, number | string | boolean>;
  confidence: number;
  expiresAt?: string;
};

export type AgentPolicy = {
  agentKey: string;
  allowedTools: string[];
  deniedActions: string[];
  maxRisk: "low" | "medium" | "high";
  humanApprovalRequiredFor: string[];
  maxRuntimeSeconds: number;
  maxAttempts: number;
};

export const HIGH_RISK_ACTIONS = [
  "publish_campaign",
  "bulk_message",
  "change_price",
  "reserve_inventory",
  "sign_contract",
  "release_payment",
  "change_commission",
  "delete_customer_data",
] as const;
