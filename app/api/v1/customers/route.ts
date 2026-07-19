import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_PROFILE_SELECT,
  mapLegacyProfile,
  mapLegacyProject,
} from "@/lib/compat/legacy-v2";
import { readCompatibleCustomers } from "@/lib/atlas/core-v2/live-repositories";

export const dynamic = "force-dynamic";

const MAX_ANALYSIS_ROWS = 5_000;
const allowedSegments = new Set(["all", "active", "won", "external", "closed"]);

type Relationship = "active" | "won" | "external" | "closed";
type LeadRecord = Record<string, unknown>;

function text(row: LeadRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function amount(row: LeadRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function relationshipFor(status: unknown): Relationship {
  const value = normalized(status);
  if (["ganho", "venda", "vendido"].includes(value)) return "won";
  if (value === "comprou_outro") return "external";
  if (value === "perdido") return "closed";
  return "active";
}

function validDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? value : null;
}

function contextGaps(lead: LeadRecord, relationship: Relationship) {
  const gaps: string[] = [];
  if (!text(lead, "email", "phone")) gaps.push("contact");
  if (!text(lead, "development_id", "project_id")) gaps.push("project");
  if (!text(lead, "purpose", "profile_type", "interest_type")) gaps.push("purpose");
  if (!amount(lead, "budget_max", "budget_min", "monthly_income")) gaps.push("budget");
  if (relationship === "active" && !validDate(lead.next_action_at)) gaps.push("next_action");
  return gaps;
}

function priorityFor(lead: LeadRecord, referenceTime: number) {
  const relationship = relationshipFor(lead.status);
  if (relationship !== "active") return null;
  const nextActionAt = validDate(lead.next_action_at);
  const nextActionTime = nextActionAt ? new Date(nextActionAt).getTime() : Number.NaN;
  if (Number.isFinite(nextActionTime) && nextActionTime < referenceTime) {
    return {
      rank: 0,
      label: "Próxima ação vencida",
      detail: "Retome o atendimento e registre o resultado no histórico.",
      tone: "danger" as const,
    };
  }
  if (!nextActionAt) {
    return {
      rank: 1,
      label: "Relacionamento sem próximo passo",
      detail: "Defina quando e como este cliente deve ser atendido novamente.",
      tone: "warning" as const,
    };
  }
  if (!text(lead, "assigned_to", "assigned_user_id")) {
    return {
      rank: 2,
      label: "Sem responsável visível",
      detail: "A liderança deve revisar a distribuição antes do próximo contato.",
      tone: "warning" as const,
    };
  }
  const gaps = contextGaps(lead, relationship).filter((gap) => gap !== "next_action");
  if (gaps.length >= 2) {
    return {
      rank: 3,
      label: "Contexto essencial incompleto",
      detail: "Complete projeto, objetivo ou faixa de investimento antes da abordagem.",
      tone: "info" as const,
    };
  }
  return null;
}

function clampPage(value: string | null) {
  const parsed = Number(value || "1");
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

function clampLimit(value: string | null) {
  const parsed = Number(value || "25");
  return Number.isFinite(parsed) ? Math.min(50, Math.max(10, Math.trunc(parsed))) : 25;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, scope: "customer-relationship-read" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const page = clampPage(request.nextUrl.searchParams.get("page"));
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) || "";
  const requestedSegment = request.nextUrl.searchParams.get("segment") || "all";
  const segment = allowedSegments.has(requestedSegment) ? requestedSegment : "all";

  const result = await readCompatibleCustomers(identity.supabase, {
    organizationId,
    limit: MAX_ANALYSIS_ROWS,
  });

  if (!result.ok) {
    structuredApiLog("warn", "customers.relationship_read_failed", request, identity.meta, {
      organizationId,
      code: result.error.code,
    });
    return apiError(
      "CUSTOMER_RELATIONSHIP_LOAD_FAILED",
      "A visão de relacionamentos está temporariamente indisponível.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const referenceTime = Date.now();
  const rows = (result.rows as LeadRecord[])
    .filter((lead) => !["arquivado", "archived"].includes(normalized(lead.status)));
  const normalizedQuery = normalized(query);
  const filtered = rows.filter((lead) => {
    const relationship = relationshipFor(lead.status);
    if (segment !== "all" && relationship !== segment) return false;
    if (!normalizedQuery) return true;
    return normalized([lead.name, lead.email, lead.phone, lead.source, lead.status].join(" ")).includes(normalizedQuery);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);
  const priorities = rows
    .map((lead) => ({ lead, priority: priorityFor(lead, referenceTime) }))
    .filter((item): item is { lead: LeadRecord; priority: NonNullable<ReturnType<typeof priorityFor>> } => Boolean(item.priority))
    .sort((left, right) => {
      if (left.priority.rank !== right.priority.rank) return left.priority.rank - right.priority.rank;
      const leftAt = validDate(left.lead.next_action_at) || validDate(left.lead.updated_at) || "";
      const rightAt = validDate(right.lead.next_action_at) || validDate(right.lead.updated_at) || "";
      return leftAt.localeCompare(rightAt);
    })
    .slice(0, 3);
  const enrichedRows = [...pageRows, ...priorities.map((item) => item.lead)];
  const ownerIds = [...new Set(enrichedRows.map((lead) => text(lead, "assigned_to", "assigned_user_id")).filter((value): value is string => Boolean(value)))];
  const developmentIds = [...new Set(enrichedRows.map((lead) => text(lead, "development_id", "project_id")).filter((value): value is string => Boolean(value)))];

  const profileResult = ownerIds.length
    ? await identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).in("id", ownerIds)
    : { data: [] as LeadRecord[], error: null };
  const developmentResult = developmentIds.length
    ? await identity.supabase.from("crm_projects").select("id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at").eq("organization_id", organizationId).in("id", developmentIds)
    : { data: [] as LeadRecord[], error: null };

  const owners = new Map(
    ((profileResult.data ?? []) as LeadRecord[])
      .map(mapLegacyProfile)
      .map((profile) => [String(profile.id), String(profile.full_name || "Equipe Atlas")]),
  );
  const developments = new Map(
    ((developmentResult.data ?? []) as LeadRecord[])
      .map(mapLegacyProject)
      .map((development) => [String(development.id), String(development.development_name || "Projeto não identificado")]),
  );

  const present = (lead: LeadRecord) => {
    const relationship = relationshipFor(lead.status);
    const ownerId = text(lead, "assigned_to", "assigned_user_id");
    const developmentId = text(lead, "development_id", "project_id");
    return {
      id: String(lead.id),
      name: text(lead, "name") || "Cliente sem nome",
      email: text(lead, "email"),
      phone: text(lead, "phone"),
      status: text(lead, "status") || "novo",
      source: text(lead, "source"),
      relationship,
      purpose: text(lead, "purpose", "profile_type", "interest_type"),
      temperature: text(lead, "temperature", "classificacao_ia"),
      score: amount(lead, "score", "score_ia") || 0,
      budgetMin: amount(lead, "budget_min"),
      budgetMax: amount(lead, "budget_max"),
      ownerId,
      ownerName: ownerId ? owners.get(ownerId) || "Responsável cadastrado" : null,
      developmentId,
      developmentName: developmentId ? developments.get(developmentId) || "Projeto cadastrado" : null,
      lastInteractionAt: validDate(lead.last_interaction_at),
      nextActionAt: validDate(lead.next_action_at),
      createdAt: validDate(lead.created_at),
      updatedAt: validDate(lead.updated_at) || validDate(lead.created_at),
      contextGaps: contextGaps(lead, relationship),
    };
  };

  const activeRows = rows.filter((lead) => relationshipFor(lead.status) === "active");
  const summary = {
    total: result.count ?? rows.length,
    analyzed: rows.length,
    active: activeRows.length,
    won: rows.filter((lead) => relationshipFor(lead.status) === "won").length,
    external: rows.filter((lead) => relationshipFor(lead.status) === "external").length,
    closed: rows.filter((lead) => relationshipFor(lead.status) === "closed").length,
    contactable: rows.filter((lead) => Boolean(text(lead, "email", "phone"))).length,
    needsAction: activeRows.filter((lead) => {
      const nextAction = validDate(lead.next_action_at);
      return !nextAction || new Date(nextAction).getTime() < referenceTime;
    }).length,
    coverageComplete: (result.count ?? rows.length) <= MAX_ANALYSIS_ROWS,
  };

  return apiSuccess(
    {
      scope: {
        organizationId,
        hierarchicalRls: true,
        coldReactivationBaseExcluded: true,
        source: "public.leads",
      },
      summary,
      priorities: priorities.map((item) => ({ ...item.priority, customer: present(item.lead) })),
      items: pageRows.map(present),
      page: { number: currentPage, limit, total: filtered.length, pages: pageCount },
      filters: { query, segment },
      generatedAt: new Date(referenceTime).toISOString(),
      compatibility: result.compatibility,
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
