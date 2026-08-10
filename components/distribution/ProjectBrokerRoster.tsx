"use client";

import { useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty } from "@/components/ui/AtlasUI";
import {
  buildDistributionDecisionTrail,
  buildDistributionRotation,
  distributionEligibility,
  resolveDistributionProjectFilter,
  type DistributionRosterCandidate,
} from "@/lib/crm/distribution-roster";

export type ProjectBrokerRosterItem = DistributionRosterCandidate & {
  name: string;
  managerName: string;
  warningPercent: number;
};

type ProjectOption = {
  id: string;
  name: string;
  developerName: string | null;
  activeCount: number;
  waitingCount: number;
};

export function ProjectBrokerRoster({
  projectId,
  projects,
  brokers,
  working,
  priorityRuleCount = 0,
  onProjectChange,
  onSave,
}: {
  projectId: string;
  projects: ProjectOption[];
  brokers: ProjectBrokerRosterItem[];
  working: boolean;
  priorityRuleCount?: number;
  onProjectChange: (projectId: string) => void;
  onSave: (
    members: Array<{ profileId: string; enabled: boolean; weight: number }>,
  ) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [developerFilter, setDeveloperFilter] = useState("all");
  const [selection, setSelection] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(brokers.map((broker) => [broker.id, broker.enabled])),
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(brokers.map((broker) => [broker.id, broker.weight])),
  );
  const [dirty, setDirty] = useState(false);

  const draftedBrokers = useMemo(
    () =>
      brokers.map((broker) => ({
        ...broker,
        enabled: selection[broker.id] ?? broker.enabled,
        weight: weights[broker.id] ?? broker.weight,
      })),
    [brokers, selection, weights],
  );
  const rotation = useMemo(
    () => buildDistributionRotation(draftedBrokers),
    [draftedBrokers],
  );
  const decisionTrail = useMemo(
    () => buildDistributionDecisionTrail(draftedBrokers),
    [draftedBrokers],
  );
  const nextDecision = decisionTrail.find((decision) => decision.isNext);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return draftedBrokers.filter((broker) => {
      if (onlyAvailable && !distributionEligibility(broker).eligible)
        return false;
      return (
        !term ||
        `${broker.name} ${broker.managerName}`
          .toLocaleLowerCase("pt-BR")
          .includes(term)
      );
    });
  }, [draftedBrokers, onlyAvailable, search]);
  const selectedCount = draftedBrokers.filter(
    (broker) => broker.enabled,
  ).length;
  const developers = useMemo(
    () =>
      [...new Set(projects.map((project) => project.developerName || "Não informada"))]
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [projects],
  );
  const { visibleProjects } = useMemo(
    () =>
      resolveDistributionProjectFilter(
        projects,
        developerFilter,
        projectId,
      ),
    [developerFilter, projectId, projects],
  );
  const activeProject = projects.find((project) => project.id === projectId);

  function changeDeveloper(nextDeveloper: string) {
    const next = resolveDistributionProjectFilter(
      projects,
      nextDeveloper,
      projectId,
    );
    setDeveloperFilter(nextDeveloper);
    if (next.projectId !== projectId) onProjectChange(next.projectId);
  }

  function selectWhere(
    predicate: (broker: ProjectBrokerRosterItem) => boolean,
  ) {
    setSelection(
      Object.fromEntries(
        brokers.map((broker) => [broker.id, predicate(broker)]),
      ),
    );
    setDirty(true);
  }

  function resetDraft() {
    setSelection(
      Object.fromEntries(brokers.map((broker) => [broker.id, broker.enabled])),
    );
    setWeights(
      Object.fromEntries(brokers.map((broker) => [broker.id, broker.weight])),
    );
    setDirty(false);
  }

  async function save() {
    if (selectedCount < 1) return;
    const saved = await onSave(
      draftedBrokers.map((broker) => ({
        profileId: broker.id,
        enabled: broker.enabled,
        weight: broker.weight,
      })),
    );
    if (saved) setDirty(false);
  }

  return (
    <section
      className="overflow-hidden rounded-[26px] border border-cyan-300/15 bg-[#070d19]/80"
      data-distribution-roster="project-scoped"
    >
      <div className="border-b border-white/[.07] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="atlas-eyebrow">Roleta por projeto</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Escolha quem recebe as próximas leads
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              A seleção vale somente para o empreendimento aberto. Presença,
              disponibilidade e capacidade continuam protegendo cada entrega.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                selectWhere(
                  (broker) =>
                    broker.online &&
                    broker.availability === "available" &&
                    broker.totalLoad < broker.maxActiveLeads &&
                    broker.projectLoad < broker.maxProjectLeads,
                )
              }
              className="atlas-button-secondary"
            >
              Selecionar disponíveis
            </button>
            <button
              type="button"
              onClick={() => selectWhere(() => true)}
              className="atlas-button-secondary"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => selectWhere(() => false)}
              className="atlas-button-secondary"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[.12em] text-slate-400">
              1. Incorporadora
            </span>
            <select
              value={developerFilter}
              onChange={(event) => changeDeveloper(event.target.value)}
              disabled={dirty || working}
              aria-describedby="distribution-developer-help"
              title={
                dirty
                  ? "Salve ou desfaça as alterações antes de trocar de incorporadora"
                  : undefined
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
            >
              <option value="all">Todas as incorporadoras</option>
              {developers.map((developer) => (
                <option key={developer} value={developer}>{developer}</option>
              ))}
            </select>
          </label>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[.12em] text-slate-400">
              2. Empreendimento e corretores da roleta
            </p>
            <p
              id="distribution-developer-help"
              className="text-sm text-slate-400"
            >
              Filtre a incorporadora, abra o empreendimento e selecione os corretores que podem receber novas leads.
            </p>
            {activeProject ? (
              <p className="mt-2 text-xs font-medium text-cyan-200">
                Editando agora: {activeProject.name} · {activeProject.developerName || "Incorporadora não informada"}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className="mt-5 flex gap-2 overflow-x-auto pb-2"
          aria-label="Projetos da roleta"
        >
          {visibleProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onProjectChange(project.id)}
              disabled={dirty && project.id !== projectId}
              className={`min-w-[210px] rounded-2xl border p-3 text-left transition ${project.id === projectId ? "border-cyan-300/35 bg-cyan-300/[.09]" : "border-white/[.07] bg-white/[.025] hover:border-white/15"}`}
              aria-pressed={project.id === projectId}
              title={
                dirty && project.id !== projectId
                  ? "Salve ou desfaça as alterações antes de trocar de projeto"
                  : undefined
              }
            >
              <strong className="block truncate text-sm text-white">
                {project.name}
              </strong>
              <span className="mt-1 block truncate text-[11px] text-slate-500">
                {project.developerName || "Incorporadora não informada"}
              </span>
              <span className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-emerald-300">
                  {project.activeCount} recebem
                </span>
                <span
                  className={
                    project.waitingCount ? "text-amber-300" : "text-slate-500"
                  }
                >
                  {project.waitingCount} aguardando
                </span>
              </span>
            </button>
          ))}
          {visibleProjects.length === 0 ? (
            <AtlasEmpty
              title="Nenhum empreendimento nesta incorporadora"
              description="Revise o cadastro do empreendimento ou escolha outra incorporadora."
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-b border-white/[.07] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Buscar corretor</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar corretor ou gerente"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/30"
              />
            </label>
            <button
              type="button"
              onClick={() => setOnlyAvailable((current) => !current)}
              className={
                onlyAvailable
                  ? "atlas-button-primary"
                  : "atlas-button-secondary"
              }
              aria-pressed={onlyAvailable}
            >
              Disponíveis agora
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {filtered.map((broker) => {
              const status = distributionEligibility(broker);
              const loadPercent = Math.min(
                100,
                Math.round(
                  (broker.projectLoad / Math.max(1, broker.maxProjectLeads)) *
                    100,
                ),
              );
              return (
                <article
                  key={broker.id}
                  className={`rounded-2xl border p-4 transition ${broker.enabled ? "border-cyan-300/15 bg-cyan-300/[.035]" : "border-white/[.06] bg-white/[.018] opacity-75"}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={broker.enabled}
                        onChange={(event) => {
                          setSelection((current) => ({
                            ...current,
                            [broker.id]: event.target.checked,
                          }));
                          setDirty(true);
                        }}
                        className="mt-1 h-5 w-5 rounded border-white/20 bg-slate-950 accent-cyan-400"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm text-white">
                            {broker.name}
                          </strong>
                          <AtlasBadge
                            tone={
                              status.eligible
                                ? "success"
                                : broker.enabled
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {status.reason}
                          </AtlasBadge>
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          Time {broker.managerName} · {broker.totalLoad} leads
                          ativas · {broker.projectLoad}/{broker.maxProjectLeads}{" "}
                          neste projeto
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center gap-3 lg:w-[240px]">
                      <div className="min-w-0 flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                          <div
                            className={`h-full rounded-full ${loadPercent >= broker.warningPercent ? "bg-amber-400" : "bg-cyan-400"}`}
                            style={{ width: `${loadPercent}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-slate-600">
                          {loadPercent}% da capacidade do projeto
                        </p>
                      </div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500">
                        Peso
                        <select
                          value={broker.weight}
                          disabled={!broker.enabled || working}
                          onChange={(event) => {
                            setWeights((current) => ({
                              ...current,
                              [broker.id]: Number(event.target.value),
                            }));
                            setDirty(true);
                          }}
                          className="ml-2 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((weight) => (
                            <option key={weight} value={weight}>
                              {weight}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </article>
              );
            })}
            {!filtered.length ? (
              <AtlasEmpty
                reason="no-results"
                title="Nenhum corretor neste filtro"
                description="Limpe a busca ou mostre também quem está offline e ocupado."
              />
            ) : null}
          </div>
        </div>

        <aside className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="atlas-eyebrow">Prévia ao vivo</p>
              <h3 className="mt-1 font-semibold text-white">
                Próximos da roleta
              </h3>
            </div>
            <AtlasBadge tone="info">{rotation.length} aptos agora</AtlasBadge>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            A ordem combina carga do projeto, peso e última entrega. Ela pode
            mudar quando a presença ou a carteira mudar.
          </p>
          <div
            className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.04] p-4"
            aria-live="polite"
            data-distribution-decision="explainable"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-200/70">
                Próxima decisão
              </p>
              <AtlasBadge tone={dirty ? "warning" : "success"}>
                {dirty ? "PRÉVIA NÃO SALVA" : "REGRA ATIVA"}
              </AtlasBadge>
            </div>
            {nextDecision ? (
              <>
                <strong className="mt-2 block text-sm text-white">
                  {nextDecision.candidate.name}
                </strong>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {nextDecision.decisionReason}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/[.04] p-2">
                    <strong className="block text-xs text-white">
                      {nextDecision.projectRemaining}
                    </strong>
                    <span className="text-[9px] text-slate-500">
                      vagas projeto
                    </span>
                  </div>
                  <div className="rounded-xl bg-white/[.04] p-2">
                    <strong className="block text-xs text-white">
                      {nextDecision.totalRemaining}
                    </strong>
                    <span className="text-[9px] text-slate-500">
                      vagas totais
                    </span>
                  </div>
                  <div className="rounded-xl bg-white/[.04] p-2">
                    <strong className="block text-xs text-white">
                      {nextDecision.candidate.weight}x
                    </strong>
                    <span className="text-[9px] text-slate-500">peso</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                Nenhum corretor está apto a receber a próxima lead agora.
              </p>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-white/[.06] bg-white/[.02] px-3 py-2 text-[10px] leading-4 text-slate-500">
            Prioridade ordena a lead; capacidade + peso escolhem o corretor.{" "}
            <span className="text-slate-300">
              {priorityRuleCount}{" "}
              {priorityRuleCount === 1 ? "regra ativa" : "regras ativas"} neste
              projeto.
            </span>
          </div>
          <ol className="mt-4 space-y-2">
            {rotation.slice(0, 8).map((broker, index) => (
              <li
                key={broker.id}
                className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.025] p-3"
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-bold ${index === 0 ? "bg-cyan-300 text-slate-950" : "bg-white/[.06] text-slate-400"}`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-white">
                    {broker.name}
                  </strong>
                  <span className="text-[10px] text-slate-500">
                    carga ponderada{" "}
                    {Math.round(
                      (broker.projectLoad / Math.max(1, broker.weight)) * 10,
                    ) / 10}
                  </span>
                </span>
                {index === 0 ? (
                  <AtlasBadge tone="success">PRÓXIMO</AtlasBadge>
                ) : null}
              </li>
            ))}
          </ol>
          {!rotation.length ? (
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/80">
              {selectedCount
                ? "A equipe está selecionada, mas ninguém reúne disponibilidade e capacidade neste momento."
                : "Selecione ao menos um corretor para formar a roleta deste projeto."}
            </div>
          ) : null}
          <div className="mt-5 border-t border-white/[.07] pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Recebem neste projeto</span>
              <strong className="text-white">{selectedCount}</strong>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={resetDraft}
                disabled={!dirty || working}
                className="atlas-button-secondary flex-1 disabled:opacity-40"
              >
                Desfazer
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || working || !projectId || selectedCount < 1}
                className="atlas-button-primary flex-1 disabled:opacity-40"
              >
                {working ? "Salvando…" : "Salvar roleta"}
              </button>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-600">
              {selectedCount < 1
                ? "Selecione ao menos um corretor. Uma roleta vazia não pode ser salva porque abriria a distribuição para toda a equipe."
                : dirty
                ? "Há alterações pendentes. Salve ou desfaça antes de trocar de projeto."
                : "A configuração dos outros projetos permanece intacta."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
