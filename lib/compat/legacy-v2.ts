export type CompatRow = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value : "";
const first = (row: CompatRow, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  return null;
};

export const LIVE_LEAD_SELECT = [
  "id",
  "name",
  "phone",
  "email",
  "project",
  "source",
  "campaign",
  "status",
  "score_ia",
  "classificacao_ia",
  "temperature",
  "assigned_user_id",
  "created_at",
  "organization_id",
  "notes",
  "next_action",
  "next_contact",
  "legacy_broker",
  "import_batch_id",
  "source_row",
  "project_id",
  "campaign_id",
  "budget_min",
  "budget_max",
  "preferred_bedrooms",
  "preferred_min_area",
  "preferred_neighborhoods",
  "payment_method",
  "purchase_timeline",
  "monthly_income",
  "available_down_payment",
  "fgts_balance",
  "desired_monthly_payment",
  "financing_required",
  "financing_term_months",
  "financial_restrictions",
  "financial_notes",
].join(",");

export const LIVE_PROFILE_SELECT = "id,name,email,role,active,organization_id,team,max_active_leads,availability_status";

const statusAliases: Record<string, string> = {
  new: "novo",
  novo: "novo",
  novo_lead: "novo",
  contact: "contato",
  contato: "contato",
  contato_realizado: "contato",
  em_atendimento: "contato",
  qualified: "qualificacao",
  qualificado: "qualificacao",
  qualificacao: "qualificacao",
  qualificação: "qualificacao",
  meeting: "visita",
  visita: "visita",
  visita_agendada: "visita",
  negociacao: "proposta",
  negociação: "proposta",
  proposal: "proposta",
  proposta: "proposta",
  proposta_enviada: "proposta",
  contract: "contrato",
  contrato: "contrato",
  contrato_assinado: "contrato",
  won: "ganho",
  ganho: "ganho",
  venda: "ganho",
  vendido: "ganho",
  lost: "perdido",
  perdido: "perdido",
  buyer_elsewhere: "comprou_outro",
  comprou_outro: "comprou_outro",
  archived: "arquivado",
  arquivado: "arquivado",
};

const statusStorageAliases: Record<string, string[]> = {
  novo: ["novo", "NOVO", "novo_lead", "NOVO_LEAD"],
  contato: ["contato", "CONTATO", "contato_realizado", "CONTATO_REALIZADO", "em_atendimento", "EM_ATENDIMENTO"],
  qualificacao: ["qualificacao", "QUALIFICACAO", "qualificação", "QUALIFICAÇÃO", "qualificado", "QUALIFICADO"],
  visita: ["visita", "VISITA", "visita_agendada", "VISITA_AGENDADA"],
  proposta: ["proposta", "PROPOSTA", "proposta_enviada", "PROPOSTA_ENVIADA", "negociacao", "NEGOCIACAO"],
  contrato: ["contrato", "CONTRATO", "contrato_assinado", "CONTRATO_ASSINADO"],
  ganho: ["ganho", "GANHO", "venda", "VENDA", "vendido", "VENDIDO"],
  perdido: ["perdido", "PERDIDO"],
  comprou_outro: ["comprou_outro", "COMPROU_OUTRO"],
  arquivado: ["arquivado", "ARQUIVADO", "archived", "ARCHIVED"],
};

export function canonicalLeadStatus(value: unknown) {
  const normalized = text(value).trim().toLocaleLowerCase("pt-BR");
  return statusAliases[normalized] || normalized || "novo";
}

export function compatibleLeadStatuses(value: unknown) {
  const canonical = canonicalLeadStatus(value);
  return statusStorageAliases[canonical] || [text(value).trim()].filter(Boolean);
}

export function liveLeadSortColumn(value: unknown) {
  if (value === "score") return "score_ia";
  if (value === "updated_at") return "created_at";
  return value === "name" ? "name" : "created_at";
}

