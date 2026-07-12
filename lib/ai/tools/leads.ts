import type { AtlasTool } from "../registry";

export const searchLeadsTool: AtlasTool = {
  name: "search_leads",
  description: "Busca leads comerciais da organização autenticada do Atlas.",
  async execute(context, input) {
    return {
      source: "crm_leads",
      data: {
        organizationId: context.organizationId,
        query: input ?? null,
        leads: [],
        note: "Ferramenta criada. Consulta CRM real será conectada na próxima etapa.",
      },
    };
  },
};
