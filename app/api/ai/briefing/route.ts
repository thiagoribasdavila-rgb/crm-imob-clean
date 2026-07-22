import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildRealEstateContext } from "@/lib/ai/real-estate-context";
import { aiProviderReadiness } from "@/lib/ai/provider-router";
import { canonicalLeadStatus } from "@/lib/compat/legacy-v2";
import { computeAttentionSignals } from "@/lib/atlas/attention-signals";

export const dynamic = "force-dynamic";

// Cache curto (60s) por organização para o cálculo de sinais de atenção —
// mesmo padrão globalThis dos buckets de rate-limit (lib/api/security.ts).
// Por instância; TTL curto o bastante para um briefing "da manhã" e longo o
// bastante para absorver dashboard + /reports carregando em sequência.
type AttentionCacheEntry = { at: number; value: Awaited<ReturnType<typeof computeAttentionSignals>> };
const attentionCacheGlobal = globalThis as typeof globalThis & {
  __atlasBriefingAttentionCache?: Map<string, AttentionCacheEntry>;
};
const attentionCache = attentionCacheGlobal.__atlasBriefingAttentionCache ?? new Map<string, AttentionCacheEntry>();
attentionCacheGlobal.__atlasBriefingAttentionCache = attentionCache;
const ATTENTION_CACHE_TTL_MS = 60_000;

async function cachedOrganizationAttention(
  organizationId: string,
  compute: () => Promise<AttentionCacheEntry["value"]>,
): Promise<AttentionCacheEntry["value"]> {
  const cached = attentionCache.get(organizationId);
  const now = Date.now();
  if (cached && now - cached.at < ATTENTION_CACHE_TTL_MS) return cached.value;
  const value = await compute();
  attentionCache.set(organizationId, { at: now, value });
  if (attentionCache.size > 500) {
    for (const [key, entry] of attentionCache) {
      if (now - entry.at >= ATTENTION_CACHE_TTL_MS) attentionCache.delete(key);
    }
  }
  return value;
}

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

/**
 * Aprendizado por imóvel: a tabela `activities` viva tem só
 * (id, lead_id, type, description, created_at). Sem `metadata` e sem
 * `occurred_at` não existe como saber QUAL imóvel foi apresentado nem qual foi
 * o retorno — a agregação antiga consultava colunas inexistentes, o erro era
 * descartado com o `data` e o resultado saía como um objeto permanentemente
 * vazio, que a tela lia como "ainda sem feedback suficiente". Amostra fina e
 * ausência de coleta são coisas diferentes, e só uma delas se resolve
 * atendendo mais gente.
 */
const PRODUCT_LEARNING_REASON =
  "apresentação de imóvel não é registrada com metadados nesta base (activities não tem metadata nem occurred_at)";

/**
 * O contexto imobiliário pode declarar quais fontes não existem no banco vivo.
 * A leitura é tolerante de propósito: o contrato de `buildRealEstateContext`
 * evolui em outra frente, e o briefing não pode quebrar por causa disso — sem a
 * declaração ele segue como hoje; com ela, cada fonte ausente vira um sinal.
 */
function coverageGaps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const source = typeof row.source === "string" ? row.source.trim() : "";
        const reason = typeof row.reason === "string" ? row.reason.trim() : "";
        if (source && reason) return `${source} (${reason})`;
        return source || reason;
      }
      return "";
    })
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  // Rota de IA paga: limite próprio para impedir consumo de orçamento de LLM em loop.
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "ai-briefing" });
  if (!rate.ok) return rate.response;
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

  // Cegueira declarada — mas FORA de `signals`. Um painel que diz "sem alertas"
  // porque a fonte não existe desliga a operação; então a cegueira continua
  // publicada, só que em bloco próprio. O motivo: alerta permanente que ninguém
  // da operação comercial pode resolver treina o gestor a ignorar a lista
  // inteira, empurra sinal acionável para baixo na fila e — pior — inflava o
  // medidor "sinais sob controle" da Sala de Comando, que conta não-críticos:
  // uma declaração de cegueira estava fazendo o painel de saúde parecer melhor.
  const contextCoverage = (context as typeof context & { coverage?: { unavailable?: unknown } }).coverage;
  const missingSources = coverageGaps(contextCoverage?.unavailable);
  const blindSpots = [
    {
      id: "product-learning-uninstrumented",
      title: "Aprendizado por imóvel não instrumentado",
      reason: PRODUCT_LEARNING_REASON,
      toInstrument: "Registrar apresentação e retorno do imóvel com o identificador do produto.",
      href: "/developments",
    },
    ...(missingSources.length > 0
      ? [{
        id: "context-coverage",
        title: "Dimensões do contexto sem fonte no banco",
        reason: `${missingSources.length === 1 ? "uma fonte não está disponível" : `${missingSources.length} fontes não estão disponíveis`} nesta base: ${missingSources.join("; ")}`,
        toInstrument: "Tratar como não medido, não como zero: decidir sobre estas dimensões exige instrumentar a origem primeiro.",
        href: "/dashboard",
      }]
      : []),
  ];

  // Sinais de atenção proativos (Fase 100) — o briefing agrega duas dimensões
  // que os sinais acima não cobrem: leads parados no funil e objeções sem
  // resposta. Reaproveita o mesmo módulo determinístico do dashboard/Lead 360.
  // A base viva é dominada por leads arquivados (16k+ de 17k) — sem excluir
  // "arquivado" no servidor, o limit(1000) devolveria uma amostra arbitrária
  // quase toda de arquivados e os sinais sairiam subcontados. A exclusão dos
  // demais estados terminais (ganho/perdido) continua no módulo de sinais.
  // Cache de 60s por organização (padrão globalThis do rate-limit): o briefing
  // é chamado pelo dashboard E pelo /reports, e o cálculo org-wide dispara
  // até ~20 sub-queries — recalcular a cada carregamento dobrava o custo sem
  // ganho (sinais de "parado há dias" não mudam em segundos).
  const attention = await cachedOrganizationAttention(identity.organizationId, async () => {
    const { data: leadRows } = await access.supabase
      .from("leads")
      .select("id,status,score_ia,temperature,classificacao_ia,created_at")
      .eq("organization_id", identity.organizationId)
      .neq("status", "arquivado")
      .neq("status", "ARQUIVADO")
      .order("created_at", { ascending: false })
      .limit(1000);
    return computeAttentionSignals(
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
  });
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
    /**
     * O que este briefing NÃO enxerga. É rodapé de cobertura, não fila de
     * trabalho: a tela mostra como nota, e `status` volta a poder ser
     * "healthy" quando os sinais reais estiverem limpos.
     */
    coverage: { blindSpots, productLearningInstrumented: false },
    // `instrumented: false` é o campo que carrega a verdade. summary/items
    // continuam presentes e zerados só para não quebrar quem já lê a forma
    // antiga — quem entende `instrumented` deve mostrar o motivo, não o zero.
    productLearning: {
      instrumented: false,
      reason: PRODUCT_LEARNING_REASON,
      periodDays: 90,
      summary: { presentations: 0, interested: 0, rejected: 0 },
      items: [],
    },
    signals,
    model: {
      generativeReady: aiProviderReadiness().openai,
      localIntelligenceReady: true,
      calibrationVerifiedAt: "2026-07-17",
    },
  });
}
