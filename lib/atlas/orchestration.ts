export type AtlasPriority = "low" | "medium" | "high" | "critical";
export type AtlasDecisionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface AtlasSignal {
  source: "v1" | "v2" | "v3" | "external";
  type: string;
  entityType?: string;
  entityId?: string;
  value?: number | string | boolean;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface AtlasDecisionProposal {
  sourceType: string;
  sourceId?: string;
  decisionType: string;
  priority: AtlasPriority;
  title: string;
  rationale: string;
  recommendedAction: Record<string, unknown>;
  evidence: AtlasSignal[];
  confidence: number;
  requiresApproval: boolean;
}

export interface AtlasOperatingSnapshot {
  v1: {
    leads: number;
    customers: number;
    properties: number;
    opportunities: number;
    pendingTasks: number;
  };
  v2: {
    campaigns: number;
    openConversations: number;
    pendingApprovals: number;
    queuedEvents: number;
    failedEvents: number;
  };
  v3: {
    proposedDecisions: number;
    activeAgents: number;
    digitalTwins: number;
    insights: number;
  };
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

export function requiresHumanApproval(priority: AtlasPriority, actionType: string): boolean {
  const alwaysGoverned = new Set([
    "message.bulk_send",
    "campaign.publish",
    "contract.execute",
    "financial.transaction",
    "lead.delete",
    "autonomous.external_action",
  ]);
  return priority === "critical" || priority === "high" || alwaysGoverned.has(actionType);
}

export function operatingMaturity(snapshot: AtlasOperatingSnapshot): number {
  const foundations = [
    snapshot.v1.leads,
    snapshot.v1.properties,
    snapshot.v1.opportunities,
    snapshot.v2.campaigns,
    snapshot.v2.openConversations,
    snapshot.v3.insights,
  ].filter((value) => value > 0).length;

  const reliabilityPenalty = Math.min(30, snapshot.v2.failedEvents * 3);
  const governanceBonus = Math.min(15, snapshot.v2.pendingApprovals > 0 ? 10 : 5);
  const intelligenceBonus = Math.min(20, snapshot.v3.digitalTwins + snapshot.v3.proposedDecisions);

  return Math.max(0, Math.min(100, foundations * 10 + governanceBonus + intelligenceBonus - reliabilityPenalty));
}
