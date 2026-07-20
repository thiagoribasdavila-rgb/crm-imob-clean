import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { buildRealEstateContext } from "@/lib/ai/real-estate-context";
import { aiProviderReadiness } from "@/lib/ai/provider-router";
import { canonicalLeadStatus } from "@/lib/compat/legacy-v2";
import { computeAttentionSignals } from "@/lib/atlas/attention-signals";

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

type ProductLearning = {
  propertyId: string;
  title: string;
  presentations: number;
  interested: number;
  rejected: number;
  interestRate: number;
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
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: learningActivities } = await access.supabase
    .from("activities")
    .select("lead_id,type,metadata,occurred_at")
    .in("type", ["property_presentation", "property_feedback"])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(2_000);
  const learning = new Map<string, Omit<ProductLearning, "title" | "interestRate">>();
  const latestFeedback = new Set<string>();
  for (const activity of learningActivities ?? []) {
    const metadata = activity.metadata && typeof activity.metadata === "object" ? activity.metadata as Record<string, unknown> : {};
    const propertyIds = activity.type === "property_presentation" && Array.isArray(metadata.propertyIds)
      ? metadata.propertyIds.filter((value): value is string => typeof value === "string")
      : activity.type === "property_feedback" && typeof metadata.propertyId === "string" ? [metadata.propertyId] : [];
    for (const propertyId of propertyIds) {
      const feedbackKey = `${activity.lead_id}:${propertyId}`;
      if (activity.type === "property_feedback" && latestFeedback.has(feedbackKey)) continue;
      if (activity.type === "property_feedback") latestFeedback.add(feedbackKey);
      const current = learning.get(propertyId) ?? { propertyId, presentations: 0, interested: 0, rejected: 0 };
      if (activity.type === "property_presentation") current.presentations += 1;
      if (activity.type === "property_feedback" && metadata.signal === "interested") current.interested += 1;
      if (activity.type === "property_feedback" && metadata.signal === "rejected") current.rejected += 1;
      learning.set(propertyId, current);
    }
  }
  const propertyIds = [...learning.keys()];
  const { data: learningProperties } = propertyIds.length
    ? await access.supabase.from("properties").select("id,title").in("id", propertyIds)
    : { data: [] as Array<{ id: string; title: string | null }> };
  const titles = new Map((learningProperties ?? []).map((property) => [property.id, property.title || "Imóvel sem título"]));
  const allProductLearning: ProductLearning[] = [...learning.values()].filter((item) => titles.has(item.propertyId)).map((item) => {
    const responses = item.interested + item.rejected;
    return { ...item, title: titles.get(item.propertyId)!, interestRate: responses ? Math.round(item.interested / responses * 100) : 0 };
  }).sort((a, b) => (b.interested + b.rejected) - (a.interested + a.rejected) || b.presentations - a.presentations);
  const learningSummary = allProductLearning.reduce((total, item) => ({ presentations: total.presentations + item.presentations, interested: total.interested + item.interested, rejected: total.rejected + item.rejected }), { presentations: 0, interested: 0, rejected: 0 });
  const productLearning = allProductLearning.slice(0, 8);
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
  const responses = learningSummary.interested + learningSummary.rejected;
  if (responses >= 3 && learningSummary.rejected / responses >= 0.5) signals.push({ id: "product-rejection", severity: "attention", area: "inventory", title: "Rejeição elevada nas apresentações", evidence: `${learningSummary.rejected} de ${responses} retornos recentes indicaram baixa aderência.`, action: "Revisar produto, faixa de preço e perfil dos leads antes de novas apresentações.", href: "/properties/mtching", impact: 75 + learningSummary.rejected });

  // Sinais de atenção proativos (Fase 100) — o briefing agrega duas dimensões
  // que os sinais acima não cobrem: leads parados no funil e objeções sem
  // resposta. Reaproveita o mesmo módulo determinístico do dashboard/Lead 360.
  // A base viva é dominada por leads arquivados (16k+ de 17k) — sem excluir
  // "arquivado" no servidor, o limit(1000) devolveria uma amostra arbitrária
  // quase toda de arquivados e os sinais sairiam subcontados. A exclusão dos
  // demais estados terminais (ganho/perdido) continua no módulo de sinais.
  const { data: leadRows } = await access.supabase
    .from("leads")
    .select("id,status,score_ia,temperature,classificacao_ia,created_at")
    .eq("organization_id", identity.organizationId)
    .neq("status", "arquivado")
    .neq("status", "ARQUIVADO")
    .order("created_at", { ascending: false })
    .limit(1000);
  const attention = await computeAttentionSignals(
    access.supabase,
    identity.organizationId,
    (leadRows ?? []).map((lead) => ({
      id: String(lead.id),
      status: canonicalLeadStatus(lead.status) || "novo",
      score: Number(lead.score_ia || 0),
      temperature: typeof lead.temperature === "string" ? lead.temperature : typeof lead.classificacao_ia === "string" ? lead.classificacao_ia : null,
      createdAt: typeof lead.created_at === "string" ? lead.created_at : null,
    })),
  );
  const staleLeadIds = new Set(attention.filter((signal) => signal.kind === "stale_stage").map((signal) => signal.leadId));
  const objectionSignals = attention.filter((signal) => signal.kind === "objection_open");
  const objectionLeadIds = new Set(objectionSignals.map((signal) => signal.leadId));
  if (staleLeadIds.size > 0) {
    const critical = attention.some((signal) => signal.kind === "stale_stage" && signal.severity === "critical");
    signals.push({ id: "stale-stage", severity: critical ? "critical" : "attention", area: "commercial", title: "Leads parados no funil", evidence: `${staleLeadIds.size} ${staleLeadIds.size === 1 ? "lead está parado" : "leads estão parados"} na mesma etapa além do tempo recomendado.`, action: "Retomar o contato ou registrar a próxima ação para destravar cada oportunidade.", href: "/pipeline", impact: 88 + staleLeadIds.size });
  }
  if (objectionLeadIds.size > 0) {
    const critical = objectionSignals.some((signal) => signal.severity === "critical");
    signals.push({ id: "open-objections", severity: critical ? "critical" : "attention", area: "commercial", title: "Objeções sem resposta", evidence: `${objectionLeadIds.size} ${objectionLeadIds.size === 1 ? "lead tem objeção" : "leads têm objeções"} de venda em aberto, ainda sem resposta registrada.`, action: "Responder a objeção com apoio do Copilot antes que a lead esfrie.", href: "/leads", impact: 92 + objectionLeadIds.size });
  }

  if (!signals.length) signals.push({ id: "data-start", severity: "healthy", area: "data", title: "Operação sem alertas críticos", evidence: "Não foram encontrados gargalos suficientes no snapshot atual.", action: "Mantenha dados, cadência e materiais atualizados para ampliar a precisão.", href: "/dashboard", impact: 10 });

  const order = { critical: 4, attention: 3, opportunity: 2, healthy: 1 };
  signals.sort((a, b) => order[b.severity] - order[a.severity] || b.impact - a.impact);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    status: signals.some((signal) => signal.severity === "critical") ? "critical" : signals.some((signal) => signal.severity === "attention") ? "attention" : "healthy",
    context,
    productLearning: { periodDays: 90, summary: learningSummary, items: productLearning },
    signals,
    model: {
      generativeReady: aiProviderReadiness().openai,
      localIntelligenceReady: true,
      calibrationVerifiedAt: "2026-07-17",
    },
  });
}
