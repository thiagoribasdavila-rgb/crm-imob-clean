"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  V3000PageTemplate,
} from "@/components/atlas/v3000-page-template";
import {
  V3000ProgressGovernance,
  V3000ProgressMetrics,
  V3000ProgressStatus,
  V3000ProgressWorkspace,
  V3000ReleaseQueue,
} from "@/components/atlas/v3000-progress-surface";
import { StatusBadge } from "@/components/atlas/status-badge";
import {
  evolutionPhases,
  type EvolutionPhase,
} from "@/lib/atlas/evolution-phases";
import { v3000Progress } from "@/lib/atlas/v3000-progress";
import { supabase } from "@/lib/supabase";

import { CommandCenterOverview } from "./CommandCenterOverview";

type Metrics = {
  leads: number;
  properties: number;
  opportunities: number;
  projects: number;
  tasks: number;
  approvals: number;
  decisions: number;
  insights: number;
};

const emptyMetrics: Metrics = {
  leads: 0,
  properties: 0,
  opportunities: 0,
  projects: 0,
  tasks: 0,
  approvals: 0,
  decisions: 0,
  insights: 0,
};

function phaseTone(status: EvolutionPhase["status"]) {
  if (status === "concluída") return "success";
  if (status === "avançada") return "info";
  if (status === "parcial") return "warning";
  return "danger";
}

