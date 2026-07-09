export interface ExecutiveMetric {
  name: string;
  value: number | string;
  status: "positive" | "warning" | "critical";
  insight: string;
}

export interface ExecutiveDecision {
  priority: "high" | "medium" | "low";
  action: string;
  reason: string;
  impact: string;
}

export class ExecutiveCommandCenter {

  private metrics: ExecutiveMetric[] = [];

  private decisions: ExecutiveDecision[] = [];


  constructor() {
    this.initialize();
  }


  private initialize() {

    this.metrics = [
      {
        name: "Conversão Comercial",
        value: "0%",
        status: "warning",
        insight:
          "Monitorar evolução do funil comercial"
      },
      {
        name: "VGV Pipeline",
        value: "R$ 0",
        status: "warning",
        insight:
          "Aguardando integração dos dados"
      },
      {
        name: "Performance Marketing",
        value: "0 leads",
        status: "warning",
        insight:
          "Conectar campanhas Meta Ads"
      }
    ];


    this.decisions = [
      {
        priority: "high",
        action:
          "Priorizar leads com maior probabilidade de fechamento",
        reason:
          "Aumentar eficiência comercial",
        impact:
          "Maior conversão e redução de perda"
      }
    ];

  }


  getExecutiveOverview() {

    return {
      timestamp: new Date(),
      metrics: this.metrics,
      decisions: this.decisions,
      status: "operational"
    };

  }


  addMetric(metric: ExecutiveMetric) {

    this.metrics.push(metric);

  }


  createDecision(
    decision: ExecutiveDecision
  ) {

    this.decisions.push(decision);

  }


  getCriticalAlerts() {

    return this.metrics.filter(
      metric =>
        metric.status === "critical"
    );

  }

}
