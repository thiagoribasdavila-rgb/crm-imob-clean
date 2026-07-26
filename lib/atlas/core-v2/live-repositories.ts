import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_LEAD_SELECT,
  LIVE_LEAD_SELECT_WITH_SLA,
  isMissingColumn,
  leadAsOpportunity,
  mapLegacyLead,
  mapLegacyProject,
  mapLegacyTask,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import { ATLAS_LIVE_READ_COMPATIBILITY_VERSION } from "./live-capability-resolver";

export const LIVE_TASK_SELECT = "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date";
/**
 * Colunas do empreendimento, lidas de `developments`.
 *
 * `code` e `address` mudaram de nome na migração V3 (`project_code`,
 * `address_line`). Os aliases mantêm a forma que `mapLegacyProject` e as telas
 * já esperam, sem obrigar ninguém a renomear campo em cascata.
 */
export const LIVE_DEVELOPMENT_SELECT = "id,organization_id,name,developer_name,code:project_code,status,city,neighborhood,address:address_line,launch_date,delivery_date,created_at,updated_at";

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
  /** false quando o banco não tem as colunas de SLA da fase 34. */
  slaDisponivel?: boolean;
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

  // Tenta com as colunas de SLA; se o banco não as tiver (42703), repete sem
  // elas. É o que permite o mesmo código servir o schema da fase 34 e o legado,
  // sem que a ausência do SLA derrube a leitura inteira do pipeline.
  const executar = async (colunas: string) => {
    let query = client
      .from("leads")
      .select(colunas, { count: "exact" })
      .eq("organization_id", organizationId);
    if (!input.includeArchived) query = query.not("status", "in", archivedLeadStatuses);
    return query.order("created_at", { ascending: false, nullsFirst: false }).limit(limit);
  };

  let comSla = true;
  let result = await executar(LIVE_LEAD_SELECT_WITH_SLA);
  if (result.error && isMissingColumn(result.error)) {
    comSla = false;
    result = await executar(LIVE_LEAD_SELECT);
  }
  if (result.error) return unavailable(result.error.code);

  return {
    ...success(
      ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyLead),
      result.count,
      "public.leads",
    ),
    // Quem consome precisa saber se o SLA veio nulo por não ter sido medido ou
    // por o banco não suportar a medição. São coisas diferentes.
    slaDisponivel: comSla,
  };
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

  // Lê `developments`, e não `crm_projects`.
  //
  // As duas guardavam os MESMOS empreendimentos com identificadores
  // DIFERENTES. Esta função lia a segunda; as 174 leads apontam para a
  // primeira. Resultado medido: a tela de Projetos mostrava quatro
  // empreendimentos com ZERO leads, sendo que Inside Perdizes tem 174.
  //
  // `developments` é a canônica sem discussão: 33 tabelas a referenciam,
  // contra 6 de `crm_projects` — e nenhuma dessas 6 tem uma única linha
  // apontando para lá. A tabela antiga tinha 4 linhas para as quais nada
  // aponta.
  //
  // A migration 20260727010000 garantiu que todo projeto do cadastro antigo
  // exista no novo (na prática, uma linha: o Spin Mood). `crm_projects` NÃO foi
  // apagada — nada aponta para ela, então não há o que repontar, e derrubá-la
  // seria destruição sem ganho.
  const result = await client
    .from("developments")
    .select(LIVE_DEVELOPMENT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (result.error) return unavailable(result.error.code);

  return success(
    ((result.data ?? []) as unknown as CompatRow[]).map(mapLegacyProject),
    result.count,
    "public.developments",
  );
}
