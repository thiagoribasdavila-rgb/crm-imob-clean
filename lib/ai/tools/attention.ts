import type { AtlasTool } from "../registry";

export const listAttentionLeadsTool: AtlasTool = {
  name: "list_attention_leads",
  description: "Lista leads que precisam de atenção comercial prioritária.",
  async execute(context) {
    return {
      source: "crm_attention",
      data: {
        organizationId: context.organizationId,
        leads: [],
        criteria: [
          "lead quente sem contato recente",
          "pipeline parado",
          "score elevado",
        ],
        note: "Motor de prioridade criado. Regras reais serão conectadas ao CRM na próxima etapa.",
      },
    };
  },
};
