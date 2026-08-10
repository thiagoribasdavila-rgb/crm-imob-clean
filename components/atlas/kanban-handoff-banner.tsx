"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AtlasBadge } from "@/components/ui/AtlasUI";

type KanbanHandoffBannerProps = {
  module: "tasks" | "calendar" | "sales";
};

const MODULE_COPY = {
  tasks: {
    eyebrow: "EXECUÇÃO",
    title: "Transformar em tarefa",
    detail:
      "O Atlas trouxe a prioridade do Kanban para você registrar o próximo passo sem recomeçar.",
  },
  calendar: {
    eyebrow: "AGENDA",
    title: "Agendar próximo passo",
    detail:
      "Use o contexto da lead para encaixar follow-up, visita ou compromisso comercial.",
  },
  sales: {
    eyebrow: "RECEITA",
    title: "Preparar proposta ou revisão",
    detail:
      "A oportunidade veio do Kanban com sinais comerciais para validar valor, prazo e avanço.",
  },
} as const;

export function KanbanHandoffBanner({ module }: KanbanHandoffBannerProps) {
  const searchParams = useSearchParams();

  const handoff = useMemo(() => {
    if (searchParams.get("from") !== "pipeline") return null;

    return {
      action: searchParams.get("action") || "Definir próxima ação",
      campaign: searchParams.get("campaign") || "",
      lead: searchParams.get("lead") || "Lead",
      leadId: searchParams.get("leadId") || "",
      project: searchParams.get("project") || "",
      score: searchParams.get("score") || "0",
      stage: searchParams.get("stage") || "novo",
      temperature: searchParams.get("temperature") || "frio",
    };
  }, [searchParams]);

  if (!handoff) return null;

  const copy = MODULE_COPY[module];
  const copilotParams = new URLSearchParams({
    action: handoff.action,
    from: "kanban-handoff",
    intent: "follow_up",
    lead: handoff.lead,
    score: handoff.score,
    stage: handoff.stage,
    temperature: handoff.temperature,
  });

  if (handoff.project) copilotParams.set("project", handoff.project);
  if (handoff.campaign) copilotParams.set("campaign", handoff.campaign);

  return (
    <section
      aria-label="Contexto recebido do Kanban"
      className="atlas-kanban-handoff-banner"
      data-context-source="pipeline"
      data-kanban-context="111-kanban-context-intake"
    >
      <div>
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone="info">KANBAN</AtlasBadge>
          <AtlasBadge tone="violet">{copy.eyebrow}</AtlasBadge>
        </div>
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
      </div>

      <div className="atlas-kanban-handoff-facts">
        <span>
          <small>Lead</small>
          <strong>{handoff.lead}</strong>
        </span>
        <span>
          <small>Etapa</small>
          <strong>{handoff.stage}</strong>
        </span>
        <span>
          <small>Ação sugerida</small>
          <strong>{handoff.action}</strong>
        </span>
        <span>
          <small>IA</small>
          <strong>
            {handoff.score} · {handoff.temperature}
          </strong>
        </span>
      </div>

      <nav
        aria-label="Ações do contexto recebido"
        className="atlas-kanban-handoff-actions"
      >
        <Link href={handoff.leadId ? `/leads/${handoff.leadId}` : "/leads"}>
          Lead 360
        </Link>
        <Link
          href={
            handoff.leadId
              ? `/leads/${handoff.leadId}/messages?${copilotParams.toString()}`
              : `/leads?${copilotParams.toString()}`
          }
        >
          Copilot IA
        </Link>
        <Link href="/pipeline">Voltar ao Kanban</Link>
      </nav>
    </section>
  );
}
