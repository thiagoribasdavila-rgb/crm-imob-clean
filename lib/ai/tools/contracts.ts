export type AtlasAIToolContract = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const atlasToolContracts: AtlasAIToolContract[] = [
  {
    name: "get_dashboard_metrics",
    description: "Obtém métricas comerciais atuais da organização.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "search_leads",
    description: "Busca leads comerciais usando filtros permitidos.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        temperature: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_lead_360",
    description: "Busca a visão completa de um lead.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
      },
      required: ["leadId"],
    },
  },
];
