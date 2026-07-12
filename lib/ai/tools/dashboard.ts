import type { AtlasTool } from "../registry";

export const getDashboardMetricsTool: AtlasTool = {
  name: "get_dashboard_metrics",
  description: "Retorna métricas resumidas da operação comercial do Atlas.",
  async execute(context) {
    return {
      source: "dashboard",
      data: {
        organizationId: context.organizationId,
        metrics: {
          totalLeads: 0,
          hotLeads: 0,
          pendingActions: 0,
          pipelineValue: 0,
        },
        note: "Ferramenta inicial criada. Consulta real ao CRM será conectada na próxima etapa.",
      },
    };
  },
};
