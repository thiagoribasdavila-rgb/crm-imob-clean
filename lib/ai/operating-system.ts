export type AtlasAIOSMode = "operational" | "prepared_offline" | "local_only";

export type AtlasAIOSAgent = {
  id: "lead" | "sales" | "manager" | "executive" | "marketing";
  name: string;
  mission: string;
  capabilities: string[];
  requiresGenerativeProvider: boolean;
  requiresMarketingConnection?: boolean;
};

export const ATLAS_AI_OS_AGENTS: AtlasAIOSAgent[] = [
  { id: "lead", name: "Atlas Lead Agent", mission: "Qualificar e priorizar", capabilities: ["score", "intenção", "próxima ação"], requiresGenerativeProvider: true },
  { id: "sales", name: "Atlas Sales Agent", mission: "Apoiar a venda", capabilities: ["abordagem", "objeções", "preparação"], requiresGenerativeProvider: true },
  { id: "manager", name: "Atlas Manager Agent", mission: "Remover gargalos", capabilities: ["equipe", "SLA", "carteira"], requiresGenerativeProvider: false },
  { id: "executive", name: "Atlas Executive Agent", mission: "Orientar decisões", capabilities: ["previsão", "risco", "oportunidades"], requiresGenerativeProvider: false },
  { id: "marketing", name: "Atlas Marketing Agent", mission: "Otimizar aquisição", capabilities: ["campanhas", "públicos", "ROI"], requiresGenerativeProvider: true, requiresMarketingConnection: true },
];

export function resolveAtlasAIOS(input: {
  generativeConfigured: boolean;
  generativeOperational: boolean;
  researchOperational: boolean;
  marketingConnected: boolean;
  memoryRecords: number;
  knowledgeDocuments: number;
  learningEvents: number;
}) {
  const mode: AtlasAIOSMode = input.generativeOperational
    ? "operational"
    : input.generativeConfigured
      ? "prepared_offline"
      : "local_only";

  return {
    name: "Atlas AI Operating System",
    mode,
    brain: {
      status: "active" as const,
      description: "Orquestração, memória, governança e aprendizado pertencem ao Atlas.",
    },
    engine: {
      status: input.generativeOperational ? "online" as const : input.generativeConfigured ? "awaiting_capacity" as const : "not_configured" as const,
      automaticRecovery: true,
      localContinuity: true,
    },
    memory: {
      status: "active" as const,
      records: input.memoryRecords,
      rawConversationStored: false,
      exclusiveLeadOwnership: true,
    },
    knowledge: {
      status: input.knowledgeDocuments > 0 ? "grounded" as const : "prepared" as const,
      documents: input.knowledgeDocuments,
      researchOperational: input.researchOperational,
    },
    learningLoop: {
      mode: "supervised" as const,
      events: input.learningEvents,
      comparesSuggestionDecisionOutcome: true,
    },
    agents: ATLAS_AI_OS_AGENTS.map((agent) => ({
      ...agent,
      status: agent.requiresMarketingConnection && !input.marketingConnected
        ? "prepared" as const
        : agent.requiresGenerativeProvider && !input.generativeOperational
          ? "prepared" as const
          : agent.requiresGenerativeProvider
            ? "supervised" as const
            : "deterministic" as const,
      externalActions: false,
      humanApprovalRequired: true,
    })),
    governance: {
      humanApprovalRequired: true,
      autonomousExternalActions: false,
      secretsExposedToClient: false,
      tenantIsolation: true,
      costTelemetry: true,
    },
  };
}
