type LeadRow = {
  id: string;
  source?: string | null;
  campaign_id?: string | null;
  campaign?: string | null;
  development_id?: string | null;
  project_id?: string | null;
  status?: string | null;
  score?: number | null;
  score_ia?: number | null;
  metadata?: unknown;
  assigned_to?: string | null;
  assigned_user_id?: string | null;
  created_at?: string | null;
  first_contacted_at?: string | null;
};
type DevelopmentRow = {
  id: string;
  name: string;
  developer_id?: string | null;
  developer_name?: string | null;
};
type DeveloperRow = {
  id: string;
  trade_name?: string | null;
  legal_name?: string | null;
};
type CampaignRow = {
  id: string;
  name?: string | null;
  developer_id?: string | null;
  development_id?: string | null;
};
type PaidInsight = {
  campaignId: string;
  campaignName?: string;
  spend: number;
  impressions?: number;
  clicks?: number;
};
type ProfileRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
};
type ActivityRow = {
  lead_id?: string | null;
  user_id?: string | null;
  type?: string | null;
  occurred_at?: string | null;
};

const STAGE_RANK: Record<string, number> = {
  novo: 0,
  contato: 1,
  qualificacao: 2,
  visita: 3,
  proposta: 4,
  contrato: 5,
  ganho: 6,
};
const STATUS_ALIASES: Record<string, string> = {
  new: "novo",
  novo_lead: "novo",
  contact: "contato",
  contato_realizado: "contato",
  em_atendimento: "contato",
  qualified: "qualificacao",
  qualificado: "qualificacao",
  meeting: "visita",
  visita_agendada: "visita",
  proposal: "proposta",
  proposta_enviada: "proposta",
  negociacao: "proposta",
  contract: "contrato",
  contrato_assinado: "contrato",
  won: "ganho",
  venda: "ganho",
  vendido: "ganho",
};

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function stage(value: unknown) {
  const valueNormalized = normalized(value);
  return STATUS_ALIASES[valueNormalized] || valueNormalized || "novo";
}

