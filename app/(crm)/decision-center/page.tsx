"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { PageHeader } from "@/components/atlas/page-header";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Insight = { id: string; title: string; summary: string | null; recommendation: string | null; score: number | null; status: string; entity_type: string; created_at: string };
type Lead = { id: string; name: string | null; score: number | null; temperature: string | null; status: string | null; next_action_at: string | null };

type Decision = { id: string; priority: number; title: string; reason: string; action: string; type: string };
type BriefingResponse = {
  signals?: Array<{ id: string; severity: "critical" | "attention" | "opportunity" | "healthy"; title: string; evidence: string; action: string }>;
};

type CapacityScenario = {
  id: string;
  label: string;
  hasBasis: boolean;
  projection: {
    weeklyLeadsDelta: { pessimista: number; esperado: number; otimista: number };
    confidence: string;
    assumptions: string[];
    basis?: { measured: boolean; sample: number; minimumSample: number; reason?: string };
  };
};

type CapacityBlock = {
  windowDays: number;
  openLeads: number;
  unassignedOpenLeads: number;
  activeBrokers: number;
  minimumSample: number;
  unavailableReason: string | null;
  observed: {
    moves: number;
    /** Movimentações com autor corretor — a amostra real por trás do número. */
    attributedMoves: number;
    actors: number;
    weeks: number;
    leadsPerBrokerPerWeek: number | null;
    advanceRatePct: number | null;
    terminalMoveSharePct: number | null;
    wins: number;
    sourceCoverage?: string | null;
  };
  scenarios: CapacityScenario[];
};

/** "denied" = a simulação de capacidade é da diretoria; para os demais a seção some. */
type CapacityStatus = "loading" | "ok" | "denied" | "error";

/*
 * CC-6 · Centro de decisão — consolidação do redesign: o header antigo repetia
 * na descrição o que a fila já mostra ("justificativa, confiança e ação"), e o
 * card de métrica "Decisões" duplicava o tamanho da lista visível logo abaixo.
 * Agora a fila é o único palco: contexto vira uma linha de métricas dentro do
 * mesmo painel, a severidade vira banda lateral (sem chip "Prioridade" gritando
 * em cor) e a ação recomendada fica em evidência ao lado da justificativa.
 * Fetch e priorização preservados; nada aqui executa nada sozinho.
 */

const SEVERITY = (priority: number) =>
  priority >= 85
    ? { color: "#fb7185", label: "crítica" }
    : priority >= 70
      ? { color: "#f5b544", label: "alta" }
      : { color: "var(--atlas-accent)", label: "normal" };

