import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_LEAD_SELECT,
  leadAsOpportunity,
  mapLegacyLead,
  mapLegacyProject,
  mapLegacyTask,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import { ATLAS_LIVE_READ_COMPATIBILITY_VERSION } from "./live-capability-resolver";

export const LIVE_TASK_SELECT = "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date";
export const LIVE_DEVELOPMENT_SELECT = "id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at";

const MAX_READ_LIMIT = 5_000;
const archivedLeadStatuses = "(arquivado,ARQUIVADO,archived,ARCHIVED)";

type CompatibleReadInput = {
  organizationId: string;
  limit?: number;
};

type CompatibleLeadReadInput = CompatibleReadInput & {
  includeArchived?: boolean;
};

type CompatibleReadFailure = {
  ok: false;
  error: {
    kind: "invalid-tenant" | "database-unavailable";
    code: string;
  };
  compatibility: typeof ATLAS_LIVE_READ_COMPATIBILITY_VERSION;
};

type CompatibleReadSuccess<T> = {
  ok: true;
  rows: T[];
  count: number;
  source: string;
  tenantColumn: "organization_id";
  compatibility: typeof ATLAS_LIVE_READ_COMPATIBILITY_VERSION;
  generatedAt: string;
};

export type CompatibleReadResult<T> = CompatibleReadSuccess<T> | CompatibleReadFailure;

function normalizedInput(input: CompatibleReadInput) {
  const organizationId = input.organizationId.trim();
  const requestedLimit = Number(input.limit ?? 500);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_READ_LIMIT, Math.max(1, Math.trunc(requestedLimit)))
    : 500;
  return { organizationId, limit };
}

function invalidTenant(): CompatibleReadFailure {
  return {
    ok: false,
    error: { kind: "invalid-tenant", code: "ATLAS_TENANT_REQUIRED" },
    compatibility: ATLAS_LIVE_READ_COMPATIBILITY_VERSION,
  };
}

function unavailable(code?: string): CompatibleReadFailure {
  return {
    ok: false,
    error: { kind: "database-unavailable", code: code || "ATLAS_LIVE_READ_FAILED" },
    compatibility: ATLAS_LIVE_READ_COMPATIBILITY_VERSION,
  };
}

function success<T>(rows: T[], count: number | null, source: string): CompatibleReadSuccess<T> {
  return {
    ok: true,
    rows,
    count: count ?? rows.length,
    source,
    tenantColumn: "organization_id",
    compatibility: ATLAS_LIVE_READ_COMPATIBILITY_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

export async function readCompatibleLeads(
  client: SupabaseClient,
  input: CompatibleLeadReadInput,
): Promise<CompatibleReadResult<CompatRow>> {
  const { organizationId, limit } = normalizedInput(input);
  if (!organizationId) return invalidTenant();

  let query = client
    .from("leads")
    .select(LIVE_LEAD_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (!input.includeArchived) query = query.not("status", "in", archivedLeadStatuses);
  const result = await query.order("created_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (result.error) return unavailable(result.error.code);

  return success(
    ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyLead),
    result.count,
    "public.leads",
  );
}

export async function readCompatiblePipeline(
  client: SupabaseClient,
  input: CompatibleLeadReadInput,
): Promise<(CompatibleReadSuccess<CompatRow> & { opportunities: CompatRow[] }) | CompatibleReadFailure> {
  const leads = await readCompatibleLeads(client, input);
  if (!leads.ok) return leads;
  return {
    ...leads,
    source: "public.leads+public.pipeline_history",
    opportunities: leads.rows.map(leadAsOpportunity),
  };
}

export async function readCompatibleTasks(
  client: SupabaseClient,
  input: CompatibleReadInput,
): Promise<CompatibleReadResult<CompatRow>> {
  const { organizationId, limit } = normalizedInput(input);
  if (!organizationId) return invalidTenant();

  const result = await client
    .from("tasks")
    .select(LIVE_TASK_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (result.error) return unavailable(result.error.code);

  return success(
    ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyTask),
    result.count,
    "public.tasks",
  );
}

export async function readCompatibleCustomers(
  client: SupabaseClient,
  input: CompatibleLeadReadInput,
): Promise<CompatibleReadResult<CompatRow>> {
  const leads = await readCompatibleLeads(client, input);
  return leads.ok ? { ...leads, source: "public.leads+public.profiles+public.crm_projects" } : leads;
}

export async function readCompatibleDevelopments(
  client: SupabaseClient,
  input: CompatibleReadInput,
): Promise<CompatibleReadResult<CompatRow>> {
  const { organizationId, limit } = normalizedInput(input);
  if (!organizationId) return invalidTenant();

  const result = await client
    .from("crm_projects")
    .select(LIVE_DEVELOPMENT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (result.error) return unavailable(result.error.code);

  return success(
    ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyProject),
    result.count,
    "public.crm_projects",
  );
}
