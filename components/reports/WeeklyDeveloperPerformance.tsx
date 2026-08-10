"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const uuidPattern = /^[0-9a-f-]{36}$/i;

type StageBreakdown = {
  novo: number;
  contato: number;
  qualificacao: number;
  visita: number;
  proposta: number;
  contrato: number;
  ganho: number;
  outros: number;
};

export type WeeklyAcquisitionReport = {
  totals: {
    leads: number;
    assigned: number;
    contacted: number;
    qualified: number;
    visits: number;
    proposals: number;
    wins: number;
    unassigned: number;
    interactions: number;
    spend: number | null;
    cpl: number | null;
    costPerQualified: number | null;
    costPerWin: number | null;
    campaigns: number;
    developers: number;
    contactRate: number | null;
    leadToWinRate: number | null;
  };
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    responsibleDeveloperId: string | null;
    responsibleDeveloper: string;
    leads: number;
    contacted: number;
    qualified: number;
    visits: number;
    proposals: number;
    wins: number;
    spend: number | null;
    cpl: number | null;
    costPerQualified: number | null;
    costPerWin: number | null;
    leadToWinRate: number | null;
    costSource: string;
  }>;
  developers: Array<{
    developerId: string | null;
    developer: string;
    leads: number;
    contacted: number;
    qualified: number;
    visits: number;
    proposals: number;
    wins: number;
    spend: number | null;
    cpl: number | null;
    costPerQualified: number | null;
    costPerWin: number | null;
    campaigns: number;
    brokers: number;
    projects: number;
    leadToWinRate: number | null;
    allocation: string;
  }>;
  brokerResults: Array<{
    developerId: string | null;
    developer: string;
    developmentId: string | null;
    projectName: string;
    campaignId: string;
    campaignName: string;
    brokerId: string | null;
    brokerName: string;
    leads: number;
    contacted: number;
    qualified: number;
    visits: number;
    proposals: number;
    wins: number;
    interactions: number;
    contactRate: number | null;
    leadToWinRate: number | null;
    stages: StageBreakdown;
  }>;
  projectResults: Array<{
    developerId: string | null;
    developer: string;
    developmentId: string | null;
    projectName: string;
    brokers: number;
    leads: number;
    assigned: number;
    contacted: number;
    qualified: number;
    visits: number;
    proposals: number;
    wins: number;
    leadToWinRate: number | null;
    stages: StageBreakdown;
    service: {
      measured: number;
      averageFirstContactMinutes: number | null;
      within5Minutes: number;
      within15Minutes: number;
      within30Minutes: number;
      within15Rate: number | null;
      within30Rate: number | null;
      coverageRate: number | null;
    };
  }>;
  projectBrokerResults: Array<{
    developerId: string | null;
    developer: string;
    developmentId: string | null;
    projectName: string;
    brokerId: string | null;
    brokerName: string;
    leads: number;
    interactions: number;
    qualified: number;
    wins: number;
    contactRate: number | null;
    leadToWinRate: number | null;
    stages: StageBreakdown;
  }>;
  dailyDistribution: Array<{
    date: string;
    developerId: string | null;
    developer: string;
    developmentId: string | null;
    projectName: string;
    brokerId: string | null;
    brokerName: string;
    leads: number;
    assigned: number;
    contacted: number;
  }>;
  warnings: string[];
  period: { start: string; end: string };
  service: {
    measured: number;
    averageFirstContactMinutes: number | null;
    within5Minutes: number;
    within15Minutes: number;
    within30Minutes: number;
    within15Rate: number | null;
    within30Rate: number | null;
    coverageRate: number | null;
  };
  dataQuality: {
    completeAttribution: number;
    missingProject: number;
    missingDeveloper: number;
    missingCampaign: number;
    missingSource: number;
    unassigned: number;
    projectCoverageRate: number | null;
    developerCoverageRate: number | null;
    campaignCoverageRate: number | null;
    sourceCoverageRate: number | null;
  };
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const percentage = (value: number | null) =>
  value === null
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const dateRange = (start: string, end: string) => {
  const format = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value.slice(0, 10)}T12:00:00`));

  return `${format(start)} — ${format(end)}`;
};

const rate = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

const developerKey = (developerId: string | null, developer: string) =>
  developerId || `name:${developer}`;

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const fileSafeSegment = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72) || "recorte";

const bottleneckRecommendation = (key: string) => {
  switch (key) {
    case "Sem contato":
      return "Priorize o primeiro contato e registre a próxima ação antes de ampliar a verba.";
    case "Contato → qualificação":
      return "Padronize objetivo, prazo e forma de pagamento para aumentar a qualificação.";
    case "Qualificação → visita":
      return "Concentre o time em converter interesse qualificado em visita agendada.";
    case "Visita → proposta":
      return "Registre o retorno da visita e ofereça a próxima etapa comercial sem demora.";
    case "Proposta → venda":
      return "Revise documentação, condições e fluxo de pagamento das propostas em aberto.";
    default:
      return "Revise o recorte com a liderança antes de alterar a estratégia comercial.";
  }
};

const bottleneckStatus = (key: string) => {
  switch (key) {
    case "Sem contato":
      return "novo";
    case "Contato → qualificação":
      return "contato";
    case "Qualificação → visita":
      return "qualificacao";
    case "Visita → proposta":
      return "visita";
    case "Proposta → venda":
      return "proposta";
    default:
      return null;
  }
};

const campaignLargestQueue = (campaign: {
  leads: number;
  contacted: number;
  qualified: number;
  visits: number;
  proposals: number;
  wins: number;
}) => {
  const queues = [
    { label: "Sem contato", value: campaign.leads - campaign.contacted },
    {
      label: "Contato → qualificação",
      value: campaign.contacted - campaign.qualified,
    },
    {
      label: "Qualificação → visita",
      value: campaign.qualified - campaign.visits,
    },
    { label: "Visita → proposta", value: campaign.visits - campaign.proposals },
    { label: "Proposta → venda", value: campaign.proposals - campaign.wins },
  ].sort((first, second) => second.value - first.value);

  return {
    label: queues[0]?.label || "Sem dados",
    value: Math.max(0, queues[0]?.value || 0),
  };
};

export function WeeklyDeveloperPerformance({
  report,
}: {
  report: WeeklyAcquisitionReport;
}) {
  const [developerFilter, setDeveloperFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const developerOptions = useMemo(
    () =>
      report.developers
        .map((item) => ({
          id: developerKey(item.developerId, item.developer),
          name: item.developer,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [report.developers],
  );
  const projectOptions = useMemo(
    () =>
      report.projectResults
        .filter(
          (item) =>
            developerFilter === "all" ||
            developerKey(item.developerId, item.developer) === developerFilter,
        )
        .map((item) => ({
          id: item.developmentId || "sem-projeto",
          name: item.projectName,
        }))
        .filter(
          (item, index, rows) =>
            rows.findIndex((row) => row.id === item.id) === index,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [developerFilter, report.projectResults],
  );
  const selectedScope = useMemo(() => {
    const developer = developerOptions.find(
      (item) => item.id === developerFilter,
    );
    const project = projectOptions.find((item) => item.id === projectFilter);
    const parts = [developer?.name, project?.name].filter(
      (item): item is string => Boolean(item),
    );

    return parts.length > 0
      ? parts.join(" · ")
      : "Todas as incorporadoras e projetos";
  }, [developerFilter, developerOptions, projectFilter, projectOptions]);
  const displayedPeriod = useMemo(
    () => dateRange(report.period.start, report.period.end),
    [report.period.end, report.period.start],
  );
  const leadsInMeasuredPeriodHref = (filters: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    params.set("created_after", report.period.start);
    params.set("created_before", report.period.end);
    return `/leads?${params.toString()}`;
  };
  const financialScopeNote =
    projectFilter !== "all"
      ? "O relatório não rateia investimento por projeto sem uma regra de mídia registrada."
      : developerFilter !== "all"
        ? "O financeiro considera as campanhas vinculadas à incorporadora selecionada no período."
        : "O financeiro considera todas as campanhas conectadas no período.";
  const campaignScopeNote =
    projectFilter !== "all"
      ? "Campanhas permanecem no total do período; o recorte de projeto é aplicado ao atendimento por corretor."
      : developerFilter !== "all"
        ? "Campanhas, atendimento e resultado exibem somente a incorporadora selecionada no período."
        : "Campanhas, atendimento e resultado consideram todo o período selecionado.";
  const visibleProjects = useMemo(
    () =>
      report.projectResults.filter(
        (item) =>
          (developerFilter === "all" ||
            developerKey(item.developerId, item.developer) ===
              developerFilter) &&
          (projectFilter === "all" ||
            (item.developmentId || "sem-projeto") === projectFilter),
      ),
    [developerFilter, projectFilter, report.projectResults],
  );
  const visibleProjectBrokers = useMemo(
    () =>
      report.projectBrokerResults.filter(
        (item) =>
          (developerFilter === "all" ||
            developerKey(item.developerId, item.developer) ===
              developerFilter) &&
          (projectFilter === "all" ||
            (item.developmentId || "sem-projeto") === projectFilter),
      ),
    [developerFilter, projectFilter, report.projectBrokerResults],
  );
  const unassignedProjectBrokers = useMemo(
    () =>
      visibleProjectBrokers
        .filter((item) => !item.brokerId && item.leads > 0)
        .sort((first, second) => second.leads - first.leads),
    [visibleProjectBrokers],
  );
  const interactionsByProject = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of visibleProjectBrokers) {
      const key = row.developmentId || "sem-projeto";
      totals.set(key, (totals.get(key) || 0) + row.interactions);
    }
    return totals;
  }, [visibleProjectBrokers]);
  const silentAssignedProjects = useMemo(
    () =>
      visibleProjects
        .filter(
          (item) =>
            item.leads > 0 &&
            item.assigned >= item.leads &&
            !(interactionsByProject.get(item.developmentId || "sem-projeto") || 0),
        )
        .sort((first, second) => second.leads - first.leads),
    [interactionsByProject, visibleProjects],
  );
  const projectServiceWatchlist = useMemo(
    () =>
      visibleProjects
        .filter(
          (project) =>
            project.service.measured > 0 &&
            project.service.averageFirstContactMinutes !== null,
        )
        .map((project) => {
          const slowAverage = (project.service.averageFirstContactMinutes ?? 0) > 15;
          const lowWithin15Rate = (project.service.within15Rate ?? 100) < 50;
          const needsReview =
            slowAverage || lowWithin15Rate;
          return {
            ...project,
            needsReview,
            nextDecision: needsReview
              ? "Rever tempo do primeiro contato"
              : "Acompanhar cadência de atendimento",
            reviewReason: !needsReview
              ? "SLA dentro da referência definida"
              : slowAverage && lowWithin15Rate
                ? "Média acima de 15 min e menos de 50% em até 15 min"
                : slowAverage
                  ? "Média acima de 15 min"
                  : "Menos de 50% em até 15 min",
          };
        })
        .sort(
          (first, second) =>
            Number(second.needsReview) - Number(first.needsReview) ||
            (second.service.averageFirstContactMinutes ?? 0) -
              (first.service.averageFirstContactMinutes ?? 0) ||
            second.leads - first.leads,
        )
        .slice(0, 3),
    [visibleProjects],
  );
  const projectFunnelWatchlist = useMemo(
    () =>
      visibleProjects
        .filter((project) => project.leads > 0)
        .map((project) => {
          const largestQueue = campaignLargestQueue(project);
          return {
            ...project,
            largestQueue,
            nextDecision: bottleneckRecommendation(largestQueue.label),
            status: bottleneckStatus(largestQueue.label),
          };
        })
        .filter((project) => project.largestQueue.value > 0)
        .sort(
          (first, second) =>
            second.largestQueue.value - first.largestQueue.value ||
            second.leads - first.leads,
        )
        .slice(0, 3),
    [visibleProjects],
  );
  const filteredDailyDistribution = useMemo(
    () =>
      report.dailyDistribution
        .filter(
          (item) =>
            (developerFilter === "all" ||
              developerKey(item.developerId, item.developer) ===
                developerFilter) &&
            (projectFilter === "all" ||
              (item.developmentId || "sem-projeto") === projectFilter),
        )
        .map((item) => ({
          ...item,
          withoutFirstContact: Math.max(0, item.leads - item.contacted),
        })),
    [developerFilter, projectFilter, report.dailyDistribution],
  );
  const visibleDailyDistribution = useMemo(
    () =>
      filteredDailyDistribution
        .slice()
        .sort(
          (first, second) =>
            second.date.localeCompare(first.date) ||
            second.withoutFirstContact - first.withoutFirstContact ||
            second.leads - first.leads,
        )
        .slice(0, 8),
    [filteredDailyDistribution],
  );
  const dailyDistributionSummary = useMemo(() => {
    const totalLeads = filteredDailyDistribution.reduce(
      (sum, row) => sum + row.leads,
      0,
    );
    const unassigned = filteredDailyDistribution
      .filter((row) => !row.brokerId)
      .reduce((sum, row) => sum + row.leads, 0);
    const assignedRows = filteredDailyDistribution.filter(
      (row) => Boolean(row.brokerId),
    );
    const pendingFirstContact = assignedRows.reduce(
      (sum, row) => sum + row.withoutFirstContact,
      0,
    );

    return {
      totalLeads,
      unassigned,
      assigned: Math.max(0, totalLeads - unassigned),
      pendingFirstContact,
    };
  }, [filteredDailyDistribution]);
  const brokerDailyWorkload = useMemo(() => {
    const workload = new Map<
      string,
      {
        brokerId: string;
        brokerName: string;
        leads: number;
        contacted: number;
        days: Set<string>;
      }
    >();

    for (const row of filteredDailyDistribution) {
      if (!row.brokerId) continue;

      const current = workload.get(row.brokerId) || {
        brokerId: row.brokerId,
        brokerName: row.brokerName,
        leads: 0,
        contacted: 0,
        days: new Set<string>(),
      };
      current.leads += row.leads;
      current.contacted += row.contacted;
      current.days.add(row.date);
      workload.set(row.brokerId, current);
    }

    return [...workload.values()]
      .map((row) => ({
        ...row,
        activeDays: row.days.size,
        withoutFirstContact: Math.max(0, row.leads - row.contacted),
        firstContactRate:
          row.leads > 0 ? Math.round((row.contacted / row.leads) * 100) : 0,
      }))
      .sort(
        (first, second) =>
          second.withoutFirstContact - first.withoutFirstContact ||
          second.leads - first.leads ||
          first.brokerName.localeCompare(second.brokerName),
      );
  }, [filteredDailyDistribution]);
  const visibleBrokerDailyWorkload = useMemo(
    () => brokerDailyWorkload.slice(0, 5),
    [brokerDailyWorkload],
  );
  const selection = useMemo(() => {
    const totals = visibleProjects.reduce(
      (sum, row) => ({
        leads: sum.leads + row.leads,
        assigned: sum.assigned + row.assigned,
        contacted: sum.contacted + row.contacted,
        qualified: sum.qualified + row.qualified,
        visits: sum.visits + row.visits,
        proposals: sum.proposals + row.proposals,
        wins: sum.wins + row.wins,
      }),
      {
        leads: 0,
        assigned: 0,
        contacted: 0,
        qualified: 0,
        visits: 0,
        proposals: 0,
        wins: 0,
      },
    );
    const funnel = [
      { key: "Sem contato", value: totals.leads - totals.contacted },
      {
        key: "Contato → qualificação",
        value: totals.contacted - totals.qualified,
      },
      {
        key: "Qualificação → visita",
        value: totals.qualified - totals.visits,
      },
      { key: "Visita → proposta", value: totals.visits - totals.proposals },
      { key: "Proposta → venda", value: totals.proposals - totals.wins },
    ].sort((a, b) => b.value - a.value);
    return {
      ...totals,
      unassigned: Math.max(0, totals.leads - totals.assigned),
      contactRate: rate(totals.contacted, totals.leads),
      qualificationRate: rate(totals.qualified, totals.leads),
      winRate: rate(totals.wins, totals.leads),
      bottleneck: {
        ...funnel[0],
        recommendation: bottleneckRecommendation(funnel[0]?.key ?? ""),
      },
    };
  }, [visibleProjects]);
  const visibleDevelopers = useMemo(
    () =>
      report.developers.filter(
        (item) =>
          developerFilter === "all" ||
          developerKey(item.developerId, item.developer) === developerFilter,
      ),
    [developerFilter, report.developers],
  );
  const visibleCampaigns = useMemo(
    () =>
      report.campaigns.filter(
        (item) =>
          developerFilter === "all" ||
          developerKey(
            item.responsibleDeveloperId,
            item.responsibleDeveloper,
          ) === developerFilter,
      ),
    [developerFilter, report.campaigns],
  );
  const visibleBrokerResults = useMemo(
    () =>
      report.brokerResults.filter(
        (item) =>
          (developerFilter === "all" ||
            developerKey(item.developerId, item.developer) ===
              developerFilter) &&
          (projectFilter === "all" ||
            (item.developmentId || "sem-projeto") === projectFilter),
      ),
    [developerFilter, projectFilter, report.brokerResults],
  );
  const brokerOperationalPriorities = useMemo(() => {
    const brokers = new Map<
      string,
      {
        brokerId: string;
        brokerName: string;
        developer: string;
        leads: number;
        contacted: number;
        interactions: number;
        projects: Set<string>;
      }
    >();

    for (const row of visibleBrokerResults) {
      if (!row.brokerId) continue;
      const current = brokers.get(row.brokerId) || {
        brokerId: row.brokerId,
        brokerName: row.brokerName,
        developer: row.developer,
        leads: 0,
        contacted: 0,
        interactions: 0,
        projects: new Set<string>(),
      };
      current.leads += row.leads;
      current.contacted += row.contacted;
      current.interactions += row.interactions;
      current.projects.add(row.projectName);
      brokers.set(row.brokerId, current);
    }

    return [...brokers.values()]
      .map((broker) => {
        const unattended = Math.max(0, broker.leads - broker.contacted);
        const nextDecision =
          broker.interactions === 0 && broker.leads > 0
            ? `Revisar atendimento · ${broker.leads} lead${broker.leads === 1 ? "" : "s"}`
            : `Priorizar contato · ${unattended} lead${unattended === 1 ? "" : "s"}`;

        return { ...broker, unattended, nextDecision };
      })
      .filter((broker) => broker.interactions === 0 || broker.unattended > 0)
      .sort(
        (first, second) =>
          Number(second.interactions === 0) - Number(first.interactions === 0) ||
          second.unattended - first.unattended ||
          second.leads - first.leads ||
          first.brokerName.localeCompare(second.brokerName),
      )
      .slice(0, 3);
  }, [visibleBrokerResults]);
  const campaignExecutionById = useMemo(() => {
    const execution = new Map<
      string,
      { assignedBrokers: Set<string>; activeBrokers: Set<string>; interactions: number }
    >();

    for (const row of report.brokerResults) {
      if (
        developerFilter !== "all" &&
        developerKey(row.developerId, row.developer) !== developerFilter
      )
        continue;

      const current = execution.get(row.campaignId) || {
        assignedBrokers: new Set<string>(),
        activeBrokers: new Set<string>(),
        interactions: 0,
      };
      if (row.brokerId) {
        current.assignedBrokers.add(row.brokerId);
        if (row.interactions > 0) current.activeBrokers.add(row.brokerId);
      }
      current.interactions += row.interactions;
      execution.set(row.campaignId, current);
    }

    return execution;
  }, [developerFilter, report.brokerResults]);
  const scopedInteractions = useMemo(
    () =>
      visibleBrokerResults.reduce(
        (total, row) => total + row.interactions,
        0,
      ),
    [visibleBrokerResults],
  );
  const interactionRhythm = useMemo(
    () =>
      selection.leads > 0
        ? Math.round((scopedInteractions / selection.leads) * 10) / 10
        : null,
    [scopedInteractions, selection.leads],
  );
  const scopedFinancial = useMemo(() => {
    if (projectFilter !== "all") {
      return {
        spend: null,
        cpl: null,
        note: "não rateado por projeto",
      };
    }

    const observedRows = visibleDevelopers.filter(
      (developer) => developer.spend !== null,
    );
    const spend = observedRows.reduce(
      (total, developer) => total + (developer.spend ?? 0),
      0,
    );
    const leads = observedRows.reduce(
      (total, developer) => total + developer.leads,
      0,
    );
    const hasPartialCoverage = observedRows.length < visibleDevelopers.length;

    return {
      spend: observedRows.length > 0 ? spend : null,
      cpl: observedRows.length > 0 && leads > 0 ? spend / leads : null,
      note: hasPartialCoverage
        ? "custo parcial: há campanhas sem mídia conectada"
        : "mídia conectada no recorte",
    };
  }, [projectFilter, visibleDevelopers]);
  const hasOperationalScope = developerFilter !== "all" || projectFilter !== "all";
  const bottleneckActionHref = useMemo(() => {
    const status = bottleneckStatus(selection.bottleneck.key);
    if (!status || projectFilter === "all") return null;
    return leadsInMeasuredPeriodHref({
      project: projectFilter,
      status,
    });
  }, [projectFilter, selection.bottleneck.key]);
  const clearOperationalScope = () => {
    setDeveloperFilter("all");
    setProjectFilter("all");
  };
  function exportReport() {
    const rows: unknown[][] = [
      ["RELATÓRIO SEMANAL POR INCORPORADORA"],
      ["Período", report.period.start, report.period.end],
      ["Recorte de atendimento", selectedScope],
      ["Escopo financeiro", financialScopeNote],
      ["Escopo de campanhas", campaignScopeNote],
      [],
      ["QUALIDADE DA ATRIBUIÇÃO (COORTE COMPLETA DO PERÍODO)"],
      ["Leads com atribuição completa", report.dataQuality.completeAttribution],
      ["Leads sem projeto", report.dataQuality.missingProject],
      ["Leads sem incorporadora", report.dataQuality.missingDeveloper],
      ["Leads sem campanha", report.dataQuality.missingCampaign],
      ["Leads sem origem", report.dataQuality.missingSource],
      ["Leads sem corretor", report.dataQuality.unassigned],
      [],
      ["DISTRIBUIÇÃO PENDENTE POR PROJETO"],
      ["Incorporadora", "Projeto", "Leads sem corretor"],
      ...unassignedProjectBrokers.map((row) => [
        row.developer,
        row.projectName,
        row.leads,
      ]),
      ...(unassignedProjectBrokers.length === 0
        ? [["—", "Nenhuma pendência no recorte", 0]]
        : []),
      [],
      ["ATENDIMENTO SEM REGISTRO POR PROJETO"],
      ["Incorporadora", "Projeto", "Leads distribuídas", "Interações"],
      ...silentAssignedProjects.map((row) => [
        row.developer,
        row.projectName,
        row.leads,
        interactionsByProject.get(row.developmentId || "sem-projeto") || 0,
      ]),
      ...(silentAssignedProjects.length === 0
        ? [["—", "Nenhum projeto sem interação no recorte", 0, 0]]
        : []),
      [],
      ["SLA POR PROJETO (APENAS AMOSTRA MEDIDA)"],
      [
        "Incorporadora",
        "Projeto",
        "Leads no período",
        "Leads com SLA medido",
        "Média do primeiro contato (min)",
        "Até 15 min",
        "Próxima decisão",
      ],
      ...visibleProjects.map((row) => [
        row.developer,
        row.projectName,
        row.leads,
        row.service.measured,
        row.service.averageFirstContactMinutes ?? "Não medido",
        percentage(row.service.within15Rate),
        row.service.measured === 0
          ? "Registrar o primeiro contato para medir o SLA"
          : (row.service.averageFirstContactMinutes ?? 0) > 15 ||
              (row.service.within15Rate ?? 100) < 50
            ? "Rever tempo do primeiro contato"
            : "Acompanhar cadência de atendimento",
      ]),
      ...(visibleProjects.length === 0
        ? [["—", "Nenhum projeto no recorte", 0, 0, "Não medido", "—", ""]]
        : []),
      [],
      ["GARGALO DO FUNIL POR PROJETO"],
      [
        "Incorporadora",
        "Projeto",
        "Maior fila comercial",
        "Leads na fila",
        "Próxima decisão",
      ],
      ...projectFunnelWatchlist.map((row) => [
        row.developer,
        row.projectName,
        row.largestQueue.label,
        row.largestQueue.value,
        row.nextDecision,
      ]),
      ...(projectFunnelWatchlist.length === 0
        ? [["—", "Nenhum gargalo no recorte", "—", 0, ""]]
        : []),
      [],
      ["DISTRIBUIÇÃO DIÁRIA POR PROJETO E CORRETOR"],
      ["Resumo no recorte"],
      ["Leads criadas", dailyDistributionSummary.totalLeads],
      ["Sem responsável", dailyDistributionSummary.unassigned],
      ["Com responsável", dailyDistributionSummary.assigned],
      [
        "Com responsável e sem primeiro contato",
        dailyDistributionSummary.pendingFirstContact,
      ],
      [],
      [
        "Data",
        "Incorporadora",
        "Projeto",
        "Corretor",
        "Leads",
        "Sem primeiro contato",
        "Próxima decisão",
      ],
      ...filteredDailyDistribution.map((row) => [
        row.date,
        row.developer,
        row.projectName,
        row.brokerName,
        row.leads,
        row.withoutFirstContact,
        !row.brokerId
          ? "Distribuir a carteira"
          : row.withoutFirstContact > 0
            ? "Registrar o primeiro contato"
            : "Acompanhar a carteira",
      ]),
      ...(filteredDailyDistribution.length === 0
        ? [["—", "Nenhuma lead com data válida no recorte", "", "", 0, 0, ""]]
        : []),
      [],
      ["CARGA DIÁRIA POR CORRETOR"],
      [
        "Corretor",
        "Leads criadas com responsável",
        "Dias com novas leads",
        "Sem primeiro contato",
        "Próxima decisão",
      ],
      ...brokerDailyWorkload.map((row) => [
        row.brokerName,
        row.leads,
        row.activeDays,
        row.withoutFirstContact,
        row.withoutFirstContact > 0
          ? "Registrar o primeiro contato"
          : "Acompanhar a carteira",
      ]),
      ...(brokerDailyWorkload.length === 0
        ? [["—", 0, 0, 0, "Nenhuma distribuição vinculada a corretor"]]
        : []),
      [],
      ["PRIORIDADES OPERACIONAIS POR INCORPORADORA"],
      [
        "Incorporadora",
        "Projeto de referência",
        "Leads no período",
        "Próxima decisão",
        "Orientação operacional",
      ],
      ...allDeveloperOperationalPriorities.map((row) => [
        row.developer.developer,
        row.actionProject?.projectName || "Projeto não vinculado",
        row.leads,
        row.nextDecision.label,
        row.nextDecision.description,
      ]),
      ...(allDeveloperOperationalPriorities.length === 0
        ? [["—", "Nenhuma prioridade operacional no recorte", 0, "", ""]]
        : []),
      [],
      ["CAMPANHAS E INCORPORADORA RESPONSÁVEL"],
      [
        "Campanha",
        "Incorporadora responsável",
        "Leads",
        "Sem atendimento registrado",
        "Cobertura de atendimento",
        "Corretores atribuídos",
        "Corretores com interação",
        "Corretores sem interação",
        "Interações registradas",
        "Maior fila comercial",
        "Próxima decisão",
        "Orientação operacional",
        "Qualificadas",
        "Visitas",
        "Propostas",
        "Vendas",
        "Investimento",
        "CPL",
      ],
      ...observedCampaignJourneys.map((row) => [
        row.campaignName,
        row.responsibleDeveloper,
        row.leads,
        Math.max(0, row.leads - row.contacted),
        row.leads > 0
          ? `${Math.round((row.contacted / row.leads) * 1000) / 10}%`
          : "",
        campaignExecutionById.get(row.campaignId)?.assignedBrokers.size || 0,
        campaignExecutionById.get(row.campaignId)?.activeBrokers.size || 0,
        Math.max(
          0,
          (campaignExecutionById.get(row.campaignId)?.assignedBrokers.size || 0) -
            (campaignExecutionById.get(row.campaignId)?.activeBrokers.size || 0),
        ),
        campaignExecutionById.get(row.campaignId)?.interactions || 0,
        `${campaignLargestQueue(row).label}: ${campaignLargestQueue(row).value}`,
        row.nextDecision.label,
        row.nextDecision.description,
        row.qualified,
        row.visits,
        row.proposals,
        row.wins,
        row.spend === null ? "Não conectado" : row.spend,
        row.cpl === null ? "" : row.cpl,
      ]),
      [],
      [
        "Incorporadora",
        "Gasto",
        "Leads",
        "Corretores",
        "Contato",
        "Qualificação",
        "Visita",
        "Proposta",
        "Venda",
        "Conversão",
      ],
      ...visibleDevelopers.map((row) => [
        row.developer,
        row.spend === null ? "Não conectado" : row.spend,
        row.leads,
        row.brokers,
        row.contacted,
        row.qualified,
        row.visits,
        row.proposals,
        row.wins,
        row.leadToWinRate === null ? "" : `${row.leadToWinRate}%`,
      ]),
      [],
      ["DETALHE POR PROJETO E CORRETOR"],
      [
        "Incorporadora",
        "Projeto",
        "Corretor",
        "Leads recebidas",
        "Interações registradas",
        "Sem contato",
        "Novas",
        "Contato",
        "Qualificação",
        "Visita",
        "Proposta",
        "Contrato",
        "Venda",
        "Taxa de contato",
        "Conversão",
      ],
      ...visibleProjectBrokers.map((row) => [
        row.developer,
        row.projectName,
        row.brokerName,
        row.leads,
        row.interactions,
        Math.max(0, row.leads - row.stages.contato),
        row.stages.novo,
        row.stages.contato,
        row.stages.qualificacao,
        row.stages.visita,
        row.stages.proposta,
        row.stages.contrato,
        row.stages.ganho,
        row.contactRate === null ? "" : `${row.contactRate}%`,
        row.leadToWinRate === null ? "" : `${row.leadToWinRate}%`,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-one-incorporadoras-${fileSafeSegment(selectedScope)}-${report.period.start.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function printReport() {
    const previousTitle = document.title;
    document.title = `Atlas One — ${selectedScope} — ${displayedPeriod}`;
    window.print();
    document.title = previousTitle;
  }
  const minimumDescriptiveSample = 30;
  const cards: Array<[string, string | number, string]> = [
    [
      "Leads captadas",
      selection.leads,
      `${selection.unassigned} sem corretor · ${hasOperationalScope ? "recorte selecionado" : "coorte total"}`,
    ],
    [
      "Contato registrado",
      selection.contacted,
      percentage(selection.contactRate),
    ],
    [
      "Qualificadas",
      selection.qualified,
      hasOperationalScope
        ? "resultado do recorte"
        : report.totals.costPerQualified === null
          ? "custo não conectado"
          : `${money(report.totals.costPerQualified)} por qualificada`,
    ],
    ["Visitas", selection.visits, "etapa confirmada no CRM"],
    ["Propostas", selection.proposals, "etapa confirmada no CRM"],
    ["Vendas", selection.wins, percentage(selection.winRate)],
    [
      "Interações",
      scopedInteractions,
      interactionRhythm === null
        ? "sem leads no recorte"
        : `${interactionRhythm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por lead · ${hasOperationalScope ? "recorte selecionado" : "coorte total"}`,
    ],
    [
      "Investimento",
      scopedFinancial.spend === null
        ? "Não rateado"
        : money(scopedFinancial.spend),
      scopedFinancial.cpl === null
        ? scopedFinancial.note
        : `CPL ${money(scopedFinancial.cpl)} · ${scopedFinancial.note}`,
    ],
  ];
  const qualityActions = [
    {
      key: "missing-project",
      value: report.dataQuality.missingProject,
      label: "sem projeto",
      coverage: report.dataQuality.projectCoverageRate,
      coverageLabel: "com projeto",
      action: "Revisar carteira",
      href: leadsInMeasuredPeriodHref({ quality: "missing_project" }),
    },
    {
      key: "missing-developer",
      value: report.dataQuality.missingDeveloper,
      label: "sem incorporadora",
      coverage: report.dataQuality.developerCoverageRate,
      coverageLabel: "com incorporadora",
      action: "Corrigir cadastro",
      href: "/developments/developers",
    },
    {
      key: "missing-campaign",
      value: report.dataQuality.missingCampaign,
      label: "sem campanha",
      coverage: report.dataQuality.campaignCoverageRate,
      coverageLabel: "com campanha",
      action: "Revisar carteira",
      href: leadsInMeasuredPeriodHref({ quality: "missing_campaign" }),
    },
    {
      key: "missing-source",
      value: report.dataQuality.missingSource,
      label: "sem origem",
      coverage: report.dataQuality.sourceCoverageRate,
      coverageLabel: "com origem",
      action: "Revisar carteira",
      href: leadsInMeasuredPeriodHref({ quality: "missing_source" }),
    },
    {
      key: "unassigned",
      value: report.dataQuality.unassigned,
      label: "sem corretor",
      coverage: rate(report.totals.assigned, report.totals.leads),
      coverageLabel: "distribuídas",
      action: "Abrir distribuição",
      href: leadsInMeasuredPeriodHref({ attention: "unassigned" }),
    },
  ];
  const pendingQualityActions = qualityActions.filter((item) => item.value > 0);

  const observedCampaignJourneys = visibleCampaigns
    .map((campaign) => {
      const assignedBrokers =
        campaignExecutionById.get(campaign.campaignId)?.assignedBrokers.size || 0;
      const activeBrokers =
        campaignExecutionById.get(campaign.campaignId)?.activeBrokers.size || 0;
      const unattendedLeads = Math.max(0, campaign.leads - campaign.contacted);
      const largestQueue = campaignLargestQueue(campaign);
      const unassignedLeads = assignedBrokers === 0 ? campaign.leads : 0;
      const inactiveBrokers = Math.max(0, assignedBrokers - activeBrokers);
      const nextDecision =
        campaign.campaignId === "sem-campanha"
          ? {
              label: `Corrigir atribuição · ${campaign.leads} lead${campaign.leads === 1 ? "" : "s"}`,
              description:
                "Registre a campanha de origem antes de avaliar o resultado comercial.",
            }
          : assignedBrokers === 0 && campaign.leads > 0
            ? {
                label: `Definir distribuição · ${campaign.leads} lead${campaign.leads === 1 ? "" : "s"}`,
                description:
                  "Escolha os corretores responsáveis antes de cobrar atendimento ou conversão.",
              }
            : unattendedLeads > 0
              ? {
                  label: `Priorizar primeiro contato · ${unattendedLeads} lead${unattendedLeads === 1 ? "" : "s"}`,
                  description: bottleneckRecommendation("Sem contato"),
                }
              : largestQueue.value > 0
                ? {
                    label: `Tratar fila: ${largestQueue.label} · ${largestQueue.value}`,
                    description: bottleneckRecommendation(largestQueue.label),
                  }
                : {
                    label: "Revisar jornada registrada",
                    description:
                      "A coorte não tem uma fila dominante; valide o próximo passo com a liderança.",
                  };
      const leadRosterFilters: Record<string, string> | null =
        campaign.campaignId === "sem-campanha"
          ? { quality: "missing_campaign" }
          : !uuidPattern.test(campaign.campaignId)
            ? null
            : assignedBrokers === 0 && campaign.leads > 0
              ? { campaign: campaign.campaignId, attention: "unassigned" }
              : unattendedLeads > 0
                ? { campaign: campaign.campaignId, status: "novo" }
                : largestQueue.value > 0 && bottleneckStatus(largestQueue.label)
                  ? {
                      campaign: campaign.campaignId,
                      status: bottleneckStatus(largestQueue.label)!,
                    }
                  : { campaign: campaign.campaignId };
      const leadRosterLabel =
        campaign.campaignId === "sem-campanha"
          ? "Corrigir atribuição →"
          : assignedBrokers === 0 && campaign.leads > 0
            ? "Abrir fila sem corretor →"
            : unattendedLeads > 0
              ? "Abrir leads sem contato →"
              : largestQueue.value > 0 && bottleneckStatus(largestQueue.label)
                ? "Abrir etapa crítica →"
                : "Abrir carteira da campanha →";

      return {
        ...campaign,
        unattendedLeads: Math.max(0, campaign.leads - campaign.contacted),
        contactRate:
          campaign.leads > 0
            ? Math.round((campaign.contacted / campaign.leads) * 1000) / 10
            : null,
        activeBrokers,
        assignedBrokers,
        interactions:
          campaignExecutionById.get(campaign.campaignId)?.interactions || 0,
        largestQueue,
        nextDecision,
        leadRosterHref: leadRosterFilters
          ? leadsInMeasuredPeriodHref(leadRosterFilters)
          : null,
        leadRosterLabel,
        attentionOrder:
          unassignedLeads * 5 +
          unattendedLeads * 3 +
          inactiveBrokers * 2 +
          largestQueue.value,
      };
    })
    .sort(
      (first, second) =>
        second.attentionOrder - first.attentionOrder ||
        second.leads - first.leads ||
        first.campaignName.localeCompare(second.campaignName),
    );

  const priorityCampaigns = observedCampaignJourneys
    .filter((campaign) => campaign.leads > 0)
    .slice(0, 3);
  const campaignJourneyById = new Map(
    observedCampaignJourneys.map((campaign) => [campaign.campaignId, campaign]),
  );

  const allDeveloperOperationalPriorities = visibleDevelopers
    .map((developer) => {
      const projects = visibleProjects.filter(
        (project) =>
          developerKey(project.developerId, project.developer) ===
          developerKey(developer.developerId, developer.developer),
      );
      const totals = projects.reduce(
        (sum, project) => ({
          leads: sum.leads + project.leads,
          assigned: sum.assigned + project.assigned,
          contacted: sum.contacted + project.contacted,
          qualified: sum.qualified + project.qualified,
          visits: sum.visits + project.visits,
          proposals: sum.proposals + project.proposals,
          wins: sum.wins + project.wins,
        }),
        {
          leads: 0,
          assigned: 0,
          contacted: 0,
          qualified: 0,
          visits: 0,
          proposals: 0,
          wins: 0,
        },
      );
      const unassigned = Math.max(0, totals.leads - totals.assigned);
      const unattended = Math.max(0, totals.leads - totals.contacted);
      const largestQueue = campaignLargestQueue(totals);
      const actionProject = [...projects].sort((first, second) => {
        const firstUnassigned = Math.max(0, first.leads - first.assigned);
        const secondUnassigned = Math.max(0, second.leads - second.assigned);
        const firstUnattended = Math.max(0, first.leads - first.contacted);
        const secondUnattended = Math.max(0, second.leads - second.contacted);

        return (
          secondUnassigned - firstUnassigned ||
          secondUnattended - firstUnattended ||
          second.leads - first.leads
        );
      })[0];
      const nextDecision =
        unassigned > 0
          ? {
              label: `Distribuir ${unassigned} lead${unassigned === 1 ? "" : "s"}`,
              description:
                "Defina o corretor responsável antes de avaliar atendimento ou conversão.",
              attentionOrder: unassigned * 5,
              status: null,
            }
          : unattended > 0
            ? {
                label: `Priorizar primeiro contato · ${unattended}`,
                description: bottleneckRecommendation("Sem contato"),
                attentionOrder: unattended * 3,
                status: "novo",
              }
            : largestQueue.value > 0
              ? {
                  label: `Tratar fila: ${largestQueue.label} · ${largestQueue.value}`,
                  description: bottleneckRecommendation(largestQueue.label),
                  attentionOrder: largestQueue.value,
                  status: bottleneckStatus(largestQueue.label),
                }
              : {
                  label: "Revisar jornada registrada",
                  description:
                    "Não há pendência dominante no período; valide a próxima ação com a liderança.",
                  attentionOrder: 0,
                  status: null,
                };

      return {
        developer,
        actionProject,
        leads: totals.leads,
        unassigned,
        unattended,
        nextDecision,
      };
    })
    .filter((item) => item.leads > 0 && item.nextDecision.attentionOrder > 0)
    .sort(
      (first, second) =>
        second.nextDecision.attentionOrder - first.nextDecision.attentionOrder ||
        second.leads - first.leads ||
        first.developer.developer.localeCompare(second.developer.developer),
    );
  const developerOperationalPriorities = allDeveloperOperationalPriorities.slice(0, 3);

  async function copyExecutiveSummary() {
    const priorities = developerOperationalPriorities.length
      ? developerOperationalPriorities
          .map(
            (priority, index) =>
              `${index + 1}. ${priority.developer.developer}: ${priority.nextDecision.label}. ${priority.nextDecision.description}`,
          )
          .join("\n")
      : "Nenhuma prioridade operacional dominante no recorte atual.";
    const summary = [
      "ATLAS ONE — resumo operacional",
      `Período: ${displayedPeriod}`,
      `Recorte: ${selectedScope}`,
      `Leads: ${selection.leads} | Contato: ${selection.contacted} (${selection.contactRate}%) | Qualificadas: ${selection.qualified} | Visitas: ${selection.visits} | Propostas: ${selection.proposals} | Vendas: ${selection.wins} (${selection.winRate}%)`,
      `Qualidade da atribuição: ${report.dataQuality.completeAttribution} de ${report.totals.leads} leads com projeto, incorporadora, campanha e origem registrados (${percentage(rate(report.dataQuality.completeAttribution, report.totals.leads))}).`,
      `Distribuição pendente: ${selection.unassigned} lead${selection.unassigned === 1 ? "" : "s"}.`,
      `Primeiro contato pendente: ${Math.max(0, selection.leads - selection.contacted)} lead${Math.max(0, selection.leads - selection.contacted) === 1 ? "" : "s"} no recorte.`,
      `Mídia: ${scopedFinancial.spend === null ? "investimento não conectado" : `${money(scopedFinancial.spend)} observado`} · ${scopedFinancial.note}.`,
      "",
      "Próximas decisões:",
      priorities,
      "",
      "Leitura baseada nos registros do CRM; não estabelece causalidade automática de mídia.",
    ].join("\n");

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(summary);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 3000);
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section
      id="relatorio-incorporadoras"
      className="space-y-5 rounded-3xl border border-blue-400/15 bg-gradient-to-br from-blue-500/[.08] to-cyan-500/[.03] p-5 sm:p-7"
      data-report="weekly-developer-performance"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">
            Resultado semanal registrado
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Incorporadoras, campanhas e execução comercial
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Coorte captada de {displayedPeriod}. A Meta informa investimento;
            o CRM registra atendimento, avanço e venda. O relatório diferencia
            dados observados de estimativas e não atribui causalidade automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportReport}
            className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Exportar para envio (.csv)
          </button>
          <button
            type="button"
            onClick={copyExecutiveSummary}
            data-report-copy-executive-summary
            className="rounded-xl border border-cyan-300/25 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/[.08]"
          >
            Copiar resumo executivo
          </button>
          <button
            type="button"
            onClick={printReport}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:border-cyan-300/30"
          >
            Imprimir recorte
          </button>
        </div>
      </div>
      {copyStatus !== "idle" ? (
        <p
          className={
            copyStatus === "copied"
              ? "text-xs text-emerald-200"
              : "text-xs text-amber-200"
          }
          role="status"
          aria-live="polite"
          data-report-copy-status={copyStatus}
        >
          {copyStatus === "copied"
            ? "Resumo copiado para envio."
            : "Não foi possível copiar neste navegador. Use a exportação CSV."}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <article
            key={label}
            className="rounded-2xl border border-white/[.07] bg-black/15 p-4"
          >
            <p className="text-xs text-zinc-500">{label}</p>
            <strong className="mt-2 block text-xl">{value}</strong>
            <span className="mt-1 block text-[10px] text-zinc-500">{note}</span>
          </article>
        ))}
      </div>
      {report.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-3 text-xs text-amber-100"
        >
          {warning}
        </p>
      ))}

      <section
        className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]"
        data-report="service-and-quality"
      >
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.035] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-200">
            Velocidade do atendimento
          </p>
          {hasOperationalScope ? (
            <p className="mt-1 text-[10px] leading-4 text-emerald-100/70">
              SLA disponível para a coorte completa do período; o recorte atual
              é aplicado aos resultados comerciais.
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <strong className="text-xl">
                {report.service.averageFirstContactMinutes === null
                  ? "—"
                  : `${report.service.averageFirstContactMinutes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min`}
              </strong>
              <span className="block text-[10px] text-zinc-500">
                média até o primeiro contato
              </span>
            </div>
            <div>
              <strong className="text-xl">
                {percentage(report.service.within15Rate)}
              </strong>
              <span className="block text-[10px] text-zinc-500">
                contatadas em até 15 minutos
              </span>
            </div>
            <div>
              <strong className="text-xl">
                {percentage(report.service.coverageRate)}
              </strong>
              <span className="block text-[10px] text-zinc-500">
                cobertura de medição do SLA
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.035] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">
            Qualidade dos vínculos
          </p>
          {hasOperationalScope ? (
            <p className="mt-1 text-[10px] leading-4 text-amber-100/70">
              Pendências exibidas para a coorte completa, para evitar ocultar
              dados que ainda precisam de correção.
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-zinc-300">
            <strong className="text-amber-100">
              {report.dataQuality.completeAttribution.toLocaleString("pt-BR")}
            </strong>{" "}
            de {report.totals.leads.toLocaleString("pt-BR")} leads têm projeto,
            incorporadora, campanha e origem registrados ({percentage(
              rate(report.dataQuality.completeAttribution, report.totals.leads),
            )}).
          </p>
          {pendingQualityActions.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs" data-report-quality-pending>
              {pendingQualityActions.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                data-report-quality-action={item.key}
                className="rounded-xl border border-amber-200/10 bg-black/10 px-3 py-2 transition hover:border-amber-200/30 hover:bg-amber-200/[.05]"
              >
                <strong className="block text-sm text-white">{item.value}</strong>
                <span className="block text-zinc-400">{item.label}</span>
                <span className="mt-1 block text-[10px] text-zinc-500">
                  {percentage(item.coverage)} {item.coverageLabel}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-amber-200">
                  {item.action} · {item.value} leads →
                </span>
              </Link>
              ))}
            </div>
          ) : (
            <p
              className="mt-3 rounded-xl border border-emerald-200/10 bg-emerald-200/[.04] px-3 py-2 text-xs text-emerald-100"
              data-report-quality-clear
            >
              Nenhuma pendência de vínculo nesta coorte. Continue registrando projeto, incorporadora, campanha, origem e responsável a cada nova lead.
            </p>
          )}
          <p className="mt-3 text-[10px] leading-4 text-zinc-500">
            Os atalhos abrem filas de revisão; nenhuma lead é modificada por este relatório.
          </p>
        </div>
      </section>

      {projectServiceWatchlist.length > 0 ? (
        <section
          className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.035] p-4"
          data-report-project-service-watchlist
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-200">
                SLA por projeto
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">
                Onde revisar a velocidade de atendimento
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                A leitura considera somente leads com primeiro contato registrado.
                A ausência de medição não é tratada como desempenho ruim.
              </p>
            </div>
            <span className="w-fit rounded-full border border-emerald-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-100">
              até 3 projetos
            </span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {projectServiceWatchlist.map((project) => {
              const unattended = Math.max(0, project.leads - project.contacted);
              const projectHref =
                project.developmentId && uuidPattern.test(project.developmentId)
                  ? leadsInMeasuredPeriodHref({ project: project.developmentId })
                  : null;
              const unattendedHref =
                project.developmentId &&
                uuidPattern.test(project.developmentId) &&
                unattended > 0
                  ? leadsInMeasuredPeriodHref({
                      project: project.developmentId,
                      status: "novo",
                    })
                  : null;
              return (
                <article
                  key={`${project.developer}:${project.developmentId || project.projectName}`}
                  className="rounded-xl border border-white/[.06] bg-black/10 p-3"
                  data-report-project-service-priority={
                    project.developmentId || project.projectName
                  }
                >
                  <p className="truncate text-xs font-semibold text-white">
                    {project.projectName}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-zinc-500">
                    {project.developer} · SLA em {project.service.measured} de {project.leads} lead
                    {project.leads === 1 ? "" : "s"} · {unattended} sem contato
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[10px] leading-4 text-zinc-400">
                      <strong className="block text-sm text-emerald-100">
                        {project.service.averageFirstContactMinutes?.toLocaleString(
                          "pt-BR",
                          { maximumFractionDigits: 1 },
                        )} min
                      </strong>
                      média até o primeiro contato ·{" "}
                      {percentage(project.service.within15Rate)} em até 15 min
                    </p>
                    <span className="text-right text-[10px] font-semibold leading-4 text-emerald-100">
                      {project.nextDecision}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                    {project.reviewReason}
                  </p>
                  {unattendedHref ? (
                    <Link
                      href={unattendedHref}
                      data-report-project-service-priority-action={
                        project.developmentId
                      }
                      className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                    >
                      Revisar {unattended} sem contato →
                    </Link>
                  ) : projectHref ? (
                    <Link
                      href={projectHref}
                      data-report-project-service-priority-action={
                        project.developmentId
                      }
                      className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                    >
                      {project.needsReview
                        ? "Revisar carteira do projeto →"
                        : "Abrir carteira do projeto →"}
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {projectFunnelWatchlist.length > 0 ? (
        <section
          className="rounded-2xl border border-amber-300/15 bg-amber-300/[.035] p-4"
          data-report-project-funnel-watchlist
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">
                Fluxo comercial por projeto
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">
                Fila que pode travar conversão por projeto
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                Mostra a maior diferença entre as etapas registradas no CRM.
                É uma fila operacional para revisão, não um diagnóstico causal
                nem uma avaliação de corretor.
              </p>
            </div>
            <span className="w-fit rounded-full border border-amber-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-100">
              até 3 projetos
            </span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {projectFunnelWatchlist.map((project) => {
              const projectHref =
                project.developmentId &&
                uuidPattern.test(project.developmentId) &&
                project.status
                  ? leadsInMeasuredPeriodHref({
                      project: project.developmentId,
                      status: project.status,
                    })
                  : null;
              return (
                <article
                  key={`${project.developer}:${project.developmentId || project.projectName}`}
                  className="rounded-xl border border-white/[.06] bg-black/10 p-3"
                  data-report-project-funnel-priority={
                    project.developmentId || project.projectName
                  }
                >
                  <p className="truncate text-xs font-semibold text-white">
                    {project.projectName}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-zinc-500">
                    {project.developer} · {project.leads} lead
                    {project.leads === 1 ? "" : "s"} no período
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[10px] leading-4 text-zinc-400">
                      <strong className="block text-sm text-amber-100">
                        {project.largestQueue.value} lead
                        {project.largestQueue.value === 1 ? "" : "s"}
                      </strong>
                      {project.largestQueue.label}
                    </p>
                    <span className="max-w-40 text-right text-[10px] font-semibold leading-4 text-amber-100">
                      {project.nextDecision}
                    </span>
                  </div>
                  {projectHref ? (
                    <Link
                      href={projectHref}
                      data-report-project-funnel-priority-action={
                        project.developmentId
                      }
                      className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                    >
                      Abrir fila do projeto →
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {visibleDailyDistribution.length > 0 ? (
        <section
          className="rounded-2xl border border-sky-300/15 bg-sky-300/[.035] p-4"
          data-report-daily-distribution
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-200">
                Entrada de leads e responsável
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">
                Separação entre distribuição e atendimento
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                A leitura usa a data de criação registrada no CRM. Ela não
                infere uma data de distribuição: mostra a responsável atual e
                o primeiro contato que ainda precisa ser registrado.
              </p>
            </div>
            <span className="w-fit rounded-full border border-sky-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-sky-100">
              últimas 8 entradas
            </span>
          </div>
          <div
            className="mt-3 grid gap-2 sm:grid-cols-3"
            data-report-daily-distribution-summary
          >
            <article className="rounded-xl border border-amber-300/15 bg-amber-300/[.035] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-100">
                Sem responsável
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {dailyDistributionSummary.unassigned}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                lead{dailyDistributionSummary.unassigned === 1 ? "" : "s"} que
                exigem distribuição
              </p>
            </article>
            <article className="rounded-xl border border-sky-300/15 bg-sky-300/[.035] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-100">
                Carteira vinculada
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {dailyDistributionSummary.assigned}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                lead{dailyDistributionSummary.assigned === 1 ? "" : "s"} com
                responsável atual
              </p>
            </article>
            <article className="rounded-xl border border-rose-300/15 bg-rose-300/[.035] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-100">
                Primeiro contato pendente
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {dailyDistributionSummary.pendingFirstContact}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                lead{dailyDistributionSummary.pendingFirstContact === 1 ? "" : "s"}{" "}
                com responsável, sem atendimento registrado
              </p>
            </article>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {visibleDailyDistribution.map((row) => {
              const href =
                row.developmentId && uuidPattern.test(row.developmentId)
                  ? leadsInMeasuredPeriodHref({
                      project: row.developmentId,
                      ...(row.brokerId && uuidPattern.test(row.brokerId)
                        ? { broker: row.brokerId }
                        : {}),
                      ...(!row.brokerId
                        ? { attention: "unassigned" }
                        : row.withoutFirstContact > 0
                          ? { status: "novo" }
                          : {}),
                    })
                  : null;
              const decision = !row.brokerId
                ? "Distribuir a carteira"
                : row.withoutFirstContact > 0
                  ? "Registrar o primeiro contato"
                  : "Acompanhar a carteira";
              const actionLabel = !row.brokerId
                ? `Distribuir ${row.leads} lead${row.leads === 1 ? "" : "s"} →`
                : row.withoutFirstContact > 0
                  ? "Registrar primeiro contato →"
                  : "Abrir carteira do recorte →";
              return (
                <article
                  key={`${row.date}:${row.developmentId || row.projectName}:${row.brokerId || "unassigned"}`}
                  className="rounded-xl border border-white/[.06] bg-black/10 p-3"
                  data-report-daily-distribution-row={`${row.date}:${row.developmentId || row.projectName}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {row.projectName}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-zinc-500">
                        {row.date} · {row.developer} · {row.brokerName}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-[10px] font-semibold text-sky-100">
                      {row.leads} lead{row.leads === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[10px] leading-4 text-zinc-400">
                      <strong className="block text-sm text-sky-100">
                        {row.withoutFirstContact} {row.brokerId ? "sem contato" : "sem responsável"}
                      </strong>
                      {row.brokerId
                        ? "Primeiro atendimento ainda não registrado"
                        : "Distribuição necessária antes do atendimento"}
                    </p>
                    <span className="max-w-40 text-right text-[10px] font-semibold leading-4 text-sky-100">
                      {decision}
                    </span>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      data-report-daily-distribution-action={row.developmentId}
                      className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                    >
                      {actionLabel}
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
          {visibleBrokerDailyWorkload.length > 0 ? (
            <div className="mt-4 border-t border-white/[.06] pt-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-200">
                    Novas leads por corretor
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Carteiras com responsável atual no recorte e onde ainda
                    falta registrar o primeiro atendimento.
                  </p>
                </div>
                <span className="text-[10px] text-zinc-500">
                  data de criação · responsável atual
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {visibleBrokerDailyWorkload.map((broker) => {
                  const needsNewLeadReview = broker.withoutFirstContact > 0;
                  const actionLabel = needsNewLeadReview
                    ? `Registrar contato em ${broker.withoutFirstContact} lead${broker.withoutFirstContact === 1 ? "" : "s"} →`
                    : "Abrir carteira do recorte →";
                  const href = uuidPattern.test(broker.brokerId)
                    ? leadsInMeasuredPeriodHref({
                        broker: broker.brokerId,
                        ...(needsNewLeadReview ? { status: "novo" } : {}),
                      })
                    : null;
                  return (
                    <article
                      key={broker.brokerId}
                      className="rounded-xl border border-white/[.06] bg-black/10 p-3"
                      data-report-broker-daily-workload={broker.brokerId}
                    >
                      <p className="truncate text-xs font-semibold text-white">
                        {broker.brokerName}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-sky-100">
                        {broker.leads}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        novas leads em {broker.activeDays} dia
                        {broker.activeDays === 1 ? "" : "s"}
                      </p>
                      <p className="mt-2 text-[10px] font-semibold text-amber-100">
                        {broker.withoutFirstContact} sem primeiro contato
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {broker.firstContactRate}% com primeiro contato
                      </p>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
                        role="progressbar"
                        aria-label={`Cobertura de primeiro contato de ${broker.brokerName}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={broker.firstContactRate}
                      >
                        <div
                          className={`h-full rounded-full ${
                            broker.firstContactRate >= 80
                              ? "bg-emerald-400"
                              : broker.firstContactRate >= 50
                                ? "bg-amber-300"
                                : "bg-rose-400"
                          }`}
                          style={{ width: `${broker.firstContactRate}%` }}
                        />
                      </div>
                      {href ? (
                        <Link
                          href={href}
                          data-report-broker-daily-workload-action={broker.brokerId}
                          className="mt-2 inline-flex min-h-8 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                        >
                          {actionLabel}
                        </Link>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        className="space-y-4 rounded-2xl border border-cyan-400/15 bg-black/15 p-4 sm:p-5"
        data-report="developer-project-funnel"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">
              Incorporadora → projeto → atendimento
            </p>
            <h3 className="mt-1 text-lg font-bold">
              Leads e etapa atual por projeto
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
              Selecione uma incorporadora para ver quantas leads cada projeto
              gerou, quais corretores atenderam e onde cada carteira está no
              funil.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Incorporadora
              <select
                value={developerFilter}
                onChange={(event) => {
                  setDeveloperFilter(event.target.value);
                  setProjectFilter("all");
                }}
                className="mt-1 block min-w-52 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white"
              >
                <option value="all">Todas as incorporadoras</option>
                {developerOptions.map((developer) => (
                  <option key={developer.id} value={developer.id}>
                    {developer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Projeto
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className="mt-1 block min-w-52 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white"
              >
                <option value="all">Todos os projetos</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/developments/developers#cadastro-incorporadora"
              className="self-end rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 py-2.5 text-center text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/[.12]"
            >
              Cadastrar incorporadora
            </Link>
            {hasOperationalScope ? (
              <button
                type="button"
                onClick={clearOperationalScope}
                className="self-end rounded-xl border border-white/10 px-4 py-2.5 text-center text-xs font-bold text-zinc-300 transition hover:border-white/25 hover:text-white"
              >
                Limpar recorte
              </button>
            ) : null}
          </div>
        </div>
        <p
          className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] px-3 py-2 text-xs leading-5 text-cyan-50/85"
          data-report="developer-scope-note"
        >
          <span className="font-bold text-cyan-200">Recorte ativo:</span>{" "}
          {selectedScope}. Período: {displayedPeriod}. {financialScopeNote}{" "}
          {campaignScopeNote}
        </p>

        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          data-report="developer-selection-summary"
        >
          {[
            [
              "Leads no recorte",
              selection.leads,
              `${visibleProjects.length} projetos`,
            ],
            [
              "Atendidas",
              selection.assigned,
              `${selection.unassigned} sem corretor`,
            ],
            [
              "Taxa de contato",
              `${selection.contactRate}%`,
              `${selection.contacted} contatadas`,
            ],
            [
              "Qualificação",
              `${selection.qualificationRate}%`,
              `${selection.qualified} qualificadas`,
            ],
            [
              "Conversão em venda",
              `${selection.winRate}%`,
              `${selection.wins} vendas`,
            ],
          ].map(([label, value, note]) => (
            <article
              key={label}
              className="rounded-xl border border-white/[.07] bg-white/[.025] p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                {label}
              </p>
              <strong className="mt-1 block text-lg text-white">{value}</strong>
              <span className="text-[10px] text-zinc-500">{note}</span>
            </article>
          ))}
        </div>

        {selection.leads > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[.045] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                Ponto de atenção do recorte
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {selection.bottleneck.key}: {selection.bottleneck.value} leads
              </p>
            </div>
            <p className="max-w-xl text-xs leading-5 text-zinc-400">
              {selection.bottleneck.recommendation} É uma leitura operacional,
              não uma avaliação automática de pessoas.
            </p>
            {bottleneckActionHref ? (
              <Link
                href={bottleneckActionHref}
                data-report-bottleneck-action={selection.bottleneck.key}
                className="inline-flex shrink-0 rounded-lg border border-amber-300/25 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-300/[.08]"
              >
                Abrir carteira desta etapa
              </Link>
            ) : null}
          </div>
        ) : null}

        {unassignedProjectBrokers.length > 0 ? (
          <section
            className="rounded-xl border border-amber-300/15 bg-amber-300/[.035] p-3"
            data-report-unassigned-projects
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  Distribuição pendente
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Projetos com leads sem corretor responsável
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Revise a carteira antes de cobrar atendimento. A distribuição
                  continua sendo uma decisão explícita da diretoria.
                </p>
              </div>
              <Link
                href={leadsInMeasuredPeriodHref({ attention: "unassigned" })}
                className="inline-flex shrink-0 rounded-lg border border-amber-300/25 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-300/[.08]"
              >
                Ver carteira pendente
              </Link>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {unassignedProjectBrokers.map((row) => (
                <div
                  key={`${row.developer}:${row.developmentId || "missing-project"}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-black/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {row.projectName}
                    </p>
                    <p className="truncate text-[10px] text-zinc-500">
                      {row.developer}
                    </p>
                  </div>
                  <Link
                    href={
                      row.developmentId
                        ? leadsInMeasuredPeriodHref({
                            project: row.developmentId,
                            attention: "unassigned",
                          })
                        : leadsInMeasuredPeriodHref({
                            attention: "unassigned",
                          })
                    }
                    data-report-unassigned-project-action={
                      row.developmentId || "missing-project"
                    }
                    className="shrink-0 text-xs font-semibold text-amber-100 hover:text-white"
                  >
                    Revisar {row.leads} leads
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {silentAssignedProjects.length > 0 ? (
          <section
            className="rounded-xl border border-rose-300/15 bg-rose-300/[.035] p-3"
            data-report-silent-projects
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200">
                  Atendimento sem registro
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Projetos já distribuídos, mas sem interação no período
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Confirme o atendimento com o corretor e registre o resultado
                  no CRM antes de avaliar a qualidade da campanha.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {silentAssignedProjects.map((row) => (
                <div
                  key={`${row.developer}:${row.developmentId || "missing-project"}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-black/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {row.projectName}
                    </p>
                    <p className="truncate text-[10px] text-zinc-500">
                      {row.leads} leads distribuídas · {row.developer}
                    </p>
                  </div>
                  <Link
                    href={
                      row.developmentId
                        ? leadsInMeasuredPeriodHref({ project: row.developmentId })
                        : leadsInMeasuredPeriodHref({
                            quality: "missing_project",
                          })
                    }
                    data-report-silent-project-action={
                      row.developmentId || "missing-project"
                    }
                    className="shrink-0 text-xs font-semibold text-rose-100 hover:text-white"
                  >
                    Abrir carteira
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {brokerOperationalPriorities.length > 0 ? (
          <section
            className="rounded-xl border border-violet-300/15 bg-violet-300/[.035] p-3"
            data-report-broker-priority-watchlist
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">
                  Acompanhamento por corretor
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Carteiras que pedem revisão humana
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                  Prioriza ausência de interação e leads sem contato registrado.
                  É um apoio de gestão, não uma classificação automática de pessoas.
                </p>
              </div>
              <span className="w-fit rounded-full border border-violet-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-violet-100">
                até 3 carteiras
              </span>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {brokerOperationalPriorities.map((broker) => {
                const brokerRosterHref = uuidPattern.test(broker.brokerId)
                  ? leadsInMeasuredPeriodHref({
                      broker: broker.brokerId,
                      ...(broker.unattended > 0 ? { status: "novo" } : {}),
                    })
                  : null;
                const brokerRosterLabel =
                  broker.unattended > 0
                    ? "Abrir leads sem contato →"
                    : "Abrir carteira do corretor →";

                return (
                  <article
                    key={broker.brokerId}
                    className="rounded-lg border border-white/[.06] bg-black/10 p-3"
                    data-report-broker-priority={broker.brokerId}
                  >
                    <p className="truncate text-xs font-semibold text-white">
                      {broker.brokerName}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-zinc-500">
                      {broker.developer} · {broker.projects.size} projeto{broker.projects.size === 1 ? "" : "s"}
                    </p>
                    <p className="mt-3 text-[10px] font-semibold leading-4 text-violet-100">
                      {broker.nextDecision}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                      {broker.interactions} interação{broker.interactions === 1 ? "" : "ões"} registrada{broker.interactions === 1 ? "" : "s"} · {broker.unattended} sem contato no recorte.
                    </p>
                    {brokerRosterHref ? (
                      <Link
                        href={brokerRosterHref}
                        data-report-broker-priority-action={broker.brokerId}
                        className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                      >
                        {brokerRosterLabel}
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {developerOperationalPriorities.length > 0 ? (
          <section
            className="rounded-xl border border-sky-300/15 bg-sky-300/[.035] p-3"
            data-report-developer-priority-watchlist
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">
                  Atenção por incorporadora
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Prioridades operacionais por incorporadora
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                  Lista curta baseada em distribuição, primeiro contato e fila do
                  funil registrada no CRM. Não é ranking de desempenho nem
                  avaliação automática de pessoas.
                </p>
              </div>
              <span className="w-fit rounded-full border border-sky-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-sky-100">
                até 3 decisões
              </span>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {developerOperationalPriorities.map((priority) => {
                const canOpenProjectRoster = Boolean(
                  priority.actionProject?.developmentId &&
                    uuidPattern.test(priority.actionProject.developmentId),
                );
                const rosterHref = priority.actionProject?.developmentId
                  ? leadsInMeasuredPeriodHref({
                      project: priority.actionProject.developmentId,
                      ...(priority.unassigned > 0
                        ? { attention: "unassigned" }
                        : priority.nextDecision.status
                          ? { status: priority.nextDecision.status }
                          : {}),
                    })
                  : null;

                return (
                  <article
                    key={priority.developer.developerId || priority.developer.developer}
                    className="rounded-lg border border-white/[.06] bg-black/10 p-3"
                    data-report-developer-priority={priority.developer.developerId || priority.developer.developer}
                  >
                    <p className="truncate text-xs font-semibold text-white">
                      {priority.developer.developer}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {priority.leads} leads no período
                      {priority.actionProject
                        ? ` · ${priority.actionProject.projectName}`
                        : ""}
                    </p>
                    <p className="mt-3 text-[10px] font-semibold leading-4 text-sky-100">
                      {priority.nextDecision.label}
                    </p>
                    <p className="mt-1 min-h-10 text-[10px] leading-4 text-zinc-400">
                      {priority.nextDecision.description}
                    </p>
                    {canOpenProjectRoster && rosterHref ? (
                      <Link
                        href={rosterHref}
                        data-report-developer-priority-action={priority.developer.developerId || priority.developer.developer}
                        className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                      >
                        Abrir carteira do projeto →
                      </Link>
                    ) : (
                      <p className="mt-3 text-[10px] text-zinc-500">
                        Revise o vínculo do projeto para abrir a carteira.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-white/[.06]">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-white/[.025] text-xs text-zinc-500">
              <tr>
                <th className="p-3">Incorporadora / projeto</th>
                <th>Leads geradas</th>
                <th>Corretores</th>
                <th>Sem corretor</th>
                <th>Interações</th>
                <th>Sem contato</th>
                <th>Novas</th>
                <th>Contato</th>
                <th>Qualificação</th>
                <th>Visita</th>
                <th>Proposta</th>
                <th>Contrato</th>
                <th>Venda</th>
                <th>Conversão</th>
                <th className="pr-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.06]">
              {visibleProjects.map((row) => {
                const unassigned = Math.max(0, row.leads - row.assigned);
                const interactions =
                  interactionsByProject.get(row.developmentId || "sem-projeto") || 0;
                const hasNoRegisteredInteraction = row.leads > 0 && !interactions;
                const withoutContact = Math.max(0, row.leads - row.contacted);
                const actionHref = row.developmentId
                  ? leadsInMeasuredPeriodHref({
                      project: row.developmentId,
                      ...(unassigned > 0 ? { attention: "unassigned" } : {}),
                    })
                  : leadsInMeasuredPeriodHref({ quality: "missing_project" });
                const actionLabel = unassigned > 0
                  ? `Distribuir ${unassigned} lead${unassigned === 1 ? "" : "s"}`
                  : hasNoRegisteredInteraction
                    ? "Abrir carteira do projeto"
                    : `Ver ${row.leads} leads`;

                return (
                  <tr
                    key={`${row.developer}:${row.developmentId || "sem-projeto"}`}
                  >
                  <td className="p-3">
                    <span className="font-semibold text-white">
                      {row.projectName}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {row.developer}
                    </span>
                  </td>
                  <td className="font-bold text-cyan-100">{row.leads}</td>
                  <td>{row.brokers}</td>
                  <td
                    className={
                      row.leads - row.assigned > 0
                        ? "font-semibold text-amber-200"
                        : "text-zinc-400"
                    }
                  >
                    {unassigned}
                  </td>
                  <td
                    title={
                      hasNoRegisteredInteraction
                        ? "Há leads neste projeto sem interação registrada no período."
                        : "Interações registradas no período selecionado."
                    }
                    className={
                      hasNoRegisteredInteraction
                        ? "font-semibold text-amber-200"
                        : "font-semibold text-sky-100"
                    }
                  >
                    {interactions}
                  </td>
                  <td
                    title={
                      withoutContact > 0
                        ? "Leads que ainda não chegaram à etapa de contato no período."
                        : "Todas as leads do projeto chegaram à etapa de contato no período."
                    }
                    className={
                      withoutContact > 0
                        ? "font-semibold text-amber-200"
                        : "text-zinc-400"
                    }
                  >
                    {withoutContact}
                  </td>
                  <td>{row.stages.novo}</td>
                  <td>{row.stages.contato}</td>
                  <td className="font-semibold text-sky-200">
                    {row.stages.qualificacao}
                  </td>
                  <td>{row.stages.visita}</td>
                  <td>{row.stages.proposta}</td>
                  <td>{row.stages.contrato}</td>
                  <td className="font-bold text-emerald-200">
                    {row.stages.ganho}
                  </td>
                  <td>{percentage(row.leadToWinRate)}</td>
                  <td className="pr-3 text-right">
                    <Link
                      href={actionHref}
                      data-report-project-action={row.developmentId || "missing-project"}
                      className="inline-flex rounded-lg border border-cyan-300/20 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-300/[.08]"
                    >
                      {row.developmentId
                        ? actionLabel
                        : `Revisar ${row.leads} sem projeto`}
                    </Link>
                  </td>
                  </tr>
                );
              })}
              {visibleProjects.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-zinc-500">
                    <p>
                      Nenhuma lead encontrada neste recorte. Verifique o
                      período ou remova o filtro para retomar a visão completa.
                    </p>
                    {hasOperationalScope ? (
                      <button
                        type="button"
                        onClick={clearOperationalScope}
                        className="mt-3 rounded-lg border border-cyan-300/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[.08]"
                      >
                        Ver todos os projetos
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <details className="group rounded-xl border border-white/[.06] bg-white/[.02]">
          <summary className="cursor-pointer list-none p-3 text-xs font-bold text-zinc-200">
            Ver corretores e etapas por projeto
            <span className="ml-2 font-normal text-zinc-500 group-open:hidden">
              Abrir
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-white/[.06]">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Projeto</th>
                  <th>Corretor</th>
                  <th>Recebidas</th>
                  <th>Interações</th>
                  <th>Novas</th>
                  <th>Contato</th>
                  <th>Qualificação</th>
                  <th>Visita</th>
                  <th>Proposta</th>
                  <th>Venda</th>
                  <th>Taxa contato</th>
                  <th>Conversão</th>
                  <th className="pr-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.06]">
                {visibleProjectBrokers.map((row) => {
                  const actionHref = row.developmentId
                    ? row.brokerId
                      ? leadsInMeasuredPeriodHref({
                          project: row.developmentId,
                          broker: row.brokerId,
                        })
                      : leadsInMeasuredPeriodHref({
                          project: row.developmentId,
                          attention: "unassigned",
                        })
                    : leadsInMeasuredPeriodHref({ attention: "unassigned" });
                  const actionLabel = !row.brokerId
                    ? `Distribuir ${row.leads} lead${row.leads === 1 ? "" : "s"}`
                    : row.interactions === 0 && row.leads > 0
                      ? "Abrir carteira do corretor"
                      : row.leads === 1
                        ? "Ver 1 lead"
                        : `Ver ${row.leads} leads`;

                  return (
                    <tr
                      key={`${row.developer}:${row.developmentId}:${row.brokerId || "unassigned"}`}
                    >
                    <td className="p-3">
                      <span className="font-semibold">{row.projectName}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {row.developer}
                      </span>
                    </td>
                    <td className={row.brokerId ? "" : "text-amber-200"}>
                      {row.brokerName}
                    </td>
                   <td className="font-bold">{row.leads}</td>
                    <td>{row.interactions}</td>
                    <td>{row.stages.novo}</td>
                    <td>{row.stages.contato}</td>
                    <td>{row.stages.qualificacao}</td>
                    <td>{row.stages.visita}</td>
                    <td>{row.stages.proposta}</td>
                    <td className="font-bold text-emerald-200">
                      {row.stages.ganho}
                    </td>
                    <td>{percentage(row.contactRate)}</td>
                    <td>{percentage(row.leadToWinRate)}</td>
                    <td className="pr-3 text-right">
                      <Link
                        href={actionHref}
                        data-report-project-broker-action={`${row.developmentId || "all"}:${row.brokerId || "unassigned"}`}
                        className="inline-flex rounded-lg border border-sky-300/20 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-300/[.08]"
                      >
                        {actionLabel}
                      </Link>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-black/15 p-4">
        <div>
          <h3 className="font-bold">Resumo financeiro por incorporadora</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Do investimento até a venda, sem transformar orçamento da lead em
            receita. {financialScopeNote}
          </p>
        </div>
        <table className="mt-4 w-full min-w-[980px] text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="pb-3">Incorporadora</th>
              <th>Leads</th>
              <th>Contato</th>
              <th>Qualificadas</th>
              <th>Visitas</th>
              <th>Propostas</th>
              <th>Vendas</th>
              <th>Conversão</th>
              <th>Investimento</th>
              <th>Custo/venda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[.06]">
            {visibleDevelopers.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-zinc-500">
                  Nenhuma lead captada no período.
                </td>
              </tr>
            ) : null}
            {visibleDevelopers.map((row) => (
              <tr key={row.developer}>
                <td className="py-3">
                  <span className="font-semibold">{row.developer}</span>
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    {row.projects} projetos · {row.campaigns} campanhas ·{" "}
                    {row.brokers} corretores
                    {row.allocation !== "direct" ? " · custo rateado" : ""}
                  </span>
                </td>
                <td>{row.leads}</td>
                <td>{row.contacted}</td>
                <td>{row.qualified}</td>
                <td>{row.visits}</td>
                <td>{row.proposals}</td>
                <td className="font-bold text-emerald-200">{row.wins}</td>
                <td>{percentage(row.leadToWinRate)}</td>
                <td>
                  {row.spend === null ? "Não conectado" : money(row.spend)}
                </td>
                <td>{row.costPerWin === null ? "—" : money(row.costPerWin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="space-y-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4 sm:p-5"
        data-v30-phase="51-campaign-observed-journey"
        data-ux-phase="51-campaign-lead-service-result"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">
              Campanha → lead → atendimento → resultado
            </p>
            <h3 className="mt-1 font-bold">Jornada comercial observada</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              A campanha identifica a origem registrada. Atendimento e resultado
              vêm do CRM. A sequência mostra associação observada e não comprova
              que a campanha causou a venda. {campaignScopeNote}
            </p>
          </div>
          <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/[.06] px-3 py-1 text-[10px] font-bold text-amber-100">
            SEM ALEGAÇÃO CAUSAL
          </span>
        </div>
        {observedCampaignJourneys.length > 1 ? (
          <p
            className="text-[10px] leading-4 text-zinc-500"
            data-report-campaign-priority-order
          >
            As campanhas abaixo são ordenadas por pendências de distribuição, atendimento e maior fila comercial; isto não é uma nota de desempenho.
          </p>
        ) : null}

        {priorityCampaigns.length > 0 ? (
          <div
            className="rounded-2xl border border-amber-300/15 bg-amber-300/[.035] p-4"
            data-report-priority-campaigns
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">
                  Prioridades de campanha
                </p>
                <h4 className="mt-1 text-sm font-bold text-zinc-100">
                  Onde a liderança deve agir agora
                </h4>
                <p className="mt-1 max-w-3xl text-[10px] leading-4 text-zinc-400">
                  Recorte operacional ordenado por distribuição pendente,
                  atendimento sem registro e maior fila comercial. Não é ranking de
                  desempenho nem atribuição causal.
                </p>
              </div>
              <span className="w-fit rounded-full border border-amber-300/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-100">
                até 3 decisões
              </span>
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {priorityCampaigns.map((campaign) => {
                return (
                  <article
                    key={campaign.campaignId}
                    className="rounded-xl border border-white/[.07] bg-black/20 p-3"
                    data-report-priority-campaign={campaign.campaignId}
                  >
                    <p className="truncate text-xs font-semibold text-zinc-100">
                      {campaign.campaignName}
                    </p>
                    <p className="mt-1 text-[9px] text-zinc-500">
                      {campaign.responsibleDeveloper}
                    </p>
                    <p className="mt-3 text-[10px] font-semibold leading-4 text-amber-100">
                      {campaign.nextDecision.label}
                    </p>
                    <p className="mt-1 min-h-10 text-[10px] leading-4 text-zinc-400">
                      {campaign.nextDecision.description}
                    </p>
                    {campaign.leadRosterHref ? (
                      <Link
                        href={campaign.leadRosterHref}
                        className="mt-3 inline-flex min-h-9 items-center text-[10px] font-semibold text-sky-300 hover:text-sky-100"
                        data-report-priority-campaign-action={campaign.campaignId}
                      >
                        {campaign.leadRosterLabel}
                      </Link>
                    ) : (
                      <p className="mt-3 text-[10px] text-zinc-500">
                        Campanha sem vínculo de carteira
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          className="grid gap-2 md:grid-cols-3"
          data-ux-phase="52-attribution-incrementality-sample"
        >
          <div className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-sky-200">
              Atribuição observada
            </p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">
              A origem preservada no cadastro liga a campanha à lead e ao
              resultado registrado.
            </p>
          </div>
          <div className="rounded-xl border border-violet-300/15 bg-violet-300/[.04] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-violet-200">
              Impacto incremental
            </p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">
              {
                "Não estimado nesta leitura. Exige experimento compatível, controle e revisão humana."
              }
            </p>
          </div>
          <div className="rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-200">
              Suficiência da amostra
            </p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">
              A leitura descritiva sinaliza baixa amostra abaixo de{" "}
              {minimumDescriptiveSample} leads.
            </p>
          </div>
        </div>

        {observedCampaignJourneys.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
            Nenhuma campanha atribuída à coorte desta semana.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {observedCampaignJourneys.map((campaign) => (
              <article
                key={campaign.campaignId}
                className="rounded-2xl border border-white/[.07] bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {campaign.campaignName}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {campaign.spend === null
                        ? "Investimento não conectado"
                        : `${money(campaign.spend)} observados pela mídia`}
                    </p>
                    <p className="mt-1 text-[10px] text-cyan-200/80">
                      Responsável: {campaign.responsibleDeveloper}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-300">
                    {campaign.campaignId === "sem-campanha"
                      ? "origem incompleta"
                      : "origem registrada"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-wider">
                  <span
                    className={`rounded-full border px-2.5 py-1 ${
                      campaign.campaignId === "sem-campanha"
                        ? "border-amber-300/20 bg-amber-300/[.06] text-amber-100"
                        : "border-sky-300/20 bg-sky-300/[.06] text-sky-100"
                    }`}
                  >
                    {campaign.campaignId === "sem-campanha"
                      ? "Atribuição incompleta"
                      : "Atribuição observada"}
                  </span>
                  {campaign.responsibleDeveloperId === null ? (
                    <span
                      className={`rounded-full border px-2.5 py-1 ${
                        campaign.responsibleDeveloper === "Não informada"
                          ? "border-rose-300/20 bg-rose-300/[.06] text-rose-100"
                          : "border-amber-300/20 bg-amber-300/[.06] text-amber-100"
                      }`}
                      data-report-campaign-developer-attribution={campaign.campaignId}
                    >
                      {campaign.responsibleDeveloper === "Não informada"
                        ? "Incorporadora pendente"
                        : "Incorporadora inferida pelo CRM"}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-violet-300/20 bg-violet-300/[.06] px-2.5 py-1 text-violet-100">
                    Incremental não estimado
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 ${
                      campaign.leads >= minimumDescriptiveSample
                        ? "border-emerald-300/20 bg-emerald-300/[.06] text-emerald-100"
                        : "border-amber-300/20 bg-amber-300/[.06] text-amber-100"
                    }`}
                  >
                    {campaign.leads >= minimumDescriptiveSample
                      ? `Amostra descritiva ≥ ${minimumDescriptiveSample}`
                      : `Amostra insuficiente · ${campaign.leads}/${minimumDescriptiveSample}`}
                  </span>
                  {campaign.unattendedLeads > 0 ? (
                    <span
                      className="rounded-full border border-rose-300/20 bg-rose-300/[.06] px-2.5 py-1 text-rose-100"
                      data-report-campaign-unattended={campaign.campaignId}
                    >
                      {campaign.unattendedLeads} sem atendimento registrado
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-2.5 py-1 text-emerald-100">
                      Atendimento registrado para toda a coorte
                    </span>
                  )}
                  {campaign.assignedBrokers > campaign.activeBrokers ? (
                    <span
                      className="rounded-full border border-amber-300/20 bg-amber-300/[.06] px-2.5 py-1 text-amber-100"
                      data-report-campaign-idle-brokers={campaign.campaignId}
                    >
                      {campaign.assignedBrokers - campaign.activeBrokers} corretor
                      {campaign.assignedBrokers - campaign.activeBrokers === 1 ? "" : "es"} sem
                      interação
                    </span>
                  ) : null}
                  {campaign.assignedBrokers === 0 && campaign.leads > 0 ? (
                    <span
                      className="rounded-full border border-rose-300/20 bg-rose-300/[.06] px-2.5 py-1 text-rose-100"
                      data-report-campaign-unassigned={campaign.campaignId}
                    >
                      Sem corretor atribuído
                    </span>
                  ) : null}
                  {campaign.largestQueue.value > 0 ? (
                    <span className="rounded-full border border-orange-300/20 bg-orange-300/[.06] px-2.5 py-1 text-orange-100">
                      Maior fila: {campaign.largestQueue.label} · {campaign.largestQueue.value}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Lead", campaign.leads, "captadas"],
                    [
                      "Atendimento",
                      campaign.contacted,
                      campaign.contactRate === null
                        ? "sem base"
                        : `${campaign.contactRate}% contatadas`,
                    ],
                    [
                      "Avanço",
                      campaign.proposals,
                      `${campaign.qualified} qualificadas`,
                    ],
                    ["Resultado", campaign.wins, "vendas registradas"],
                  ].map(([label, value, note], index) => (
                    <div
                      key={String(label)}
                      className="relative rounded-xl border border-white/[.06] bg-white/[.025] p-3"
                    >
                      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        {index + 1} · {label}
                      </p>
                      <strong className="mt-1 block text-lg text-white">
                        {value}
                      </strong>
                      <span className="mt-1 block text-[9px] text-zinc-500">
                        {note}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-zinc-500">
                  {campaign.assignedBrokers === 0 && campaign.leads > 0
                    ? `Distribuição pendente: ${campaign.leads} lead${campaign.leads === 1 ? "" : "s"} sem corretor atribuído.`
                    : `Execução registrada: ${campaign.activeBrokers} corretor${campaign.activeBrokers === 1 ? "" : "es"} com interação · ${campaign.interactions} ${campaign.interactions === 1 ? "interação" : "interações"} · ${campaign.visits} visitas · ${campaign.proposals} propostas`}
                  {campaign.leadToWinRate === null
                    ? " · conversão sem amostra"
                    : ` · ${percentage(campaign.leadToWinRate)} de conversão observada`}
                </p>
                <p className="mt-2 text-[9px] leading-4 text-zinc-600">
                  {campaign.responsibleDeveloperId === null
                    ? campaign.responsibleDeveloper === "Não informada"
                      ? "Cadastre a incorporadora responsável antes de usar este recorte como prestação de contas."
                      : "A incorporadora exibida foi inferida pela coorte de leads; confirme o vínculo formal da campanha antes de exportar."
                    : "Mesmo com amostra descritiva suficiente, esta visualização não mede lift, ganho incremental nem efeito causal."}
                </p>
                {campaign.campaignId === "sem-campanha" || uuidPattern.test(campaign.campaignId) ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.06] pt-3">
                    <div
                      className="w-full rounded-xl border border-cyan-300/15 bg-cyan-300/[.035] px-3 py-2"
                      data-report-campaign-next-decision={campaign.campaignId}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-200">
                        Próxima decisão
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-100">
                        {campaign.nextDecision.label}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                        {campaign.nextDecision.description}
                      </p>
                    </div>
                    <Link
                      href={campaign.leadRosterHref!}
                      className="inline-flex min-h-10 items-center rounded-xl border border-sky-300/20 bg-sky-300/[.06] px-3 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-300/[.12]"
                      data-report-campaign-journey-action={campaign.campaignId}
                    >
                      {campaign.leadRosterLabel}
                    </Link>
                    {campaign.campaignId !== "sem-campanha" &&
                    uuidPattern.test(campaign.campaignId) &&
                    campaign.responsibleDeveloperId === null ? (
                      <Link
                        href={`/marketing/campaigns?q=${encodeURIComponent(campaign.campaignName)}`}
                        className="inline-flex min-h-10 items-center rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3 text-xs font-semibold text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-300/[.12]"
                        data-report-campaign-configuration-action={campaign.campaignId}
                      >
                        Revisar cadastro da campanha
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <details className="group rounded-2xl border border-white/[.07] bg-black/15">
        <summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-200">
          Ver detalhamento de campanhas e execução por corretor
          <span className="ml-2 text-xs font-normal text-zinc-500 group-open:hidden">
            Abrir
          </span>
        </summary>
        <div className="grid gap-5 border-t border-white/[.06] p-4 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <h3 className="font-bold">Campanhas</h3>
            <p className="mt-1 text-xs text-zinc-500">{campaignScopeNote}</p>
            <table className="mt-4 w-full min-w-[780px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3">Campanha</th>
                  <th>Incorporadora responsável</th>
                  <th>Leads</th>
                  <th>Qualificadas</th>
                  <th>Propostas</th>
                  <th>Vendas</th>
                  <th>Execução</th>
                  <th>Maior fila</th>
                  <th>Custo</th>
                  <th>CPQ</th>
                  <th aria-label="Ação" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.06]">
                {visibleCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-zinc-500">
                      Nenhuma campanha atribuída no período.
                    </td>
                  </tr>
                ) : null}
                {visibleCampaigns.map((row) => {
                  const journey = campaignJourneyById.get(row.campaignId);
                  const actionLabel = journey?.leadRosterLabel || "Abrir leads";

                  return (
                  <tr key={row.campaignId}>
                    <td className="py-3 font-semibold">{row.campaignName}</td>
                    <td>{row.responsibleDeveloper}</td>
                    <td>{row.leads}</td>
                    <td>{row.qualified}</td>
                    <td>{row.proposals}</td>
                    <td>{row.wins}</td>
                    <td>
                      {(() => {
                        const execution = campaignExecutionById.get(row.campaignId);
                        const assignedBrokers = execution?.assignedBrokers.size || 0;
                        const activeBrokers = execution?.activeBrokers.size || 0;
                        const idleBrokers = Math.max(0, assignedBrokers - activeBrokers);

                        return assignedBrokers === 0 ? (
                          <span className="text-xs text-zinc-500">Sem distribuição</span>
                        ) : (
                          <span
                            className={
                              idleBrokers > 0
                                ? "font-semibold text-amber-200"
                                : "font-semibold text-emerald-200"
                            }
                            title={`${activeBrokers} de ${assignedBrokers} corretores atribuídos registraram interação.`}
                            data-report-campaign-execution={row.campaignId}
                          >
                            {activeBrokers}/{assignedBrokers} ativos
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const queue = journey?.largestQueue || campaignLargestQueue(row);
                        return queue.value > 0 ? (
                          journey?.leadRosterHref ? (
                            <Link
                              href={journey.leadRosterHref}
                              className="text-xs font-semibold text-orange-200 underline-offset-4 hover:text-orange-100 hover:underline"
                              title={`Abrir ${queue.value} leads na etapa ${queue.label}`}
                              data-report-campaign-bottleneck-action={row.campaignId}
                            >
                              {queue.label} · {queue.value}
                            </Link>
                          ) : (
                            <span className="text-xs text-orange-200">
                              {queue.label} · {queue.value}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-zinc-500">Sem fila</span>
                        );
                      })()}
                    </td>
                    <td>
                      {row.spend === null ? "Não conectado" : money(row.spend)}
                    </td>
                    <td>
                      {row.costPerQualified === null
                        ? "—"
                        : money(row.costPerQualified)}
                    </td>
                    <td className="py-3 text-right">
                      {row.campaignId === "sem-campanha" || uuidPattern.test(row.campaignId) ? (
                        <Link
                          href={
                            journey?.leadRosterHref ||
                            (row.campaignId === "sem-campanha"
                              ? leadsInMeasuredPeriodHref({
                                  quality: "missing_campaign",
                                })
                              : leadsInMeasuredPeriodHref({
                                  campaign: row.campaignId,
                                }))
                          }
                          className="text-xs font-semibold text-sky-300 hover:text-sky-100"
                          data-report-campaign-action={row.campaignId}
                        >
                          {actionLabel}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">Sem vínculo</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <h3 className="font-bold">Execução campanha × corretor</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Visão operacional, sem ranking automático.
            </p>
            <table className="mt-4 w-full min-w-[760px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3">Incorporadora / campanha</th>
                  <th>Corretor</th>
                  <th>Recebidas</th>
                  <th>Interações</th>
                  <th>Contato</th>
                  <th>Qualificadas</th>
                  <th>Vendas</th>
                  <th aria-label="Ação" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.06]">
                {visibleBrokerResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
                      Sem execução comercial registrada nesta coorte.
                    </td>
                  </tr>
                ) : null}
                {visibleBrokerResults.map((row) => {
                  const hasValidBrokerId = Boolean(row.brokerId && uuidPattern.test(row.brokerId));
                  const needsFirstContact = Boolean(row.brokerId && row.leads > row.contacted);
                  const brokerActionLabel = !row.brokerId
                    ? `Distribuir ${row.leads} lead${row.leads === 1 ? "" : "s"}`
                    : needsFirstContact
                      ? "Abrir leads sem contato"
                    : row.leads === 1
                      ? "Ver 1 lead"
                      : `Ver ${row.leads} leads`;
                  const brokerActionHref =
                    row.campaignId === "sem-campanha"
                      ? leadsInMeasuredPeriodHref({
                          quality: "missing_campaign",
                          ...(hasValidBrokerId ? { broker: row.brokerId! } : {}),
                        })
                      : uuidPattern.test(row.campaignId)
                        ? leadsInMeasuredPeriodHref({
                            campaign: row.campaignId,
                            ...(!row.brokerId
                              ? { attention: "unassigned" }
                              : hasValidBrokerId
                                ? {
                                    broker: row.brokerId,
                                    ...(needsFirstContact ? { status: "novo" } : {}),
                                  }
                                : {}),
                          })
                        : null;

                  return (
                  <tr
                    key={`${row.developer}:${row.campaignId}:${row.brokerId || "unassigned"}`}
                  >
                    <td className="py-3">
                      <span className="font-semibold">{row.developer}</span>
                      <span className="block max-w-56 truncate text-[10px] text-zinc-500">
                        {row.campaignName}
                      </span>
                    </td>
                    <td>{row.brokerName}</td>
                    <td>{row.leads}</td>
                    <td>{row.interactions}</td>
                    <td>{row.contacted}</td>
                    <td>{row.qualified}</td>
                    <td className="font-bold text-emerald-200">{row.wins}</td>
                    <td className="py-3 text-right">
                      {brokerActionHref ? (
                        <Link
                          href={brokerActionHref}
                          className="text-xs font-semibold text-sky-300 hover:text-sky-100"
                          data-report-campaign-broker-action={`${row.campaignId}:${row.brokerId || "unassigned"}`}
                        >
                          {brokerActionLabel}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">Sem vínculo</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <p className="text-[10px] leading-5 text-zinc-500">
        Governança: os resultados dependem de registros reais no CRM. Custos de
        campanhas compartilhadas são rateados proporcionalmente às leads e
        identificados na tela. Nenhuma redistribuição, alteração de campanha ou
        avaliação de pessoas é executada automaticamente.
      </p>
    </section>
  );
}
