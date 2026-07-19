import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const ATLAS_LIVE_DEVELOPMENT_WRITE_ADAPTER_VERSION = "live-development-write-adapter-v1" as const;

export const LIVE_DEVELOPMENT_STATUSES = ["ACTIVE", "PAUSED", "SOLD_OUT", "ARCHIVED"] as const;
export const LIVE_DEVELOPMENT_WRITABLE_FIELDS = [
  "name",
  "developer_name",
  "code",
  "status",
  "city",
  "neighborhood",
  "address",
  "launch_date",
  "delivery_date",
] as const;

export const LIVE_DEVELOPMENT_DATABASE_MANAGER_ROLES = ["ADMIN", "GESTOR", "INCORPORADORA"] as const;
export const LIVE_DEVELOPMENT_REVIEW_ROLES = [
  "ADMIN",
  "DIRECTOR",
  "DIRETOR",
  "DIRECTOR_DECISOR",
  "DIRETOR_DECISOR",
] as const;

type LiveDevelopmentStatus = (typeof LIVE_DEVELOPMENT_STATUSES)[number];
type LiveDevelopmentWritableField = (typeof LIVE_DEVELOPMENT_WRITABLE_FIELDS)[number];
type LiveDevelopmentWriteOperation = "create" | "update";

type LiveDevelopmentPatch = {
  name?: string;
  developer_name?: string | null;
  code?: string | null;
  status?: LiveDevelopmentStatus;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  launch_date?: string | null;
  delivery_date?: string | null;
};

export type LiveDevelopmentWriteIssue = {
  code: string;
  field: string | null;
  message: string;
};

export type LiveDevelopmentWritePlan = {
  contract: typeof ATLAS_LIVE_DEVELOPMENT_WRITE_ADAPTER_VERSION;
  operation: LiveDevelopmentWriteOperation | null;
  projectId: string | null;
  organizationId: string;
  patch: LiveDevelopmentPatch;
  changedFields: LiveDevelopmentWritableField[];
  issues: LiveDevelopmentWriteIssue[];
  reviewRoleAllowed: boolean;
  databasePolicyRoleCompatible: boolean;
  activationBlockers: string[];
  writeEnabled: false;
  mutationExecuted: false;
};

