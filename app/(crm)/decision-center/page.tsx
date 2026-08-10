"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { DecisionLearningLedger } from "@/components/decision-center/DecisionLearningLedger";
import { AssistedInteractionLearningPanel } from "@/components/decision-center/AssistedInteractionLearningPanel";
import { OperationalUxMeasurement } from "@/components/decision-center/OperationalUxMeasurement";
import { OperationalUxReleaseGate } from "@/components/decision-center/OperationalUxReleaseGate";
import type { AssistedInteractionGovernanceDecision } from "@/lib/ai/assisted-interaction-governance";
import type { AssistedInteractionGovernanceReviewState } from "@/lib/ai/assisted-interaction-governance";

type Insight = {
  id: string;
  title: string;
  summary: string | null;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
  status: string;
  entity_type: string;
  created_at: string;
  href: string;
};
type Lead = {
  id: string;
  name: string | null;
  score: number | null;
  temperature: string | null;
  status: string | null;
  next_action_at: string | null;
};

type ConfidenceBasis = "calibrated" | "deterministic" | "not-calibrated";
type Decision = {
  id: string;
  sourceId?: string | null;
  priority: number;
  title: string;
  reason: string;
  evidence: string[];
  action: string;
  href: string;
  type: string;
  confidence: number | null;
  confidenceBasis: ConfidenceBasis;
};
type BriefingResponse = {
  signals?: Array<{
    id: string;
    severity: "critical" | "attention" | "opportunity" | "healthy";
    area: string;
    title: string;
    evidence: string;
    action: string;
    href: string;
  }>;
};

function confidenceLabel(decision: Decision) {
  if (decision.confidenceBasis === "deterministic")
    return "Regra determinística";
  if (
    decision.confidenceBasis === "not-calibrated" ||
    decision.confidence === null
  )
    return "Confiança não calibrada";
  return `${Math.round(decision.confidence)}% de confiança calibrada`;
}

