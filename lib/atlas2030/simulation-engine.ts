import type { SimulationRequest } from "@/lib/atlas2030/contracts";

export type SimulationOutcome = {
  scenario: Record<string, number | string | boolean>;
  metrics: Record<string, number>;
  score: number;
  warnings: string[];
};

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function runSimulation(request: SimulationRequest): SimulationOutcome[] {
  return request.scenarios.map((scenario) => {
    const baseline = { ...request.baseline, ...request.assumptions };
    const leads = number(scenario.leads, number(baseline.leads));
    const cpl = Math.max(0.01, number(scenario.cpl, number(baseline.cpl, 50)));
    const conversion = Math.max(0, number(scenario.conversion, number(baseline.conversion, 1)));
    const ticket = number(scenario.ticket, number(baseline.ticket));
    const priceChange = number(scenario.priceChange, 0);
    const delayMonths = Math.max(0, number(scenario.delayMonths, 0));
    const availableUnits = Math.max(0, number(scenario.availableUnits, number(baseline.availableUnits, 999999)));

    const investment = leads * cpl;
    const expectedSales = Math.min(availableUnits, Math.max(0, leads * (conversion / 100)));
    const adjustedTicket = ticket * (1 + priceChange / 100);
    const vgv = expectedSales * adjustedTicket;
    const delayCost = delayMonths * number(baseline.monthlyDelayCost, 0);
    const grossReturn = vgv - investment - delayCost;
    const roi = investment > 0 ? (grossReturn / investment) * 100 : 0;

    const warnings: string[] = [];
    if (cpl > number(baseline.targetCpl, 50) * 1.3) warnings.push("CPL acima da tolerância definida.");
    if (conversion < number(baseline.minimumConversion, 0.7)) warnings.push("Conversão abaixo do mínimo operacional.");
    if (delayMonths > 0) warnings.push("Atraso de obra reduz retorno e aumenta risco reputacional.");
    if (expectedSales >= availableUnits) warnings.push("Demanda estimada alcança o limite do estoque disponível.");

    const score = Math.max(0, Math.min(100, 55 + Math.min(25, roi / 10) + Math.min(20, conversion * 5) - warnings.length * 8));

    return {
      scenario,
      metrics: {
        leads,
        investment,
        expectedSales,
        adjustedTicket,
        vgv,
        delayCost,
        grossReturn,
        roi,
      },
      score: Math.round(score * 100) / 100,
      warnings,
    };
  });
}
