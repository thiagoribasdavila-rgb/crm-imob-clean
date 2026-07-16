"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  evolutionPhases,
  overallEvolution,
  technicalEvolution,
  type EvolutionPhase,
} from "@/lib/atlas/evolution-phases";
import { StatusBadge } from "@/components/atlas/status-badge";

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
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("opportunities").select("id", { count: "exact", head: true }),
        supabase.from("developments").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }),
        supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("atlas_decisions").select("id", { count: "exact", head: true }).eq("status", "proposed"),
        supabase.from("ai_insights").select("id", { count: "exact", head: true }),
      ]);

      if (!active) return;
      const labels = ["Leads", "Imóveis", "Oportunidades", "Projetos", "Tarefas", "Aprovações", "Decisões", "Insights"];
      setWarnings(results.flatMap((result, index) => result.error ? [`${labels[index]}: ${result.error.message}`] : []));
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

  const phaseSummary = useMemo(() => ({
    advanced: evolutionPhases.filter((phase) => phase.progress >= 75).length,
    partial: evolutionPhases.filter((phase) => phase.progress > 0 && phase.progress < 75).length,
    blocked: evolutionPhases.filter((phase) => phase.progress === 0).length,
  }), []);

  const nextMilestones = evolutionPhases
    .filter((phase) => phase.progress < 100)
    .sort((a, b) => (b.weight * (100 - b.progress)) - (a.weight * (100 - a.progress)))
    .slice(0, 4);

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-evolution-hero">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="violet">ATLAS V3</StatusBadge>
            <StatusBadge tone="success">QUALITY GATE PASS</StatusBadge>
            <StatusBadge tone="warning">HOMOLOGAÇÃO EM CURSO</StatusBadge>
          </div>
          <h1>
            Evolução mensurável, evidência por fase e{" "}
            <span className="atlas-gradient-text">próximo passo claro.</span>
          </h1>
          <p>
            O percentual combina o peso de cada fase com entregas comprovadas no
            código. Estrutura pronta não substitui dados reais, teste entre tenants
            ou piloto operacional.
          </p>
          <div className="atlas-command-actions">
            <Link href="/dashboard" className="atlas-button-primary">Abrir Command Center</Link>
            <Link href="/atlas-v3/audit" className="atlas-button-secondary">Auditoria técnica</Link>
            <Link href="/atlas-v3/homologation" className="atlas-button-secondary">Roteiro de homologação</Link>
            <Link href="/decision-center" className="atlas-button-secondary">Decisões e IA</Link>
          </div>
        </div>
        <div className="atlas-evolution-score">
          <div className="atlas-score-ring" style={{ "--atlas-score": `${overallEvolution * 3.6}deg` } as React.CSSProperties}>
            <span><strong>{overallEvolution}%</strong><small>evolução geral</small></span>
          </div>
          <div>
            <p><span>Execução técnica</span><strong>{technicalEvolution}%</strong></p>
            <p><span>Fases avançadas</span><strong>{phaseSummary.advanced}/10</strong></p>
            <p><span>Operação real</span><strong>pendente</strong></p>
          </div>
        </div>
      </section>

      {warnings.length ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          A estrutura foi carregada, mas alguns indicadores reais estão indisponíveis: {warnings.join(" · ")}
        </div>
      ) : null}

      <section className="atlas-runtime-strip">
        {[
          ["Leads", metrics.leads, "/leads"],
          ["Imóveis", metrics.properties, "/properties"],
          ["Oportunidades", metrics.opportunities, "/pipeline"],
          ["Projetos", metrics.projects, "/developments"],
          ["Tarefas", metrics.tasks, "/tasks"],
          ["Aprovações", metrics.approvals, "/approvals"],
          ["Decisões", metrics.decisions, "/decision-center"],
          ["Insights IA", metrics.insights, "/intelligence"],
        ].map(([label, value, href]) => (
          <Link href={String(href)} key={String(label)}>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
          </Link>
        ))}
      </section>

      <section className="atlas-evolution-layout">
        <article className="atlas-command-panel">
          <div className="atlas-evolution-heading">
            <div><p className="atlas-page-eyebrow">Roadmap de homologação</p><h2>Avanço por fase</h2></div>
            <div><StatusBadge tone="info">{phaseSummary.advanced} avançadas</StatusBadge><StatusBadge tone="warning">{phaseSummary.partial} parciais</StatusBadge><StatusBadge tone="danger">{phaseSummary.blocked} bloqueada</StatusBadge></div>
          </div>
          <div className="atlas-phase-list">
            {evolutionPhases.map((phase) => (
              <button
                type="button"
                key={phase.id}
                data-selected={selectedPhase.id === phase.id ? "true" : "false"}
                onClick={() => setSelectedPhase(phase)}
              >
                <span className="atlas-phase-number">{String(phase.id).padStart(2, "0")}</span>
                <span className="atlas-phase-name"><strong>{phase.name}</strong><small>Peso {phase.weight}% · {phase.status}</small></span>
                <span className="atlas-phase-track"><i style={{ width: `${phase.progress}%` }} /></span>
                <strong className="atlas-phase-percent">{phase.progress}%</strong>
              </button>
            ))}
          </div>
        </article>

        <aside className="atlas-phase-detail">
          <div className="atlas-phase-detail-head">
            <span>Fase {String(selectedPhase.id).padStart(2, "0")}</span>
            <StatusBadge tone={phaseTone(selectedPhase.status)}>{selectedPhase.status}</StatusBadge>
          </div>
          <h2>{selectedPhase.name}</h2>
          <strong className="atlas-phase-detail-score">{selectedPhase.progress}%</strong>
          <div className="atlas-phase-detail-track"><i style={{ width: `${selectedPhase.progress}%` }} /></div>
          <p className="atlas-phase-detail-label">Evidências confirmadas</p>
          <ul>{selectedPhase.evidence.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul>
          <div className="atlas-phase-next"><span>Próximo critério de saída</span><p>{selectedPhase.next}</p></div>
          <Link href={selectedPhase.href} className="atlas-button-primary">Abrir módulo relacionado →</Link>
        </aside>
      </section>

      <section className="atlas-evolution-bottom">
        <article className="atlas-command-panel">
          <div className="atlas-evolution-heading"><div><p className="atlas-page-eyebrow">Impacto ponderado</p><h2>Próximos marcos</h2></div></div>
          <div className="atlas-milestone-list">
            {nextMilestones.map((phase, index) => (
              <div key={phase.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p><strong>{phase.shortName}</strong><small>{phase.next}</small></p>
                <b>+{Math.round((phase.weight * (100 - phase.progress)) / 100)} pts</b>
              </div>
            ))}
          </div>
        </article>
        <article className="atlas-command-panel atlas-gate-panel">
          <div className="atlas-evolution-heading"><div><p className="atlas-page-eyebrow">Gates obrigatórios</p><h2>Antes de produção</h2></div></div>
          <div className="atlas-gate-list">
            {[
              ["Código e build", true],
              ["Shell e Command Center", true],
              ["Dados reais por projeto", false],
              ["Isolamento entre tenants", false],
              ["Gateway de IA real", false],
              ["Piloto operacional", false],
              ["Backup e rollback testados", false],
            ].map(([label, done]) => (
              <div key={String(label)} data-done={done ? "true" : "false"}>
                <span>{done ? "✓" : "○"}</span><p>{label}</p><small>{done ? "aprovado" : "pendente"}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