export default function DecisionCenterPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [capacity, setCapacity] = useState<CapacityBlock | null>(null);
  const [capacityStatus, setCapacityStatus] = useState<CapacityStatus>("loading");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadError(false);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [briefingResponse, leadResult, capacityResponse] = await Promise.all([
          token
            ? fetch("/api/ai/briefing", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
            : Promise.resolve(null),
          supabase.from("leads").select(LIVE_LEAD_SELECT).order("created_at", { ascending: false }).limit(100),
          token
            ? fetch("/api/v1/analytics/director-daily", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null)
            : Promise.resolve(null),
        ]);
        const briefing = briefingResponse?.ok ? ((await briefingResponse.json()) as BriefingResponse) : null;
        if (leadResult.error) throw leadResult.error;

        if (active) {
          if (!capacityResponse) setCapacityStatus("error");
          else if (capacityResponse.status === 403 || capacityResponse.status === 401) setCapacityStatus("denied");
          else if (!capacityResponse.ok) setCapacityStatus("error");
          else {
            const body = (await capacityResponse.json().catch(() => null)) as { data?: { capacity?: CapacityBlock } } | null;
            const block = body?.data?.capacity ?? null;
            setCapacity(block);
            setCapacityStatus(block ? "ok" : "error");
          }
        }

        if (!active) return;
        const scoreBySeverity = { critical: 96, attention: 84, opportunity: 76, healthy: 60 };
        setInsights((briefing?.signals ?? []).map((signal) => ({
          id: signal.id,
          title: signal.title,
          summary: signal.evidence,
          recommendation: signal.action,
          score: scoreBySeverity[signal.severity],
          status: "active",
          entity_type: signal.severity === "opportunity" ? "Oportunidade" : "Operação",
          created_at: new Date().toISOString(),
        })));
        setLeads((leadResult.data ?? []).map((row) => {
          const lead = mapLegacyLead(row as unknown as Record<string, unknown>);
          return {
            id: String(lead.id),
            name: typeof lead.name === "string" ? lead.name : null,
            score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : null,
            temperature: typeof lead.temperature === "string" ? lead.temperature : null,
            status: typeof lead.status === "string" ? lead.status : null,
            next_action_at: typeof lead.next_action_at === "string" ? lead.next_action_at : null,
          };
        }));
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const decisions = useMemo<Decision[]>(() => {
    const items: Decision[] = [];
    leads.forEach(lead => {
      const score = Number(lead.score || 0);
      if (score >= 75) items.push({ id: `lead-${lead.id}`, priority: score, title: `Priorizar ${lead.name || "lead sem nome"}`, reason: `Score ${score} e temperatura ${lead.temperature || "não informada"}.`, action: "Contato imediato e oferta compatível", type: "Lead" });
      if (lead.next_action_at && new Date(lead.next_action_at) < new Date()) items.push({ id: `follow-${lead.id}`, priority: 90, title: `Follow-up atrasado: ${lead.name || "lead"}`, reason: "Próxima ação já venceu.", action: "Executar contato e registrar atividade", type: "Follow-up" });
    });
    insights.filter(i => i.status === "active" || i.status === "novo").forEach(insight => items.push({ id: `insight-${insight.id}`, priority: Number(insight.score || 60), title: insight.title, reason: insight.summary || "Insight gerado pelo Atlas.", action: insight.recommendation || "Revisar recomendação", type: insight.entity_type }));
    return items.sort((a, b) => b.priority - a.priority).slice(0, 20);
  }, [insights, leads]);

  const criticalCount = decisions.filter((decision) => decision.priority >= 85).length;

  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Inteligência · Decision Engine"
        title="Centro de decisão"
        description="Fila única priorizada — cada item traz o porquê e a próxima ação."
      />

      {loadError ? (
        <p
          role="status"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#f5b544]"
          style={{ "--cc6-sev": "#f5b544" } as CSSProperties}
        >
          O Atlas não conseguiu atualizar todos os sinais agora. Seus dados permanecem protegidos — recarregue a página para tentar de novo.
        </p>
      ) : null}

      <section aria-label="Fila priorizada de decisões">
        <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={40}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
            <p className="cc6-eyebrow">Fila priorizada</p>
            <p className="cc6-num text-[11px] text-[#6b7890]" aria-live="polite">
              {loading ? "analisando…" : `${decisions.length} ${decisions.length === 1 ? "decisão" : "decisões"}`}
            </p>
          </div>

          <div
            className="cc6-hairline mx-5 mt-4 flex flex-wrap gap-x-10 gap-y-4 pb-4 pt-4"
            aria-label="Contexto da análise"
            aria-busy={loading}
          >
            {[
              { label: "Críticas", value: criticalCount, accent: criticalCount > 0 ? "cc6-crit" : "" },
              { label: "Leads analisados", value: leads.length, accent: "" },
              { label: "Insights ativos", value: insights.length, accent: "" },
            ].map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-3xl leading-none ${metric.accent}`}>
                  {loading ? "—" : metric.value}
                </p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>

          {!loading && decisions.length === 0 ? (
            <p className="cc6-hairline px-5 py-8 text-center text-sm text-[#6b7890]">
              {loadError
                ? "A fila não pôde ser calculada agora."
                : `Nenhuma decisão pendente — ${leads.length} leads analisados e nenhum exige ação imediata.`}
            </p>
          ) : null}

          {decisions.map((decision) => {
            const severity = SEVERITY(decision.priority);
            return (
              <article
                key={decision.id}
                className="cc6-sev-band cc6-hairline px-5 py-4"
                style={{ "--cc6-sev": severity.color } as CSSProperties}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cc6-chip">{decision.type}</span>
                      <span
                        className={`cc6-num text-[11px] ${decision.priority >= 85 ? "cc6-crit" : decision.priority >= 70 ? "cc6-warn" : "text-[#6b7890]"}`}
                        title={`Prioridade ${severity.label}`}
                      >
                        Prioridade {decision.priority}
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold tracking-tight text-[#e8eef8]">
                      {decision.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[#aab6ca]">{decision.reason}</p>
                  </div>
                  <div className="shrink-0 sm:w-[240px] sm:text-right">
                    <p className="cc6-eyebrow text-[10px]!">Próxima ação</p>
                    <p className="mt-1.5 text-sm font-medium leading-6 text-[#e8eef8]">
                      {decision.action}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}

          <p className="cc6-hairline px-5 py-3 text-[11px] leading-5 text-[#6b7890]">
            Recomendações apenas — nada é executado automaticamente; a decisão final é sempre humana.
          </p>
        </TiltShell>
      </section>

      {/* Só aparece depois de resolvido: a seção é da diretoria, e piscar um
          painel que some em seguida para o corretor é ruído, não informação. */}
      {capacityStatus === "loading" || capacityStatus === "denied" ? null : (
        <section aria-label="Sala de simulação de capacidade">
          <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={80}>
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
              <p className="cc6-eyebrow">Sala de simulação · capacidade comercial</p>
              <p className="cc6-num text-[11px] text-[#6b7890]">
                {capacity ? `janela de ${capacity.windowDays} dias` : "—"}
              </p>
            </div>
            <p className="px-5 pt-2 text-sm leading-6 text-[#aab6ca]">
              Projeção de <strong className="font-semibold text-[#e8eef8]">leads trabalhados por semana</strong> — não de receita.
              Nada aqui contrata, atribui ou remaneja alguém.
            </p>

            {capacityStatus === "error" ? (
              <p className="cc6-hairline mt-4 px-5 py-6 text-sm leading-6 text-[#f5b544]">
                A capacidade não pôde ser medida agora — a leitura do painel executivo falhou. Nenhum número é exibido:
                projeção sobre leitura incompleta seria pior do que a ausência dela.
              </p>
            ) : null}

            {capacity ? (
              <>
                <div className="cc6-hairline mx-5 mt-4 flex flex-wrap gap-x-10 gap-y-4 pb-4 pt-4" aria-label="Capacidade observada">
                  {[
                    { label: "Leads abertos", value: String(capacity.openLeads), detail: null as string | null },
                    { label: "Sem responsável", value: String(capacity.unassignedOpenLeads), detail: "entre os leads abertos" },
                    { label: "Corretores ativos", value: String(capacity.activeBrokers), detail: null },
                    {
                      label: "Leads/corretor/semana",
                      value: capacity.observed.leadsPerBrokerPerWeek === null ? "—" : String(capacity.observed.leadsPerBrokerPerWeek),
                      // A amostra citada é a ATRIBUÍDA a corretor, não o total lido:
                      // dizer "430" ao lado de uma conta feita com 199 é vender
                      // lastro que a conta não tem.
                      detail: capacity.observed.leadsPerBrokerPerWeek === null
                        ? capacity.unavailableReason ?? "throughput não medido nesta base"
                        : `${capacity.observed.attributedMoves} de ${capacity.observed.moves} movimentações têm autor corretor · ${capacity.observed.actors} corretor(es)`,
                    },
                  ].map((metric) => (
                    <div key={metric.label} className="min-w-[140px]">
                      <p className="cc6-metric-value text-3xl leading-none">{metric.value}</p>
                      <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                      {metric.detail ? <p className="mt-1 max-w-[220px] text-[11px] leading-4 text-[#6b7890]">{metric.detail}</p> : null}
                    </div>
                  ))}
                </div>

                {capacity.scenarios.map((scenario) => (
                  <article key={scenario.id} className="cc6-hairline px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cc6-chip">{scenario.label}</span>
                      <span className={`cc6-num text-[11px] ${scenario.hasBasis ? "text-[#6b7890]" : "cc6-warn"}`}>
                        {scenario.hasBasis ? `confiança ${scenario.projection.confidence} · amostra ${scenario.projection.basis?.sample ?? 0}` : "sem lastro"}
                      </span>
                    </div>

                    {scenario.hasBasis ? (
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                        {[
                          { label: "Pessimista", value: scenario.projection.weeklyLeadsDelta.pessimista },
                          { label: "Esperado", value: scenario.projection.weeklyLeadsDelta.esperado },
                          { label: "Otimista", value: scenario.projection.weeklyLeadsDelta.otimista },
                        ].map((point) => (
                          <div key={point.label}>
                            <p className="cc6-metric-value text-2xl leading-none">{point.value}</p>
                            <p className="cc6-metric-label mt-1">{point.label} · leads/semana</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-[#f5b544]">
                        Ainda não sei projetar este cenário
                        {scenario.projection.basis?.reason ? `: ${scenario.projection.basis.reason}` : "."}
                        {" "}Nenhum número é exibido de propósito — um número inventado aqui vira uma contratação errada.
                      </p>
                    )}

                    <ul className="mt-3 space-y-1.5">
                      {scenario.projection.assumptions.map((assumption) => (
                        <li key={assumption} className="text-[12px] leading-5 text-[#aab6ca]">
                          <span className="text-[#6b7890]">· </span>
                          {assumption}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </>
            ) : null}

            <p className="cc6-hairline px-5 py-3 text-[11px] leading-5 text-[#6b7890]">
              Simulação determinística sobre o histórico de pipeline — sem modelo generativo e sem custo de token.
              A decisão de contratar, remanejar ou distribuir continua inteiramente humana.
            </p>
          </TiltShell>
        </section>
      )}
    </div>
  );
}
