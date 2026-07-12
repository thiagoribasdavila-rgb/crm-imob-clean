import type { AtlasTool } from "../registry";

export const getLead360Tool: AtlasTool = {
  name: "get_lead_360",
  description: "Retorna a visão completa de um lead comercial do Atlas.",
  async execute(context, input) {
    return {
      source: "crm_lead_360",
      data: {
        organizationId: context.organizationId,
        leadId: input ?? null,
        lead: null,
        timeline: [],
        activities: [],
        pipeline: null,
        note: "Fundação criada. Consulta completa do CRM será conectada na próxima etapa.",
      },
    };
  },
};