export default function AtlasV3Page() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<EvolutionPhase>(evolutionPhases[0]);

  useEffect(() => {
    let active = true;

    async function load() {
      const results = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("inventory_units").select("id", { count: "exact", head: true }),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)"),
        supabase.from("crm_projects").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }),
        supabase
          .from("lead_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "approval_requested"),
        supabase
          .from("lead_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "decision_proposed"),
        supabase.from("ai_scores").select("id", { count: "exact", head: true }),
      ]);

      if (!active) return;

      const labels = [
        "Leads",
        "Imóveis",
        "Oportunidades",
        "Projetos",
        "Tarefas",
        "Aprovações",
        "Decisões",
        "Insights",
      ];

      setWarnings(
        results.flatMap((result, index) =>
          result.error ? [`${labels[index]} temporariamente indisponível.`] : [],
        ),
      );
      setMetrics({
        leads: results[0].count ?? 0,
        properties: results[1].count ?? 0,
        opportunities: results[2].count ?? 0,
        projects: results[3].count ?? 0,
        tasks: results[4].count ?? 0,
        approvals: results[5].count ?? 0,
        decisions: results[6].count ?? 0,
        insights: results[7].count ?? 0,
      });
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const phaseSummary = useMemo(
    () => ({
      advanced: evolutionPhases.filter((phase) => phase.progress >= 75).length,
      partial: evolutionPhases.filter(
        (phase) => phase.progress > 0 && phase.progress < 75,
      ).length,
      blocked: evolutionPhases.filter((phase) => phase.progress === 0).length,
    }),
    [],
  );

  const nextMilestones = evolutionPhases
    .filter((phase) => phase.progress < 100)
    .sort(
      (a, b) =>
        b.weight * (100 - b.progress) - a.weight * (100 - a.progress),
    )
    .slice(0, 4);

  const runtimeMetrics = [
    ["Leads", metrics.leads, "/leads"],
    ["Imóveis", metrics.properties, "/properties"],
    ["Oportunidades", metrics.opportunities, "/pipeline"],
    ["Projetos", metrics.projects, "/developments"],
    ["Tarefas", metrics.tasks, "/tasks"],
    ["Aprovações", metrics.approvals, "/approvals"],
    ["Decisões", metrics.decisions, "/decision-center"],
    ["Insights IA", metrics.insights, "/intelligence"],
  ] as const;

  const { consolidation, coverage, program } = v3000Progress;

  return (
    <V3000PageTemplate
      eyebrow="Atlas One · V3000"
      title="Consolidação verificável para a próxima release"
      decision={`Fase ${consolidation.currentPhase}/${consolidation.totalPhases} comprovada · ${consolidation.percentage}% dos gates do próximo ZIP`}
      description={`${coverage.verifiedHistoricalPhases} fases possuem evidência no repositório. O V3000 avança somente quando código, contrato ou documentação comprovam a entrega.`}
      action={{ href: "/dashboard", label: "Abrir Command Center" }}
      feedback={
        warnings.length ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            A estrutura foi carregada, mas alguns indicadores reais estão
            indisponíveis: {warnings.join(" · ")}
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[.05] p-4 text-sm text-slate-300">
            Validando os indicadores reais da operação…
          </div>
        ) : null
      }
      metrics={{
        label: "Evolução factual",
        primary: <V3000ProgressMetrics />,
        secondaryLabel: "Operação conectada",
        secondary: (
          <div className="atlas-runtime-strip">
            {runtimeMetrics.map(([label, value, href]) => (
              <Link href={href} key={label}>
                <span>{label}</span>
                <strong>{loading ? "—" : value}</strong>
              </Link>
            ))}
          </div>
        ),
      }}
      priority={{
        title: "Próximo gate que aproxima o ZIP",
        description:
          "Cada fase fecha uma condição de release; nenhuma etapa é promovida apenas por aparência ou quantidade de arquivos.",
        content: <V3000ReleaseQueue />,
      }}
      workspace={{
        eyebrow: "Plano de release executável",
        title: "16 gates da consolidação canônica",
        description:
          "A sequência preserva o sistema em uso, elimina duplicação comprovada e só empacota depois de build, instalação limpa, smoke e rollback.",
        content: <V3000ProgressWorkspace />,
        density: "compact",
      }}
      aside={<V3000ProgressStatus />}
      asideLabel="Status e critérios da consolidação V3000"
      analysis={{
        label: "Ver operação conectada e roadmap histórico",
        group: "v3000-release-analysis",
        content: (
          <div className="space-y-6 pt-2">
            <V3000ProgressGovernance />

            <CommandCenterOverview />

            <section className="atlas-evolution-layout">
              <article className="atlas-command-panel">
                <div className="atlas-evolution-heading">
                  <div>
                    <p className="atlas-page-eyebrow">Roadmap operacional histórico</p>
                    <h2>Detalhes por domínio</h2>
                  </div>
                  <div>
                    <StatusBadge tone="info">
                      {phaseSummary.advanced} avançadas
                    </StatusBadge>
                    <StatusBadge tone="warning">
                      {phaseSummary.partial} parciais
                    </StatusBadge>
                    <StatusBadge tone="danger">
                      {phaseSummary.blocked} bloqueada
                    </StatusBadge>
                  </div>
                </div>
                <p className="mb-4 text-xs leading-5 text-slate-500">
                  Estes percentuais são referências históricas de domínio e não
                  compõem a porcentagem oficial da release.
                </p>
                <div className="atlas-phase-list">
                  {evolutionPhases.map((phase) => (
                    <button
                      type="button"
                      key={phase.id}
                      data-selected={selectedPhase.id === phase.id ? "true" : "false"}
                      onClick={() => setSelectedPhase(phase)}
                    >
                      <span className="atlas-phase-number">
                        {String(phase.id).padStart(2, "0")}
                      </span>
                      <span className="atlas-phase-name">
                        <strong>{phase.name}</strong>
                        <small>
                          Peso {phase.weight}% · {phase.status}
                        </small>
                      </span>
                      <span className="atlas-phase-track">
                        <i style={{ width: `${phase.progress}%` }} />
                      </span>
                      <strong className="atlas-phase-percent">
                        {phase.progress}%
                      </strong>
                    </button>
                  ))}
                </div>
              </article>

              <aside className="atlas-phase-detail">
                <div className="atlas-phase-detail-head">
                  <span>Domínio {String(selectedPhase.id).padStart(2, "0")}</span>
                  <StatusBadge tone={phaseTone(selectedPhase.status)}>
                    {selectedPhase.status}
                  </StatusBadge>
                </div>
                <h2>{selectedPhase.name}</h2>
                <strong className="atlas-phase-detail-score">
                  {selectedPhase.progress}%
                </strong>
                <div className="atlas-phase-detail-track">
                  <i style={{ width: `${selectedPhase.progress}%` }} />
                </div>
                <p className="atlas-phase-detail-label">Evidências registradas</p>
                <ul>
                  {selectedPhase.evidence.map((item) => (
                    <li key={item}>
                      <span>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="atlas-phase-next">
                  <span>Próximo critério de saída</span>
                  <p>{selectedPhase.next}</p>
                </div>
                <Link href={selectedPhase.href} className="atlas-button-primary">
                  Abrir módulo relacionado →
                </Link>
              </aside>
            </section>

            <section className="atlas-command-panel">
              <div className="atlas-evolution-heading">
                <div>
                  <p className="atlas-page-eyebrow">Impacto ponderado histórico</p>
                  <h2>Próximos marcos operacionais</h2>
                </div>
                <StatusBadge tone="violet">
                  Meta {program.targetPhases} fases
                </StatusBadge>
              </div>
              <div className="atlas-milestone-list">
                {nextMilestones.map((phase, index) => (
                  <div key={phase.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>
                      <strong>{phase.shortName}</strong>
                      <small>{phase.next}</small>
                    </p>
                    <b>
                      +{Math.round((phase.weight * (100 - phase.progress)) / 100)} pts
                    </b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ),
      }}
    />
  );
}
