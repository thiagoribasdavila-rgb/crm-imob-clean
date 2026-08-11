import Link from "next/link";

import { v3000Progress } from "@/lib/atlas/v3000-progress";

const phaseStatusLabel = {
  complete: "Comprovada",
  next: "Próxima",
  pending: "Pendente",
} as const;

export function V3000ProgressMetrics() {
  const { consolidation, coverage, program } = v3000Progress;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {
          label: "Consolidação para ZIP",
          value: `${consolidation.percentage}%`,
          detail: `${consolidation.completedPhases}/${consolidation.totalPhases} gates comprovados`,
          tone: "sky",
        },
        {
          label: "Histórico verificado",
          value: `${coverage.verifiedHistoricalPhases}`,
          detail: `de ${coverage.requestedLegacyPhases} fases informadas`,
          tone: "emerald",
        },
        {
          label: "Cobertura V3000",
          value: `${coverage.v3000Percentage}%`,
          detail: `${coverage.verifiedHistoricalPhases}/${program.targetPhases} fases documentadas`,
          tone: "violet",
        },
        {
          label: "Contratos rastreáveis",
          value: `${program.phaseContractsFound}`,
          detail: `${coverage.contractPercentage}% do histórico possui teste nomeado`,
          tone: "amber",
        },
      ].map((metric) => (
        <article
          key={metric.label}
          className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
          data-progress-tone={metric.tone}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
            {metric.label}
          </p>
          <strong className="mt-2 block text-2xl font-semibold tracking-[-.03em] text-white">
            {metric.value}
          </strong>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {metric.detail}
          </span>
        </article>
      ))}
    </div>
  );
}

export function V3000ReleaseQueue() {
  const nextPhase = v3000Progress.consolidation.nextPhase;

  if (!nextPhase) return null;

  return (
    <article className="rounded-2xl border border-sky-300/15 bg-sky-300/[.055] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-sky-300">
            Fase {String(nextPhase.id).padStart(2, "0")} de {v3000Progress.consolidation.totalPhases}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-white">{nextPhase.name}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {nextPhase.outcome}
          </p>
        </div>
        <Link href="/atlas-v3/audit" className="atlas-button-secondary">
          Abrir evidências
        </Link>
      </div>
    </article>
  );
}

export function V3000ProgressWorkspace() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {v3000Progress.consolidation.phases.map((phase) => (
        <article
          key={phase.id}
          className="rounded-2xl border border-white/[.07] bg-black/10 p-4"
          data-release-phase={phase.id}
          data-release-status={phase.status}
        >
          <div className="flex items-start gap-3">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 font-mono text-[10px] text-sky-200"
              aria-hidden="true"
            >
              {phase.status === "complete" ? "✓" : String(phase.id).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white">{phase.name}</h3>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-slate-400">
                  {phaseStatusLabel[phase.status]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{phase.outcome}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function V3000ProgressStatus() {
  const { consolidation, coverage, program } = v3000Progress;

  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Fonte de verdade
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          O painel conta arquivos de evidência e contratos automatizados. Fases narradas sem prova não entram como concluídas.
        </p>
      </article>
      <article className="rounded-2xl border border-amber-300/15 bg-amber-300/[.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-amber-300">
          Lacuna identificada
        </p>
        <strong className="mt-3 block text-2xl text-white">
          {coverage.unverifiedLegacyGap} fases
        </strong>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          A solicitação menciona {coverage.requestedLegacyPhases}, mas o repositório comprova {coverage.verifiedHistoricalPhases}. A numeração só avança com evidência.
        </p>
      </article>
      <article className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-300">
          Gate atual
        </p>
        <strong className="mt-3 block text-lg text-white">
          {consolidation.completedPhases}/{consolidation.totalPhases} aprovado
        </strong>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          O ZIP {program.name} será criado apenas depois de build, instalação limpa, smoke, segurança e rollback.
        </p>
      </article>
    </div>
  );
}

export function V3000ProgressGovernance() {
  return (
    <div className="grid gap-3 text-sm leading-6 text-slate-400 md:grid-cols-3">
      <p className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
        <strong className="block text-white">Histórico não é release</strong>
        Documentação de fase demonstra intenção e rastreabilidade; não substitui teste funcional.
      </p>
      <p className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
        <strong className="block text-white">Percentual não é estimativa</strong>
        A consolidação usa gates binários e a cobertura usa contagem verificável no repositório.
      </p>
      <p className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
        <strong className="block text-white">ZIP é consequência</strong>
        O artefato nasce somente depois de compilar, instalar e executar o pacote fora da árvore original.
      </p>
    </div>
  );
}