export function canonicalCommercialRole(value: unknown) {
  const normalized = text(value).trim().toLocaleLowerCase("pt-BR");
  const aliases: Record<string, string> = {
    administrador: "admin",
    admin: "admin",
    owner: "admin",
    diretor: "director",
    diretor_decisor: "director",
    diretor_comercial: "director",
    superintendent: "superintendent",
    superintendente: "superintendent",
    gerente: "manager",
    manager: "manager",
    corretor: "broker",
    broker: "broker",
    viewer: "viewer",
  };
  return aliases[normalized] || normalized || "broker";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function purposeFromNotes(value: unknown) {
  const match = text(value).match(/Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?/i);
  if (!match) return null;
  const normalized = match[1].toLocaleLowerCase("pt-BR");
  return normalized.startsWith("loca") ? "locacao" : normalized;
}

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|relation .* does not exist/i.test(error.message || "")));
}

export function isMissingColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "42703" || /column .* does not exist|could not find.*column/i.test(error.message || "")));
}

export function mapLegacyLead(row: CompatRow): CompatRow {
  const rawTemperature = first(row, "temperature", "classificacao_ia");
  return {
    ...row,
    status: canonicalLeadStatus(first(row, "status")),
    score: Number(first(row, "score", "score_ia") ?? 0),
    temperature: text(rawTemperature).trim().toLocaleLowerCase("pt-BR") || null,
    assigned_to: first(row, "assigned_to", "assigned_user_id"),
    development_id: first(row, "development_id", "project_id"),
    // V2 uses `next_action` as free text. Only date-shaped fields may feed
    // calendars and SLA calculations.
    next_action_at: first(row, "next_action_at", "next_contact"),
    next_action_label: first(row, "next_action_label", "next_action"),
    last_interaction_at: first(row, "last_interaction_at", "updated_at", "created_at"),
    updated_at: first(row, "updated_at", "created_at"),
    preferred_regions: stringList(first(row, "preferred_regions", "preferred_neighborhoods", "region", "neighborhood")),
    bedrooms: first(row, "bedrooms", "preferred_bedrooms"),
    purpose: first(row, "purpose") || purposeFromNotes(row.notes),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    first_contact_due_at: first(row, "first_contact_due_at"),
    first_contacted_at: first(row, "first_contacted_at"),
    first_contact_sla_minutes: first(row, "first_contact_sla_minutes"),
    first_response_minutes: first(row, "first_response_minutes"),
    first_contact_sla_met: first(row, "first_contact_sla_met"),
  };
}

export function leadAsOpportunity(row: CompatRow): CompatRow {
  const lead = mapLegacyLead(row);
  return {
    id: lead.id,
    lead_id: lead.id,
    name: first(lead, "name") || "Lead sem nome",
    stage: first(lead, "status") || "novo",
    value: first(lead, "value", "budget_max", "budget_min") ?? 0,
    probability: 0,
    assigned_to: lead.assigned_to,
    development_id: lead.development_id,
    created_at: lead.created_at,
    updated_at: first(lead, "updated_at", "created_at"),
    compatibility_source: "legacy_lead",
  };
}

export function mapLegacyTask(row: CompatRow): CompatRow {
  return {
    ...row,
    due_at: first(row, "due_at", "due_date", "created_at"),
    assigned_to: first(row, "assigned_to", "user_id"),
    recurrence_id: first(row, "recurrence_id"),
  };
}

export function mapLegacyProject(row: CompatRow): CompatRow {
  return {
    ...row,
    developer_name: first(row, "developer_name", "developer", "company"),
    development_name: first(row, "development_name", "name"),
    status: text(first(row, "status") || "ativo"),
    neighborhood: first(row, "neighborhood", "bairro"),
    city: first(row, "city", "cidade"),
    state: first(row, "state", "uf"),
    delivery_date: first(row, "delivery_date", "previsao_entrega"),
  };
}

export function mapLegacyProfile(row: CompatRow): CompatRow {
  const resolvedRole = canonicalCommercialRole(first(row, "commercial_role", "role"));
  return {
    ...row,
    full_name: first(row, "full_name", "name"),
    access_role: first(row, "access_role") || (resolvedRole === "admin" ? "admin" : resolvedRole === "broker" ? "broker" : "director"),
    commercial_role: resolvedRole === "admin" ? "director" : resolvedRole,
    reports_to: first(row, "reports_to"),
  };
}
