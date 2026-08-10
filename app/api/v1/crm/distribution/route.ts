import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  LIVE_PROFILE_SELECT,
  resolveLiveHierarchy,
} from "@/lib/compat/live-hierarchy";
import { buildDistributionEvidence } from "@/lib/crm/distribution-evidence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const archived = new Set(["arquivado", "archived"]);
const availabilityOptions = new Set(["available", "busy", "offline"]);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const integer = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

type DistributionBody = {
  action?: string;
  availability?: string;
  developmentId?: string;
  profileId?: string;
  enabled?: boolean;
  weight?: number;
  limit?: number;
  endsAt?: string;
  reason?: string;
  maxActiveLeads?: number;
  maxProjectLeads?: number;
  warningPercent?: number;
  sourceKey?: string;
  priority?: number;
  slaMinutes?: number;
  members?: Array<{ profileId?: string; enabled?: boolean; weight?: number }>;
};

function resolvedRole(commercialRole: string | null, role: string) {
  return commercialRole || (role === "admin" ? "director" : role);
}

function isMissingSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(
      error.code || "",
    ) || /does not exist|schema cache|could not find/i.test(error.message || "")
  );
}

function safeAuditFallback() {
  return {
    events: [],
    summary: {
      total: 0,
      distributions: 0,
      transfers: 0,
      reservations: 0,
      returns: 0,
      absences: 0,
      capacityChanges: 0,
    },
    maximum: 100,
    hierarchicalScope: true,
    piiExposed: false,
    immutableSources: true,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    limit: 90,
    scope: "crm-distribution-read",
  });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const role = resolvedRole(
    identity.access.profile.commercialRole,
    identity.access.profile.role,
  );
  if (role !== "director") {
    return apiError(
      "FORBIDDEN",
      "A fila comercial é configurada somente pela diretoria.",
      identity.meta,
      { status: 403 },
    );
  }

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const [profilesResult, developmentsResult, leadsResult] = await Promise.all([
    identity.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    admin
      .from("developments")
      .select("id,name,developer_name,status")
      .eq("organization_id", organizationId)
      .order("name"),
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .limit(5000),
  ]);

  if (profilesResult.error || leadsResult.error) {
    structuredApiLog(
      "error",
      "crm.distribution.core_lookup_failed",
      request,
      identity.meta,
      {
        organizationId,
        profilesError: profilesResult.error?.message,
        leadsError: leadsResult.error?.message,
      },
    );
    return apiError(
      "DISTRIBUTION_LOOKUP_FAILED",
      "Não foi possível carregar a fila comercial agora.",
      identity.meta,
      { status: 503 },
    );
  }

  let projects = developmentsResult.data ?? [];
  let projectCompatibility = "canonical";
  if (developmentsResult.error && isMissingSchema(developmentsResult.error)) {
    const legacyProjects = await identity.supabase
      .from("crm_projects")
      .select("id,name,developer_name,status")
      .eq("organization_id", organizationId)
      .order("name");
    if (legacyProjects.error) {
      structuredApiLog(
        "error",
        "crm.distribution.projects_lookup_failed",
        request,
        identity.meta,
        {
          organizationId,
          canonicalError: developmentsResult.error.message,
          legacyError: legacyProjects.error.message,
        },
      );
      return apiError(
        "DISTRIBUTION_LOOKUP_FAILED",
        "Não foi possível carregar os projetos da distribuição.",
        identity.meta,
        { status: 503 },
      );
    }
    projects = legacyProjects.data ?? [];
    projectCompatibility = "legacy-read-only";
  } else if (developmentsResult.error) {
    structuredApiLog(
      "error",
      "crm.distribution.projects_lookup_failed",
      request,
      identity.meta,
      {
        organizationId,
        error: developmentsResult.error.message,
      },
    );
    return apiError(
      "DISTRIBUTION_LOOKUP_FAILED",
      "Não foi possível carregar os projetos da distribuição.",
      identity.meta,
      { status: 503 },
    );
  }

  const hierarchy = resolveLiveHierarchy(
    (profilesResult.data ?? []) as unknown as CompatRow[],
  );
  const allowed = new Set(hierarchy.map((profile) => text(profile.id)));
  const profiles = hierarchy.filter((profile) => allowed.has(text(profile.id)));
  const profileIds = new Set(profiles.map((profile) => text(profile.id)));
  const projectIds = new Set(projects.map((project) => text(project.id)));
  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[])
    .map((row) => mapLegacyLead(row))
    .filter((lead) => !archived.has(text(lead.status).toLowerCase()));

  const [
    presenceResult,
    queueResult,
    canonicalRosterResult,
    capacityResult,
    priorityResult,
    sourceMembersResult,
    assignmentsResult,
    auditResult,
  ] = await Promise.all([
    admin
      .from("commercial_presence")
      .select("profile_id,availability,last_seen_at,updated_at")
      .eq("organization_id", organizationId),
    admin
      .from("project_distribution_members")
      .select(
        "profile_id,development_id,enabled,weight,assignments_count,last_assigned_at,updated_at",
      )
      .eq("organization_id", organizationId),
    admin
      .from("distribution_roster")
      .select(
        "profile_id,escopo,escopo_id,ativo,posicao,created_at,updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("escopo", "projeto"),
    admin
      .from("broker_capacity_limits")
      .select(
        "profile_id,max_active_leads,max_project_leads,warning_percent,updated_at",
      )
      .eq("organization_id", organizationId),
    admin
      .from("lead_distribution_priority_rules")
      .select(
        "development_id,source_key,priority,sla_minutes,enabled,updated_at",
      )
      .eq("organization_id", organizationId),
    admin
      .from("lead_source_distribution_members")
      .select("profile_id,enabled,weight,configured_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("source_key", "meta"),
    admin
      .from("lead_distribution_events")
      .select("id,development_id,lead_id,assigned_to,created_at,score_snapshot")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.rpc("get_portfolio_audit_ledger", {
      p_actor_id: identity.access.profile.id,
      p_organization_id: organizationId,
      p_limit: 100,
    }),
  ]);

  const advancedErrors = [
    presenceResult.error,
    queueResult.error,
    canonicalRosterResult.error,
    capacityResult.error,
    priorityResult.error,
    sourceMembersResult.error,
    assignmentsResult.error,
    auditResult.error,
  ].filter(Boolean);
  if (advancedErrors.some((error) => !isMissingSchema(error))) {
    structuredApiLog(
      "warn",
      "crm.distribution.advanced_lookup_degraded",
      request,
      identity.meta,
      {
        organizationId,
        errors: advancedErrors.map((error) => error?.message),
      },
    );
  }

  const realPresence = new Map(
    (presenceResult.data ?? [])
      .filter((item) => profileIds.has(text(item.profile_id)))
      .map((item) => [text(item.profile_id), item]),
  );
  const presence = profiles.map((profile) => {
    const current = realPresence.get(text(profile.id));
    const availability = text(current?.availability || "offline").toLowerCase();
    const lastSeenAt = current?.last_seen_at || profile.created_at;
    return {
      profile_id: profile.id,
      availability,
      last_seen_at: lastSeenAt,
      online:
        availability !== "offline" &&
        Date.parse(text(lastSeenAt)) >= Date.now() - 90_000,
    };
  });

  const configuredQueue = new Map(
    (queueResult.data ?? [])
      .filter(
        (item) =>
          profileIds.has(text(item.profile_id)) &&
          projectIds.has(text(item.development_id)),
      )
      .map((item) => [`${item.profile_id}:${item.development_id}`, item]),
  );
  const canonicalRosterAvailable = !canonicalRosterResult.error;
  const canonicalConfiguredProjects = new Set(
    (canonicalRosterResult.data ?? [])
      .filter((item) => projectIds.has(text(item.escopo_id)))
      .map((item) => text(item.escopo_id)),
  );
  const canonicalRoster = new Map(
    (canonicalRosterResult.data ?? [])
      .filter(
        (item) =>
          profileIds.has(text(item.profile_id)) &&
          projectIds.has(text(item.escopo_id)),
      )
      .map((item) => [`${item.profile_id}:${item.escopo_id}`, item]),
  );
  const queue = profiles
    .filter((profile) => profile.commercial_role === "broker")
    .flatMap((profile) =>
      projects.map((project) => {
        const configured = configuredQueue.get(`${profile.id}:${project.id}`);
        const canonical = canonicalRoster.get(`${profile.id}:${project.id}`);
        const canonicalProjectConfigured = canonicalConfiguredProjects.has(
          text(project.id),
        );
        return {
          profile_id: profile.id,
          development_id: project.id,
          enabled: canonicalProjectConfigured
            ? Boolean(canonical?.ativo)
            : configured?.enabled ?? true,
          weight: configured?.weight ?? 1,
          position: canonical?.posicao ?? null,
          assignments_count: configured?.assignments_count ?? 0,
          last_assigned_at: configured?.last_assigned_at ?? null,
          configured: canonicalProjectConfigured || Boolean(configured),
          roster_source: canonicalProjectConfigured ? "canonical" : "legacy",
        };
      }),
    );

  const configuredCapacity = new Map(
    (capacityResult.data ?? [])
      .filter((item) => profileIds.has(text(item.profile_id)))
      .map((item) => [text(item.profile_id), item]),
  );
  const capacity = profiles
    .filter((profile) => profile.commercial_role === "broker")
    .map((profile) => {
      const configured = configuredCapacity.get(text(profile.id));
      return {
        profile_id: profile.id,
        max_active_leads: configured?.max_active_leads ?? 100,
        max_project_leads: configured?.max_project_leads ?? 50,
        warning_percent: configured?.warning_percent ?? 80,
        updated_at: configured?.updated_at || profile.created_at,
        configured: Boolean(configured),
      };
    });

  const priorityRules = (priorityResult.data ?? []).filter((item) =>
    projectIds.has(text(item.development_id)),
  );
  const recentAssignments = (assignmentsResult.data ?? []).filter((item) =>
    profileIds.has(item.assigned_to),
  );
  const portfolioAudit =
    auditResult.error || !auditResult.data
      ? safeAuditFallback()
      : auditResult.data;

  const unassignedQueue = leads
    .filter((lead) => !lead.assigned_to)
    .sort(
      (a, b) => Date.parse(text(a.created_at)) - Date.parse(text(b.created_at)),
    )
    .slice(0, 100)
    .map((lead) => ({
      id: lead.id,
      developmentId: lead.development_id,
      source: lead.source || "não informada",
      status: lead.status || "novo",
      createdAt: lead.created_at,
      waitingMinutes: Math.max(
        0,
        Math.floor((Date.now() - Date.parse(text(lead.created_at))) / 60_000),
      ),
    }));

  const leadSources = [
    ...new Set(
      leads.map((lead) =>
        text(lead.source || "não informada")
          .trim()
          .toLowerCase(),
      ),
    ),
  ]
    .filter(Boolean)
    .sort()
    .slice(0, 100);

  const distributionEvidence = buildDistributionEvidence({
    leads: leads.map((lead) => ({
      id: text(lead.id),
      development_id: text(lead.development_id) || null,
      assigned_to: text(lead.assigned_to) || null,
      created_at: text(lead.created_at) || null,
    })),
    assignments: recentAssignments.map((assignment) => ({
      development_id: text(assignment.development_id) || null,
      lead_id: text(assignment.lead_id),
      assigned_to: text(assignment.assigned_to),
      created_at: text(assignment.created_at),
    })),
    queue: queue.map((member) => ({
      development_id: text(member.development_id),
      profile_id: text(member.profile_id),
      enabled: Boolean(member.enabled),
      weight: integer(member.weight, 1),
    })),
    projectIds: projects.map((project) => text(project.id)),
    maximumEvents: 100,
  });

  return apiSuccess(
    {
      viewer: { id: identity.access.profile.id, role },
      compatibility: {
        projects: projectCompatibility,
        advancedDistribution:
          advancedErrors.length === 0 ? "operational" : "ddl-required",
        roster: canonicalRosterAvailable ? "canonical-v6" : "legacy-v4",
      },
      rules: {
        algorithm: canonicalRosterAvailable
          ? "sla_campaign_project_roster_reservation_v6"
          : "sla_source_priority_reservation_v4",
        presenceWindowSeconds: 90,
        acceptanceMinutes: 5,
        onlineOnly: true,
        projectScoped: true,
        weightedLoad: true,
        atomicLock: true,
        singleOwner: true,
        explainable: true,
      },
      projects,
      profiles: profiles.map((profile) => ({
        ...profile,
        full_name: profile.full_name || profile.name,
        resolved_role: profile.commercial_role,
      })),
      presence,
      queue,
      capacity,
      priorityRules,
      metaRecipients: (sourceMembersResult.data ?? [])
        .filter((item) => profileIds.has(text(item.profile_id)))
        .map((item) => ({
          profile_id: text(item.profile_id),
          enabled: Boolean(item.enabled),
          weight: integer(item.weight, 1),
          configured_at: item.configured_at || null,
          updated_at: item.updated_at || null,
        })),
      recentAssignments,
      distributionEvidence,
      leadSources,
      portfolioAudit: auditResult.data || portfolioAudit,
      unassignedQueue,
      unassignedPolicy: {
        metadataOnly: true,
        piiExposed: false,
        automaticAssignment: false,
        explicitLeadershipAction: true,
        maximumVisible: 100,
      },
      loads: profiles.map((profile) => ({
        profile_id: profile.id,
        total: leads.filter(
          (lead) => text(lead.assigned_to) === text(profile.id),
        ).length,
        by_project: Object.fromEntries(
          projects.map((project) => [
            project.id,
            leads.filter(
              (lead) =>
                text(lead.assigned_to) === text(profile.id) &&
                text(lead.development_id) === project.id,
            ).length,
          ]),
        ),
      })),
      unassigned: Object.fromEntries(
        projects.map((project) => [
          project.id,
          leads.filter(
            (lead) =>
              !lead.assigned_to && text(lead.development_id) === project.id,
          ).length,
        ]),
      ),
      generatedAt: new Date().toISOString(),
      scopedProfileCount: profileIds.size,
    },
    identity.meta,
    { headers: limited.headers },
  );
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    limit: 120,
    scope: "crm-distribution-write",
  });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const body = (await request
    .json()
    .catch(() => null)) as DistributionBody | null;
  if (!body?.action) {
    return apiError(
      "INVALID_DISTRIBUTION_ACTION",
      "Informe a ação da fila comercial.",
      identity.meta,
      { status: 400 },
    );
  }

  const organizationId = identity.access.organization.id;
  const actorId = identity.access.profile.id;
  const role = resolvedRole(
    identity.access.profile.commercialRole,
    identity.access.profile.role,
  );
  const admin = getSupabaseAdmin();

  if (body.action === "heartbeat") {
    const availability = availabilityOptions.has(body.availability || "")
      ? body.availability!
      : "available";
    const heartbeatResult = await admin.rpc("touch_commercial_presence", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_availability: availability,
    });
    if (heartbeatResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.presence_failed",
        request,
        identity.meta,
        {
          actorId,
          error: heartbeatResult.error.message,
        },
      );
      return apiError(
        "PRESENCE_UPDATE_FAILED",
        "Não foi possível atualizar sua disponibilidade.",
        identity.meta,
        { status: 503 },
      );
    }
    return apiSuccess(
      { availability, online: availability !== "offline" },
      identity.meta,
      { headers: limited.headers },
    );
  }

  // Heartbeat é a única ação pessoal deste endpoint. Toda leitura ou mutação
  // da roleta é uma decisão de diretoria, inclusive a distribuição imediata.
  if (role !== "director") {
    return apiError(
      "FORBIDDEN",
      "Somente a diretoria pode alterar a distribuição.",
      identity.meta,
      { status: 403 },
    );
  }

  if (body.action === "distribute") {
    const developmentId = text(body.developmentId);
    const limit = integer(body.limit, 1);
    if (!developmentId || limit < 1 || limit > 100) {
      return apiError(
        "INVALID_DISTRIBUTION_BATCH",
        "Selecione um projeto e um lote entre 1 e 100 leads.",
        identity.meta,
        { status: 400 },
      );
    }
    let distributionResult = await admin.rpc("distribute_project_leads_v6", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_development_id: developmentId,
      p_limit: limit,
      p_acceptance_minutes: 5,
    });
    let distributionVersion = "v6";
    if (distributionResult.error && isMissingSchema(distributionResult.error)) {
      distributionVersion = "v4-compatibility";
      distributionResult = await admin.rpc("distribute_project_leads_v4", {
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_development_id: developmentId,
        p_limit: limit,
        p_acceptance_minutes: 5,
      });
    }
    if (distributionResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.rejected",
        request,
        identity.meta,
        {
          actorId,
          organizationId,
          developmentId,
          limit,
          distributionVersion,
          error: distributionResult.error.message,
        },
      );
      return apiError(
        "DISTRIBUTION_REJECTED",
        "A distribuição não foi concluída. Revise presença, capacidade e as migrations da fila.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.completed",
      request,
      identity.meta,
      {
        actorId,
        organizationId,
        developmentId,
        limit,
        distributionVersion,
        distributed: distributionResult.data?.distributed,
      },
    );
    return apiSuccess(distributionResult.data, identity.meta, {
      headers: limited.headers,
    });
  }

  const profilesResult = await admin
    .from("profiles")
    .select(LIVE_PROFILE_SELECT)
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (profilesResult.error) {
    return apiError(
      "DISTRIBUTION_SCOPE_UNAVAILABLE",
      "Não foi possível validar o escopo da equipe.",
      identity.meta,
      { status: 503 },
    );
  }
  const hierarchy = resolveLiveHierarchy(
    (profilesResult.data ?? []) as unknown as CompatRow[],
  );

  if (body.action === "configure_source_members") {
    const sourceKey = text(body.sourceKey).trim().toLowerCase();
    const reason = text(body.reason).trim();
    const members = Array.isArray(body.members) ? body.members : [];
    const uniqueMembers = new Map(
      members.map((member) => [text(member.profileId), member]),
    );
    const selected = [...uniqueMembers.entries()].map(([profileId, member]) => ({
      profile: hierarchy.find((profile) => text(profile.id) === profileId),
      weight: integer(member.weight, 1),
    }));
    const invalid =
      sourceKey !== "meta" ||
      reason.length < 10 ||
      reason.length > 500 ||
      members.length < 1 ||
      members.length > 25 ||
      uniqueMembers.size !== members.length ||
      uniqueMembers.has("") ||
      selected.some(
        ({ profile, weight }) =>
          !profile || profile.commercial_role !== "broker" || weight < 1 || weight > 10,
      );
    if (invalid) {
      return apiError(
        "INVALID_META_RECIPIENTS",
        "Selecione corretores válidos, sem repetição, e informe um motivo auditável.",
        identity.meta,
        { status: 400 },
      );
    }
    const result = await admin.rpc("configure_source_distribution_members", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_source_key: "meta",
      p_members: selected.map(({ profile, weight }) => ({
        profile_id: profile!.id,
        weight,
      })),
      p_reason: reason,
    });
    if (result.error) {
      structuredApiLog("warn", "crm.distribution.meta_recipients_rejected", request, identity.meta, {
        actorId,
        organizationId,
        recipientCount: selected.length,
        error: result.error.message,
      });
      return apiError(
        "META_RECIPIENTS_REJECTED",
        "Não foi possível salvar a roleta exclusiva da Meta. Confirme que a atualização da fila foi aplicada.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog("info", "crm.distribution.meta_recipients_configured", request, identity.meta, {
      actorId,
      organizationId,
      recipientCount: selected.length,
    });
    return apiSuccess(result.data, identity.meta, { headers: limited.headers });
  }
  const target = hierarchy.find(
    (profile) => text(profile.id) === body.profileId,
  );

  const allowed = new Set(hierarchy.map((profile) => text(profile.id)));

  if (body.action === "configure_members") {
    const developmentId = text(body.developmentId);
    const members = Array.isArray(body.members) ? body.members : [];
    if (!developmentId || members.length < 1 || members.length > 100) {
      return apiError(
        "INVALID_DISTRIBUTION_ROSTER",
        "Selecione um projeto e entre 1 e 100 corretores.",
        identity.meta,
        { status: 400 },
      );
    }
    const uniqueMembers = new Map(
      members.map((member) => [text(member.profileId), member]),
    );
    if (uniqueMembers.size !== members.length || uniqueMembers.has("")) {
      return apiError(
        "INVALID_DISTRIBUTION_ROSTER",
        "A lista da roleta contém corretores inválidos ou repetidos.",
        identity.meta,
        { status: 400 },
      );
    }
    const scopedTargets = [...uniqueMembers.entries()].map(
      ([profileId, member]) => ({
        profile: hierarchy.find((profile) => text(profile.id) === profileId),
        enabled: member.enabled,
        weight: integer(member.weight, 1),
      }),
    );
    const hasInvalidTarget = scopedTargets.some(
      ({ profile, enabled, weight }) =>
        !profile ||
        profile.commercial_role !== "broker" ||
        !allowed.has(text(profile.id)) ||
        typeof enabled !== "boolean" ||
        weight < 1 ||
        weight > 10,
    );
    if (hasInvalidTarget) {
      return apiError(
        "BROKER_OUT_OF_SCOPE",
        "Um ou mais corretores não pertencem ao seu escopo comercial.",
        identity.meta,
        { status: 403 },
      );
    }
    const enabledCount = scopedTargets.filter((member) => member.enabled).length;
    if (enabledCount < 1) {
      return apiError(
        "EMPTY_DISTRIBUTION_ROSTER",
        "Selecione ao menos um corretor para receber leads deste projeto.",
        identity.meta,
        { status: 400 },
      );
    }
    const development = await admin
      .from("developments")
      .select("id")
      .eq("id", developmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (development.error || !development.data) {
      return apiError(
        "DEVELOPMENT_OUT_OF_SCOPE",
        "O projeto informado não pertence a esta organização.",
        identity.meta,
        { status: 404 },
      );
    }
    const rosterResult = await admin.rpc(
      "configure_project_distribution_roster_v1",
      {
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_development_id: developmentId,
        p_members: scopedTargets.map(({ profile, enabled, weight }) => ({
          profile_id: profile!.id,
          enabled,
          weight,
        })),
      },
    );
    if (rosterResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.roster_rejected",
        request,
        identity.meta,
        {
          actorId,
          developmentId,
          memberCount: scopedTargets.length,
          error: rosterResult.error.message,
        },
      );
      return apiError(
        "DISTRIBUTION_ROSTER_REJECTED",
        "Não foi possível salvar a equipe deste projeto.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.roster_configured",
      request,
      identity.meta,
      {
        actorId,
        developmentId,
        memberCount: scopedTargets.length,
        enabledCount,
      },
    );
    return apiSuccess(
      {
        members: rosterResult.data,
        configured: scopedTargets.length,
        enabled: enabledCount,
        source: "canonical-v6",
      },
      identity.meta,
      { headers: limited.headers },
    );
  }

  if (
    !target ||
    target.commercial_role !== "broker" ||
    !allowed.has(text(target.id))
  ) {
    return apiError(
      "BROKER_OUT_OF_SCOPE",
      "O corretor informado não pertence ao seu escopo comercial.",
      identity.meta,
      { status: 403 },
    );
  }

  if (body.action === "configure_member") {
    const developmentId = text(body.developmentId);
    const weight = integer(body.weight, 1);
    if (
      !developmentId ||
      typeof body.enabled !== "boolean" ||
      weight < 1 ||
      weight > 10
    ) {
      return apiError(
        "INVALID_DISTRIBUTION_MEMBER",
        "Informe projeto, elegibilidade e peso entre 1 e 10.",
        identity.meta,
        { status: 400 },
      );
    }
    const development = await admin
      .from("developments")
      .select("id")
      .eq("id", developmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (development.error || !development.data) {
      return apiError(
        "DEVELOPMENT_OUT_OF_SCOPE",
        "O projeto informado não pertence a esta organização.",
        identity.meta,
        { status: 404 },
      );
    }
    const memberResult = await admin.rpc(
      "configure_project_distribution_member_v1",
      {
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_development_id: developmentId,
        p_profile_id: target.id,
        p_enabled: body.enabled,
        p_weight: weight,
      },
    );
    if (memberResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.member_rejected",
        request,
        identity.meta,
        {
          actorId,
          profileId: target.id,
          developmentId,
          error: memberResult.error.message,
        },
      );
      return apiError(
        "DISTRIBUTION_MEMBER_REJECTED",
        "Não foi possível atualizar a elegibilidade do corretor.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.member_configured",
      request,
      identity.meta,
      {
        actorId,
        profileId: target.id,
        developmentId,
        enabled: body.enabled,
        weight,
      },
    );
    return apiSuccess(memberResult.data, identity.meta, {
      headers: limited.headers,
    });
  }

  if (body.action === "cover_absence") {
    const reason = text(body.reason).trim();
    const limit = integer(body.limit, 200);
    const endsAt = text(body.endsAt);
    if (
      reason.length < 10 ||
      reason.length > 500 ||
      limit < 1 ||
      limit > 200 ||
      !endsAt ||
      !Number.isFinite(Date.parse(endsAt))
    ) {
      return apiError(
        "INVALID_ABSENCE_COVERAGE",
        "Informe período, motivo auditável e um lote válido.",
        identity.meta,
        { status: 400 },
      );
    }
    const absenceResult = await admin.rpc("redistribute_absent_broker_leads", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_broker_id: target.id,
      p_ends_at: endsAt,
      p_reason: reason,
      p_limit: limit,
    });
    if (absenceResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.absence_rejected",
        request,
        identity.meta,
        {
          actorId,
          profileId: target.id,
          error: absenceResult.error.message,
        },
      );
      return apiError(
        "ABSENCE_REDISTRIBUTION_REJECTED",
        "A cobertura não foi aplicada. Confirme equipe disponível, período e capacidade.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.absence_covered",
      request,
      identity.meta,
      {
        actorId,
        profileId: target.id,
        transferred: absenceResult.data?.transferred,
        endsAt,
      },
    );
    return apiSuccess(absenceResult.data, identity.meta, {
      headers: limited.headers,
    });
  }

  if (body.action === "configure_capacity") {
    const reason = text(body.reason).trim();
    const maxActiveLeads = integer(body.maxActiveLeads, 100);
    const maxProjectLeads = integer(body.maxProjectLeads, 50);
    const warningPercent = integer(body.warningPercent, 80);
    if (
      reason.length < 10 ||
      reason.length > 500 ||
      maxActiveLeads < 1 ||
      maxActiveLeads > 2000 ||
      maxProjectLeads < 1 ||
      maxProjectLeads > 1000 ||
      maxProjectLeads > maxActiveLeads ||
      warningPercent < 50 ||
      warningPercent > 95
    ) {
      return apiError(
        "INVALID_CAPACITY",
        "Revise os limites, o percentual de alerta e o motivo auditável.",
        identity.meta,
        { status: 400 },
      );
    }
    const capacityResult = await admin.rpc("configure_broker_capacity", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_profile_id: target.id,
      p_max_active_leads: maxActiveLeads,
      p_max_project_leads: maxProjectLeads,
      p_warning_percent: warningPercent,
      p_reason: reason,
    });
    if (capacityResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.capacity_rejected",
        request,
        identity.meta,
        {
          actorId,
          profileId: target.id,
          error: capacityResult.error.message,
        },
      );
      return apiError(
        "CAPACITY_UPDATE_REJECTED",
        "Não foi possível atualizar a capacidade desta carteira.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.capacity_configured",
      request,
      identity.meta,
      {
        actorId,
        profileId: target.id,
        maxActiveLeads,
        maxProjectLeads,
        warningPercent,
      },
    );
    return apiSuccess(capacityResult.data, identity.meta, {
      headers: limited.headers,
    });
  }

  if (body.action === "configure_priority") {
    const developmentId = text(body.developmentId);
    const sourceKey = text(body.sourceKey).trim().toLowerCase();
    const reason = text(body.reason).trim();
    const priority = integer(body.priority, 5);
    const slaMinutes = integer(body.slaMinutes, 60);
    if (
      !developmentId ||
      !sourceKey ||
      sourceKey.length > 120 ||
      reason.length < 10 ||
      reason.length > 500 ||
      priority < 1 ||
      priority > 10 ||
      slaMinutes < 5 ||
      slaMinutes > 10_080
    ) {
      return apiError(
        "INVALID_DISTRIBUTION_PRIORITY",
        "Revise origem, prioridade, SLA e motivo auditável.",
        identity.meta,
        { status: 400 },
      );
    }
    const priorityResult = await admin.rpc("configure_distribution_priority", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_development_id: developmentId,
      p_source_key: sourceKey,
      p_priority: priority,
      p_sla_minutes: slaMinutes,
      p_enabled: body.enabled !== false,
      p_reason: reason,
    });
    if (priorityResult.error) {
      structuredApiLog(
        "warn",
        "crm.distribution.priority_rejected",
        request,
        identity.meta,
        {
          actorId,
          developmentId,
          sourceKey,
          error: priorityResult.error.message,
        },
      );
      return apiError(
        "PRIORITY_UPDATE_REJECTED",
        "Não foi possível salvar a prioridade desta origem.",
        identity.meta,
        { status: 409 },
      );
    }
    structuredApiLog(
      "info",
      "crm.distribution.priority_configured",
      request,
      identity.meta,
      {
        actorId,
        developmentId,
        sourceKey,
        priority,
        slaMinutes,
      },
    );
    return apiSuccess(priorityResult.data, identity.meta, {
      headers: limited.headers,
    });
  }

  return apiError(
    "INVALID_DISTRIBUTION_ACTION",
    "Ação de distribuição não reconhecida.",
    identity.meta,
    { status: 400 },
  );
}