function meta(metadata: unknown) {
  if (!metadata || typeof metadata !== "object")
    return {} as Record<string, unknown>;
  const value = (metadata as Record<string, unknown>).meta;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function reached(lead: LeadRow, target: keyof typeof STAGE_RANK) {
  const current = stage(lead.status);
  return (
    current === "ganho" || (STAGE_RANK[current] ?? -1) >= STAGE_RANK[target]
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
function rate(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : null;
}
function cost(spend: number | null, outcome: number) {
  return spend !== null && outcome > 0 ? round(spend / outcome) : null;
}

function outcomes(rows: LeadRow[]) {
  const assigned = rows.filter((lead) =>
    Boolean(lead.assigned_to || lead.assigned_user_id),
  ).length;
  const contacted = rows.filter(
    (lead) => Boolean(lead.first_contacted_at) || reached(lead, "contato"),
  ).length;
  const qualified = rows.filter(
    (lead) =>
      Number(
        lead.score ??
          lead.score_ia ??
          meta(lead.metadata).qualificationScore ??
          0,
      ) >= 60 || reached(lead, "qualificacao"),
  ).length;
  const visits = rows.filter((lead) => reached(lead, "visita")).length;
  const proposals = rows.filter((lead) => reached(lead, "proposta")).length;
  const wins = rows.filter((lead) => stage(lead.status) === "ganho").length;
  return {
    leads: rows.length,
    assigned,
    contacted,
    qualified,
    visits,
    proposals,
    wins,
    unassigned: rows.length - assigned,
    contactRate: rate(contacted, rows.length),
    leadToWinRate: rate(wins, rows.length),
  };
}

function stageBreakdown(rows: LeadRow[]) {
  const result = {
    novo: 0,
    contato: 0,
    qualificacao: 0,
    visita: 0,
    proposta: 0,
    contrato: 0,
    ganho: 0,
    outros: 0,
  };
  for (const lead of rows) {
    const current = stage(lead.status);
    if (current in result) result[current as keyof typeof result] += 1;
    else result.outros += 1;
  }
  return result;
}

function serviceMetrics(rows: LeadRow[]) {
  const responseMinutes = rows.flatMap((lead) => {
    if (!lead.created_at || !lead.first_contacted_at) return [];
    const createdAt = Date.parse(lead.created_at);
    const contactedAt = Date.parse(lead.first_contacted_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(contactedAt)) return [];
    return [Math.max(0, (contactedAt - createdAt) / 60_000)];
  });
  const contactedWithin = (minutes: number) =>
    responseMinutes.filter((value) => value <= minutes).length;
  return {
    measured: responseMinutes.length,
    averageFirstContactMinutes: responseMinutes.length
      ? round(
          responseMinutes.reduce((sum, value) => sum + value, 0) /
            responseMinutes.length,
        )
      : null,
    within5Minutes: contactedWithin(5),
    within15Minutes: contactedWithin(15),
    within30Minutes: contactedWithin(30),
    within15Rate: rate(contactedWithin(15), responseMinutes.length),
    within30Rate: rate(contactedWithin(30), responseMinutes.length),
    coverageRate: rate(responseMinutes.length, rows.length),
  };
}

function saoPauloDay(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function buildWeeklyAcquisitionReport(
  leads: LeadRow[],
  developments: DevelopmentRow[],
  paid: PaidInsight[],
  profiles: ProfileRow[] = [],
  activities: ActivityRow[] = [],
  developerRows: DeveloperRow[] = [],
  campaignDefinitions: CampaignRow[] = [],
) {
  const projects = new Map(developments.map((item) => [item.id, item]));
  const developerNames = new Map(
    developerRows.map((item) => [
      item.id,
      item.trade_name?.trim() || item.legal_name?.trim() || "Incorporadora",
    ]),
  );
  const profileNames = new Map(
    profiles.map((item) => [
      item.id,
      item.full_name?.trim() || item.name?.trim() || "Corretor",
    ]),
  );
  const paidById = new Map(paid.map((item) => [item.campaignId, item]));
  const campaignById = new Map(
    campaignDefinitions.map((item) => [item.id, item]),
  );
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const activityCountByLeadAndUser = new Map<string, number>();
  for (const activity of activities) {
    if (
      !activity.lead_id ||
      !activity.user_id ||
      !leadById.has(activity.lead_id)
    )
      continue;
    const key = `${activity.lead_id}:${activity.user_id}`;
    activityCountByLeadAndUser.set(
      key,
      (activityCountByLeadAndUser.get(key) || 0) + 1,
    );
  }

  const identity = (lead: LeadRow) => {
    const leadMeta = meta(lead.metadata);
    const campaignId = String(
      leadMeta.campaignId ||
        lead.campaign_id ||
        lead.campaign ||
        "sem-campanha",
    );
    const paidRow = paidById.get(campaignId);
    const campaignRow = campaignById.get(campaignId);
    const campaignName =
      campaignRow?.name?.trim() ||
      paidRow?.campaignName ||
      String(
        leadMeta.campaignName ||
          lead.campaign ||
          (campaignId === "sem-campanha"
            ? "Sem campanha atribuída"
            : campaignId),
      );
    const developmentId =
      lead.development_id ||
      lead.project_id ||
      campaignRow?.development_id ||
      null;
    const project = developmentId ? projects.get(developmentId) : null;
    const developerId =
      campaignRow?.developer_id || project?.developer_id || null;
    const developer =
      (developerId ? developerNames.get(developerId) : null) ||
      project?.developer_name?.trim() ||
      "Sem incorporadora atribuída";
    const brokerId = lead.assigned_to || lead.assigned_user_id || null;
    const brokerName = brokerId
      ? profileNames.get(brokerId) || "Corretor não identificado"
      : "Sem corretor";
    return {
      campaignId,
      campaignName,
      developerId,
      developer,
      developmentId,
      projectName: project?.name || "Sem projeto",
      brokerId,
      brokerName,
    };
  };

  const campaigns = new Map<
    string,
    { campaignId: string; campaignName: string; leads: LeadRow[] }
  >();
  for (const lead of leads) {
    const { campaignId, campaignName } = identity(lead);
    const current = campaigns.get(campaignId) || {
      campaignId,
      campaignName,
      leads: [],
    };
    current.leads.push(lead);
    campaigns.set(campaignId, current);
  }
  for (const insight of paid)
    if (!campaigns.has(insight.campaignId))
      campaigns.set(insight.campaignId, {
        campaignId: insight.campaignId,
        campaignName: insight.campaignName || insight.campaignId,
        leads: [],
      });

  const campaignRows = [...campaigns.values()]
    .map((campaign) => {
      const insight = paidById.get(campaign.campaignId);
      const spend = insight?.spend ?? null;
      const result = outcomes(campaign.leads);
      const developerCounts = new Map<string, number>();
      for (const lead of campaign.leads) {
        const developer = identity(lead).developer;
        developerCounts.set(
          developer,
          (developerCounts.get(developer) || 0) + 1,
        );
      }
      const campaignDefinition = campaignById.get(campaign.campaignId);
      const responsibleDeveloperId = campaignDefinition?.developer_id || null;
      const responsibleDeveloper = responsibleDeveloperId
        ? developerNames.get(responsibleDeveloperId) ||
          "Incorporadora não identificada"
        : developerCounts.size === 1
          ? [...developerCounts.keys()][0]
          : "Não informada";
      return {
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        responsibleDeveloperId,
        responsibleDeveloper,
        ...result,
        spend,
        cpl: cost(spend, result.leads),
        costPerQualified: cost(spend, result.qualified),
        costPerWin: cost(spend, result.wins),
        developers: [...developerCounts.entries()].map(
          ([developer, count]) => ({ developer, leads: count }),
        ),
        costSource: insight ? "meta_ads_7d" : "unavailable",
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        (b.spend ?? -1) - (a.spend ?? -1) ||
        b.leads - a.leads,
    );

  const developerGroups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const leadIdentity = identity(lead);
    const developerKey = leadIdentity.developerId || leadIdentity.developer;
    developerGroups.set(developerKey, [
      ...(developerGroups.get(developerKey) || []),
      lead,
    ]);
  }
  const developers = [...developerGroups.entries()]
    .map(([, developerLeads]) => {
      const firstIdentity = identity(developerLeads[0]);
      const developer = firstIdentity.developer;
      const result = outcomes(developerLeads);
      let allocatedSpend = 0;
      let hasKnownSpend = false;
      let exactSpend = true;
      const campaignIds = new Set<string>();
      for (const lead of developerLeads)
        campaignIds.add(identity(lead).campaignId);
      for (const campaign of campaignRows) {
        const split = campaign.developers.find(
          (item) => item.developer === developer,
        );
        if (!split || campaign.spend === null || campaign.leads === 0) continue;
        hasKnownSpend = true;
        allocatedSpend += (campaign.spend * split.leads) / campaign.leads;
        if (campaign.developers.length > 1) exactSpend = false;
      }
      const spend = hasKnownSpend ? round(allocatedSpend) : null;
      return {
        developerId: firstIdentity.developerId,
        developer,
        ...result,
        spend,
        cpl: cost(spend, result.leads),
        costPerQualified: cost(spend, result.qualified),
        costPerWin: cost(spend, result.wins),
        campaigns: campaignIds.size,
        brokers: new Set(
          developerLeads.map((lead) => identity(lead).brokerId).filter(Boolean),
        ).size,
        projects: new Set(
          developerLeads
            .map((lead) => identity(lead).developmentId)
            .filter(Boolean),
        ).size,
        allocation: exactSpend ? "direct" : "proportional_by_leads",
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.qualified - a.qualified || b.leads - a.leads,
    );

  const brokerGroups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const key = [
      identity(lead).developer,
      identity(lead).campaignId,
      identity(lead).brokerId || "unassigned",
    ].join("::");
    brokerGroups.set(key, [...(brokerGroups.get(key) || []), lead]);
  }
  const brokerResults = [...brokerGroups.values()]
    .map((brokerLeads) => {
      const first = identity(brokerLeads[0]);
      const interactions = brokerLeads.reduce(
        (sum, lead) =>
          sum +
          (first.brokerId
            ? activityCountByLeadAndUser.get(`${lead.id}:${first.brokerId}`) ||
              0
            : 0),
        0,
      );
      return {
        developerId: first.developerId,
        developer: first.developer,
        developmentId: first.developmentId,
        projectName: first.projectName,
        campaignId: first.campaignId,
        campaignName: first.campaignName,
        brokerId: first.brokerId,
        brokerName: first.brokerName,
        interactions,
        stages: stageBreakdown(brokerLeads),
        ...outcomes(brokerLeads),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.interactions - a.interactions ||
        b.qualified - a.qualified ||
        b.leads - a.leads,
    );

  const projectGroups = new Map<string, LeadRow[]>();
  const projectBrokerGroups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const current = identity(lead);
    const projectKey = `${current.developerId || current.developer}::${current.developmentId || "sem-projeto"}`;
    projectGroups.set(projectKey, [
      ...(projectGroups.get(projectKey) || []),
      lead,
    ]);
    const brokerKey = `${projectKey}::${current.brokerId || "unassigned"}`;
    projectBrokerGroups.set(brokerKey, [
      ...(projectBrokerGroups.get(brokerKey) || []),
      lead,
    ]);
  }
  const projectResults = [...projectGroups.values()]
    .map((projectLeads) => {
      const first = identity(projectLeads[0]);
      return {
        developerId: first.developerId,
        developer: first.developer,
        developmentId: first.developmentId,
        projectName: first.projectName,
        brokers: new Set(
          projectLeads.map((lead) => identity(lead).brokerId).filter(Boolean),
        ).size,
        stages: stageBreakdown(projectLeads),
        service: serviceMetrics(projectLeads),
        ...outcomes(projectLeads),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.qualified - a.qualified || b.leads - a.leads,
    );
  const projectBrokerResults = [...projectBrokerGroups.values()]
    .map((brokerLeads) => {
      const first = identity(brokerLeads[0]);
      const interactions = brokerLeads.reduce(
        (sum, lead) =>
          sum +
          (first.brokerId
            ? activityCountByLeadAndUser.get(`${lead.id}:${first.brokerId}`) ||
              0
            : 0),
        0,
      );
      return {
        developerId: first.developerId,
        developer: first.developer,
        developmentId: first.developmentId,
        projectName: first.projectName,
        brokerId: first.brokerId,
        brokerName: first.brokerName,
        interactions,
        stages: stageBreakdown(brokerLeads),
        ...outcomes(brokerLeads),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.interactions - a.interactions ||
        b.qualified - a.qualified ||
        b.leads - a.leads,
    );

  const dailyDistributionGroups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const date = saoPauloDay(lead.created_at);
    if (!date) continue;
    const current = identity(lead);
    const key = [
      date,
      current.developerId || current.developer,
      current.developmentId || "sem-projeto",
      current.brokerId || "sem-corretor",
    ].join("::");
    dailyDistributionGroups.set(key, [
      ...(dailyDistributionGroups.get(key) || []),
      lead,
    ]);
  }
  const dailyDistribution = [...dailyDistributionGroups.values()]
    .map((group) => {
      const first = identity(group[0]);
      return {
        date: saoPauloDay(group[0].created_at)!,
        developerId: first.developerId,
        developer: first.developer,
        developmentId: first.developmentId,
        projectName: first.projectName,
        brokerId: first.brokerId,
        brokerName: first.brokerName,
        ...outcomes(group),
      };
    })
    .sort(
      (first, second) =>
        second.date.localeCompare(first.date) ||
        second.leads - first.leads ||
        first.projectName.localeCompare(second.projectName) ||
        first.brokerName.localeCompare(second.brokerName),
    );

  const totalSpend = paid.length
    ? round(paid.reduce((sum, item) => sum + item.spend, 0))
    : null;
  const total = outcomes(leads);
  const missingProject = leads.filter(
    (lead) => !identity(lead).developmentId,
  ).length;
  const missingDeveloper = leads.filter(
    (lead) => identity(lead).developer === "Sem incorporadora atribuída",
  ).length;
  const missingCampaign = leads.filter(
    (lead) => identity(lead).campaignId === "sem-campanha",
  ).length;
  const missingSource = leads.filter((lead) => !normalized(lead.source)).length;
  const completeAttribution = leads.filter((lead) => {
    const current = identity(lead);
    return (
      Boolean(current.developmentId) &&
      current.developer !== "Sem incorporadora atribuída" &&
      current.campaignId !== "sem-campanha" &&
      Boolean(normalized(lead.source))
    );
  }).length;
  return {
    totals: {
      ...total,
      spend: totalSpend,
      cpl: cost(totalSpend, total.leads),
      costPerQualified: cost(totalSpend, total.qualified),
      costPerWin: cost(totalSpend, total.wins),
      campaigns: campaignRows.length,
      developers: developers.length,
      interactions: activities.filter((activity) =>
        Boolean(activity.lead_id && leadById.has(activity.lead_id)),
      ).length,
    },
    campaigns: campaignRows,
    developers,
    projectResults,
    brokerResults,
    projectBrokerResults,
    dailyDistribution,
    service: serviceMetrics(leads),
    dataQuality: {
      completeAttribution,
      missingProject,
      missingDeveloper,
      missingCampaign,
      missingSource,
      unassigned: total.unassigned,
      projectCoverageRate: rate(leads.length - missingProject, leads.length),
      developerCoverageRate: rate(
        leads.length - missingDeveloper,
        leads.length,
      ),
      campaignCoverageRate: rate(leads.length - missingCampaign, leads.length),
      sourceCoverageRate: rate(leads.length - missingSource, leads.length),
    },
    governance: {
      window: "last_7d",
      cohort: "leads_created_in_window",
      crmIsOutcomeTruth: true,
      spendSource: paid.length ? "Meta Ads Insights" : "Não disponível",
      mixedCampaignAllocation:
        "Custo dividido proporcionalmente às leads quando uma campanha atende mais de uma incorporadora.",
      resultDefinition:
        "Contato, qualificação, visita, proposta e venda contam somente quando registrados no CRM.",
      brokerScope:
        "Interações e avanço das leads captadas na semana; sem ranking automático de pessoas.",
      automaticDecisions: false,
    },
  };
}
