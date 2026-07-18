export type CompatRow = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value : "";
const first = (row: CompatRow, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  return null;
};

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|relation .* does not exist/i.test(error.message || "")));
}

export function isMissingColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "42703" || /column .* does not exist|could not find.*column/i.test(error.message || "")));
}

export function mapLegacyLead(row: CompatRow): CompatRow {
  return {
    ...row,
    score: first(row, "score", "score_ia") ?? 0,
    temperature: first(row, "temperature", "classificacao_ia"),
    assigned_to: first(row, "assigned_to", "assigned_user_id"),
    development_id: first(row, "development_id", "project_id"),
    // V2 uses `next_action` as free text. Only date-shaped fields may feed
    // calendars and SLA calculations.
    next_action_at: first(row, "next_action_at", "next_contact"),
    last_interaction_at: first(row, "last_interaction_at", "updated_at", "created_at"),
    preferred_regions: first(row, "preferred_regions", "region", "neighborhood"),
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
  return {
    ...row,
    full_name: first(row, "full_name", "name"),
    commercial_role: first(row, "commercial_role", "role"),
  };
}
