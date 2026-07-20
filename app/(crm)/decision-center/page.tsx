"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { PageHeader } from "@/components/atlas/page-header";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Insight = { id: string; title: string; summary: string | null; recommendation: string | null; score: number | null; confidence: number | null; status: string; entity_type: string; created_at: string };
type Lead = { id: string; name: string | null; score: number | null; temperature: string | null; status: string | null; next_action_at: string | null };

type Decision = { id: string; priority: number; title: string; reason: string; action: string; type: string };
type BriefingResponse = {
  signals?: Array<{ id: string; severity: "critical" | "attention" | "opportunity" | "healthy"; title: string; evidence: string; action: string }>;
  model?: { generativeReady?: boolean };
};

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

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadError(false);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [briefingResponse, leadResult] = await Promise.all([
          token
            ? fetch("/api/ai/briefing", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
            : Promise.resolve(null),
          supabase.from("leads").select(LIVE_LEAD_SELECT).order("created_at", { ascending: false }).limit(100),
        ]);
        const briefing = briefingResponse?.ok ? ((await briefingResponse.json()) as BriefingResponse) : null;
        if (leadResult.error) throw leadResult.error;
        if (!active) return;
        const confidence = briefing?.model?.generativeReady ? 0.9 : 0.74;
        const scoreBySeverity = { critical: 96, attention: 84, opportunity: 76, healthy: 60 };
        setInsights((briefing?.signals ?? []).map((signal) => ({
          id: signal.id,
          title: signal.title,
          summary: signal.evidence,
          recommendation: signal.action,
          score: scoreBySeverity[signal.severity],
          confidence,
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
    </div>
  );
}