export default function DecisionCenterPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [assistedInteractionReview, setAssistedInteractionReview] =
    useState<AssistedInteractionGovernanceDecision | null>(null);
  const [
    assistedInteractionGovernanceStatus,
    setAssistedInteractionGovernanceStatus,
  ] = useState<AssistedInteractionGovernanceReviewState | undefined>(undefined);
  const receiveAssistedInteractionReview = useCallback(
    (decision: AssistedInteractionGovernanceDecision | null) => {
      setAssistedInteractionReview(decision);
    },
    [],
  );
  const receiveAssistedInteractionGovernanceStatus = useCallback(
    (status: AssistedInteractionGovernanceReviewState) => {
      setAssistedInteractionGovernanceStatus(status);
    },
    [],
  );

  const retryDecisionCenterLoad = useCallback(() => {
    setReloadAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadError(false);
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [briefingResponse, leadResult] = await Promise.all([
          token
            ? fetch("/api/ai/briefing", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              })
            : Promise.resolve(null),
          supabase
            .from("leads")
            .select(LIVE_LEAD_SELECT)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        const briefing = briefingResponse?.ok
          ? ((await briefingResponse.json()) as BriefingResponse)
          : null;
        if (leadResult.error) throw leadResult.error;
        if (!active) return;
        const scoreBySeverity = {
          critical: 96,
          attention: 84,
          opportunity: 76,
          healthy: 60,
        };
        setInsights(
          (briefing?.signals ?? []).map((signal) => ({
            id: signal.id,
            title: signal.title,
            summary: signal.evidence,
            recommendation: signal.action,
            score: scoreBySeverity[signal.severity],
            confidence: null,
            status: "active",
            entity_type:
              signal.severity === "opportunity" ? "Oportunidade" : "Operação",
            created_at: new Date().toISOString(),
            href: signal.href,
          })),
        );
        setLeads(
          (leadResult.data ?? []).map((row) => {
            const lead = mapLegacyLead(
              row as unknown as Record<string, unknown>,
            );
            return {
              id: String(lead.id),
              name: typeof lead.name === "string" ? lead.name : null,
              score: Number.isFinite(Number(lead.score))
                ? Number(lead.score)
                : null,
              temperature:
                typeof lead.temperature === "string" ? lead.temperature : null,
              status: typeof lead.status === "string" ? lead.status : null,
              next_action_at:
                typeof lead.next_action_at === "string"
                  ? lead.next_action_at
                  : null,
            };
          }),
        );
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadAttempt]);

  const decisions = useMemo<Decision[]>(() => {
    const items: Decision[] = [];
    leads.forEach((lead) => {
      const score = Number(lead.score || 0);
      if (score >= 75)
        items.push({
          id: `lead-${lead.id}`,
          sourceId: lead.id,
          priority: score,
          title: `Priorizar ${lead.name || "lead sem nome"}`,
          reason: "Sinais comerciais indicam prioridade de revisão.",
          evidence: [
            `Score comercial registrado: ${score}/100`,
            `Temperatura registrada: ${lead.temperature || "não informada"}`,
            `Etapa atual: ${lead.status || "não informada"}`,
          ],
          action: "Revisar o perfil e confirmar o próximo contato",
          href: `/leads/${lead.id}`,
          type: "Lead",
          confidence: null,
          confidenceBasis: "not-calibrated",
        });
      if (lead.next_action_at && new Date(lead.next_action_at) < new Date())
        items.push({
          id: `follow-${lead.id}`,
          sourceId: lead.id,
          priority: 90,
          title: `Follow-up atrasado: ${lead.name || "lead"}`,
          reason: "Uma regra operacional identificou prazo vencido.",
          evidence: [
            `Próxima ação registrada para ${new Date(lead.next_action_at).toLocaleString("pt-BR")}`,
            `Lead: ${lead.name || "sem nome"}`,
          ],
          action:
            "Revisar o atendimento, executar o contato e registrar o resultado",
          href: `/leads/${lead.id}`,
          type: "Follow-up",
          confidence: null,
          confidenceBasis: "deterministic",
        });
    });
    insights
      .filter((i) => i.status === "active" || i.status === "novo")
      .forEach((insight) =>
        items.push({
          id: `insight-${insight.id}`,
          priority: Number(insight.score || 60),
          title: insight.title,
          reason: "Leitura do snapshot operacional atual.",
          evidence: [
            insight.summary || "Evidência detalhada ainda não registrada.",
          ],
          action: insight.recommendation || "Revisar recomendação",
          href: insight.href || "/dashboard",
          type: insight.entity_type,
          confidence: insight.confidence,
          confidenceBasis:
            insight.confidence === null ? "not-calibrated" : "calibrated",
        }),
      );
    if (assistedInteractionReview) items.push(assistedInteractionReview);
    return items.sort((a, b) => b.priority - a.priority).slice(0, 20);
  }, [assistedInteractionReview, insights, leads]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
          Atlas Decision Engine
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          Centro de decisão
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Fila priorizada de decisões comerciais, operacionais e estratégicas
          com justificativa, confiança e ação recomendada.
        </p>
      </header>

      {loadError ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[.08] px-5 py-4 text-sm text-amber-100"
        >
          <p>
            O Atlas não conseguiu atualizar todos os sinais agora. Seus dados
            permanecem protegidos; tente novamente quando a conexão estiver
            estável.
          </p>
          <button
            type="button"
            onClick={retryDecisionCenterLoad}
            disabled={loading}
            className="rounded-full border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            {loading ? "Atualizando…" : "Atualizar sinais"}
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["Decisões", decisions.length],
          ["Leads analisados", leads.length],
          ["Insights ativos", insights.length],
          ["Críticas", decisions.filter((d) => d.priority >= 85).length],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
          >
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-3 text-3xl font-black">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section
        className="space-y-4"
        data-ux-phase="54-explainable-supervised-ai-recommendation"
      >
        {!loading && decisions.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-zinc-500">
            Nenhuma decisão pendente.
          </div>
        ) : null}
        {decisions.map((decision) => (
          <article
            key={decision.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">
                    {decision.type}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${decision.priority >= 85 ? "bg-red-500/10 text-red-300" : decision.priority >= 70 ? "bg-amber-500/10 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}
                  >
                    Prioridade {decision.priority}
                  </span>
                  <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-xs text-violet-200">
                    {confidenceLabel(decision)}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-bold">{decision.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {decision.reason}
                </p>
                <details className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-sky-200">
                    Ver evidências utilizadas
                  </summary>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                    {decision.evidence.map((item, index) => (
                      <li key={`${decision.id}-evidence-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </details>
              </div>
              <div className="min-w-[280px] rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Ação supervisionada
                </p>
                <p className="mt-2 text-sm font-semibold text-zinc-200">
                  {decision.action}
                </p>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  O Atlas não executa contato, mudança de etapa ou orçamento.
                  Revise as evidências antes de decidir.
                </p>
                <Link
                  href={decision.href}
                  className="mt-4 inline-flex rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  Revisar e decidir →
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      {!loading ? (
        <DecisionLearningLedger
          decisions={decisions}
          onAssistedInteractionGovernanceStatus={
            receiveAssistedInteractionGovernanceStatus
          }
        />
      ) : null}
      <AssistedInteractionLearningPanel
        onGovernanceReview={receiveAssistedInteractionReview}
        governanceStatus={assistedInteractionGovernanceStatus}
      />
      <OperationalUxMeasurement />
      <OperationalUxReleaseGate />
    </div>
  );
}