export type LiveDevelopmentWritePreflight = LiveDevelopmentWritePlan & {
  databaseAvailable: boolean;
  tenantTargetReady: boolean;
  duplicateFree: boolean;
  duplicateFields: Array<"name" | "code">;
  readyForHomologation: boolean;
  readyForWriteActivation: false;
  audit: {
    boundary: "authenticated-rls-client";
    persistentProjectEventTableLive: false;
    preflightLogged: true;
    approvalGate: "phase-99-controlled-homologation";
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const fieldLimits: Record<Exclude<LiveDevelopmentWritableField, "status" | "launch_date" | "delivery_date">, number> = {
  name: 180,
  developer_name: 180,
  code: 64,
  city: 120,
  neighborhood: 120,
  address: 280,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function roleKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function canReviewLiveDevelopmentWrite(role: unknown) {
  return (LIVE_DEVELOPMENT_REVIEW_ROLES as readonly string[]).includes(roleKey(role));
}

export function isLiveDevelopmentDatabaseManagerRole(role: unknown) {
  return (LIVE_DEVELOPMENT_DATABASE_MANAGER_ROLES as readonly string[]).includes(roleKey(role));
}

function issue(code: string, field: string | null, message: string): LiveDevelopmentWriteIssue {
  return { code, field, message };
}

function dateField(value: unknown, field: "launch_date" | "delivery_date", issues: LiveDevelopmentWriteIssue[]) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    issues.push(issue("invalid-date", field, "Use uma data válida no formato AAAA-MM-DD."));
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    issues.push(issue("invalid-date", field, "Use uma data existente no calendário."));
    return undefined;
  }
  return value;
}

function textField(
  project: Record<string, unknown>,
  field: Exclude<LiveDevelopmentWritableField, "status" | "launch_date" | "delivery_date">,
  issues: LiveDevelopmentWriteIssue[],
  options: { nullable?: boolean; uppercase?: boolean } = {},
) {
  if (!(field in project)) return undefined;
  const value = project[field];
  if ((value === null || value === "") && options.nullable) return null;
  if (typeof value !== "string") {
    issues.push(issue("invalid-text", field, "Informe um texto válido."));
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized && options.nullable) return null;
  if (!normalized) {
    issues.push(issue("required-field", field, "Este campo é obrigatório."));
    return undefined;
  }
  if (normalized.length > fieldLimits[field]) {
    issues.push(issue("field-too-long", field, `Use no máximo ${fieldLimits[field]} caracteres.`));
    return undefined;
  }
  return options.uppercase ? normalized.toUpperCase() : normalized;
}

export function buildLiveDevelopmentWritePlan(input: {
  body: unknown;
  organizationId: string;
  actorRole: unknown;
}): LiveDevelopmentWritePlan {
  const body = record(input.body);
  const project = record(body.project);
  const issues: LiveDevelopmentWriteIssue[] = [];
  const rawOperation = String(body.operation ?? "").trim().toLowerCase();
  const operation = rawOperation === "create" || rawOperation === "update"
    ? rawOperation as LiveDevelopmentWriteOperation
    : null;

  if (!operation) issues.push(issue("invalid-operation", "operation", "Use create ou update."));

  const projectId = typeof body.projectId === "string" && UUID_PATTERN.test(body.projectId.trim())
    ? body.projectId.trim()
    : null;
  if (operation === "update" && !projectId) {
    issues.push(issue("project-id-required", "projectId", "Selecione um projeto válido para atualizar."));
  }
  if (operation === "create" && body.projectId !== undefined) {
    issues.push(issue("project-id-not-allowed", "projectId", "O identificador é criado pelo banco."));
  }

  const unsupportedFields = Object.keys(project).filter(
    (field) => !(LIVE_DEVELOPMENT_WRITABLE_FIELDS as readonly string[]).includes(field),
  );
  for (const field of unsupportedFields) {
    issues.push(issue("unsupported-field", field, "Campo não aceito pelo contrato vivo de Projetos."));
  }

  const patch: LiveDevelopmentPatch = {};
  const name = textField(project, "name", issues);
  if (typeof name === "string") patch.name = name;
  if (operation === "create" && typeof name !== "string") {
    issues.push(issue("project-name-required", "name", "Informe o nome do projeto."));
  }

  const developerName = textField(project, "developer_name", issues, { nullable: true });
  if (developerName !== undefined) patch.developer_name = developerName;
  const code = textField(project, "code", issues, { nullable: true, uppercase: true });
  if (code !== undefined) patch.code = code;
  const city = textField(project, "city", issues, { nullable: true });
  if (city !== undefined) patch.city = city;
  const neighborhood = textField(project, "neighborhood", issues, { nullable: true });
  if (neighborhood !== undefined) patch.neighborhood = neighborhood;
  const address = textField(project, "address", issues, { nullable: true });
  if (address !== undefined) patch.address = address;

  if ("status" in project) {
    const status = String(project.status ?? "").trim().toUpperCase();
    if ((LIVE_DEVELOPMENT_STATUSES as readonly string[]).includes(status)) {
      patch.status = status as LiveDevelopmentStatus;
    } else {
      issues.push(issue("invalid-status", "status", "Status fora do contrato vivo aprovado."));
    }
  } else if (operation === "create") patch.status = "ACTIVE";

  if ("launch_date" in project) {
    const launchDate = dateField(project.launch_date, "launch_date", issues);
    if (launchDate !== undefined) patch.launch_date = launchDate;
  }
  if ("delivery_date" in project) {
    const deliveryDate = dateField(project.delivery_date, "delivery_date", issues);
    if (deliveryDate !== undefined) patch.delivery_date = deliveryDate;
  }
  if (patch.launch_date && patch.delivery_date && patch.launch_date > patch.delivery_date) {
    issues.push(issue("invalid-date-order", "delivery_date", "A entrega não pode ser anterior ao lançamento."));
  }

  const changedFields = Object.keys(patch) as LiveDevelopmentWritableField[];
  if (operation === "update" && changedFields.length === 0) {
    issues.push(issue("empty-update", "project", "Informe ao menos um campo para revisar."));
  }

  const reviewRoleAllowed = canReviewLiveDevelopmentWrite(input.actorRole);
  const databasePolicyRoleCompatible = isLiveDevelopmentDatabaseManagerRole(input.actorRole);
  const activationBlockers = [
    "persistent-project-audit-not-live",
    "phase-99-controlled-homologation-pending",
    ...(!databasePolicyRoleCompatible ? ["live-rls-role-contract-mismatch"] : []),
  ];

  return {
    contract: ATLAS_LIVE_DEVELOPMENT_WRITE_ADAPTER_VERSION,
    operation,
    projectId,
    organizationId: input.organizationId.trim(),
    patch,
    changedFields,
    issues,
    reviewRoleAllowed,
    databasePolicyRoleCompatible,
    activationBlockers,
    writeEnabled: false,
    mutationExecuted: false,
  };
}

async function findDuplicate(
  client: SupabaseClient,
  organizationId: string,
  field: "name" | "code",
  value: string,
  projectId: string | null,
) {
  let query = client
    .from("crm_projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq(field, value)
    .limit(1);
  if (projectId) query = query.neq("id", projectId);
  return query.maybeSingle();
}

export async function preflightLiveDevelopmentWrite(
  client: SupabaseClient,
  input: {
    body: unknown;
    organizationId: string;
    actorRole: unknown;
  },
): Promise<LiveDevelopmentWritePreflight> {
  const plan = buildLiveDevelopmentWritePlan(input);
  let databaseAvailable = true;
  let tenantTargetReady = plan.operation === "create";
  let duplicateFree = true;
  const duplicateFields: Array<"name" | "code"> = [];

  if (plan.issues.length === 0 && plan.operation === "update" && plan.projectId) {
    const target = await client
      .from("crm_projects")
      .select("id")
      .eq("organization_id", plan.organizationId)
      .eq("id", plan.projectId)
      .maybeSingle();
    if (target.error) databaseAvailable = false;
    else tenantTargetReady = Boolean(target.data);
  }

  if (plan.issues.length === 0 && databaseAvailable && typeof plan.patch.name === "string") {
    const duplicate = await findDuplicate(client, plan.organizationId, "name", plan.patch.name, plan.projectId);
    if (duplicate.error) databaseAvailable = false;
    else if (duplicate.data) duplicateFields.push("name");
  }
  if (plan.issues.length === 0 && databaseAvailable && typeof plan.patch.code === "string") {
    const duplicate = await findDuplicate(client, plan.organizationId, "code", plan.patch.code, plan.projectId);
    if (duplicate.error) databaseAvailable = false;
    else if (duplicate.data) duplicateFields.push("code");
  }

  duplicateFree = duplicateFields.length === 0;
  const readyForHomologation = plan.issues.length === 0
    && databaseAvailable
    && tenantTargetReady
    && duplicateFree
    && plan.reviewRoleAllowed;

  return {
    ...plan,
    databaseAvailable,
    tenantTargetReady,
    duplicateFree,
    duplicateFields,
    readyForHomologation,
    readyForWriteActivation: false,
    audit: {
      boundary: "authenticated-rls-client",
      persistentProjectEventTableLive: false,
      preflightLogged: true,
      approvalGate: "phase-99-controlled-homologation",
    },
  };
}
