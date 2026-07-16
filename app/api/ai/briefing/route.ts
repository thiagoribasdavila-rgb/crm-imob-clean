import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { buildRealEstateContext } from "@/lib/ai/real-estate-context";

export const dynamic = "force-dynamic";

type Signal = {
  id: string;
  severity: "critical" | "attention" | "opportunity" | "healthy";
  area: "commercial" | "inventory" | "materials" | "forecast" | "data";
  title: string;
  evidence: string;
  action: string;
  href: string;
  impact: number;
};

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const identity = {
    userId: access.access.profile.id,
    organizationId: access.access.organization.id,
    supabase: access.supabase,
  };
  const context = await buildRealEstateContext(identity);
  const signals: Signal[] = [];
  const commercial = context.commercial;
  const portfolio = context.portfolio;
  const materials = context.materials;

  if (commercial.overdueNextActions > 0) signals.push({ id: "overdue-actions", severity: "critical", area: "commercial", title: "Follow-ups fora do SLA", evidence: `${commercial.overdueNextActions} ações estão atrasadas no escopo atual.`, action: "Executar os contatos vencidos começando pelos leads quentes.", href: "/leads/ai-qualify", impact: 100 + commercial.overdueNextActions });
  if (commercial.withoutNextAction > 0) signals.push({ id: "missing-actions", severity: "attention", area: "data", title: "Carteira sem próxima ação", evidence: `${commercial.withoutNextAction} leads não possuem cadência futura registrada.`, action: "Definir data e canal do próximo contato para cada carteira.", href: "/leads", impact: 80 + commercial.withoutNextAction });
  if (commercial.hotLeads > 0) signals.push({ id: "hot-leads", severity: "opportunity", area: "commercial", title: "Potencial imediato de conversão", evidence: `${commercial.hotLeads} leads estão classificados como quentes.`, action: "Validar intenção, capacidade financeira e disponibilidade de produto hoje.", href: "/leads/ai-qualify", impact: 70 + commercial.hotLeads });
  if (materials.expired > 0) signals.push({ id: "expired-materials", severity: "critical", area: "materials", title: "Material comercial vencido", evidence: `${materials.expired} arquivos vigentes estão fora da validade.`, action: "Substituir tabela, espelho ou book antes do próximo compartilhamento.", href: "/developments/materials", impact: 95 + materials.expired });
  if (portfolio.inventory > 0 && portfolio.absorptionPercent < 20) signals.push({ id: "low-absorption", severity: "attention", area: "inventory", title: "Absorção abaixo de 20%", evidence: `O portfólio visível registra ${portfolio.absorptionPercent}% de absorção.`, action: "Revisar distribuição de leads, aderência de produto e posicionamento comercial.", href: "/developments", impact: 85 - portfolio.absorptionPercent });
  if (commercial.pipelineValue > 0) signals.push({ id: "forecast-gap", severity: commercial.weightedForecast < commercial.pipelineValue * 0.35 ? "attention" : "healthy", area: "forecast", title: "Qualidade do pipeline", evidence: `Forecast ponderado de ${Math.round(commercial.pipelineValue ? commercial.weightedForecast / commercial.pipelineValue * 100 : 0)}% sobre o pipeline bruto.`, action: "Revisar probabilidade, etapa e data prevista das oportunidades abertas.", href: "/pipeline", impact: 60 });
  if (!signals.length) signals.push({ id: "data-start", severity: "healthy", area: "data", title: "Operação sem alertas críticos", evidence: "Não foram encontrados gargalos suficientes no snapshot atual.", action: "Mantenha dados, cadência e materiais atualizados para ampliar a precisão.", href: "/dashboard", impact: 10 });

  const order = { critical: 4, attention: 3, opportunity: 2, healthy: 1 };
  signals.sort((a, b) => order[b.severity] - order[a.severity] || b.impact - a.impact);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    status: signals.some((signal) => signal.severity === "critical") ? "critical" : signals.some((signal) => signal.severity === "attention") ? "attention" : "healthy",
    context,
    signals,
    model: {
      generativeReady: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
      localIntelligenceReady: true,
      calibrationVerifiedAt: "2026-07-16",
    },
  });
}
