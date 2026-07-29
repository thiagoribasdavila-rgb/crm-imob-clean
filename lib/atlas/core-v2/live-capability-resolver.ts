export const ATLAS_LIVE_READ_COMPATIBILITY_VERSION = "live-read-compat-v1" as const;

export type AtlasLiveModuleId =
  | "leads"
  | "pipeline"
  | "tasks-and-agenda"
  | "customers-360"
  | "developments";

export type AtlasLiveModuleCapability = {
  module: AtlasLiveModuleId;
  canonicalEntity: string;
  physicalSources: readonly string[];
  tenantColumn: "organization_id";
  readState: "adapter-ready";
  mapper: string;
  canonicalAliases: Readonly<Record<string, string>>;
  limitations: readonly string[];
};

const CAPABILITIES: readonly AtlasLiveModuleCapability[] = [
  {
    module: "leads",
    canonicalEntity: "lead",
    // 2026-07-29: a fonte física do empreendimento é `developments`, não
  // `crm_projects`. As duas guardam os mesmos 4 empreendimentos com IDs
  // diferentes, e a FK decide: leads.development_id casa com developments em
  // 192 de 192, e com crm_projects em 0 de 192. A leitura já usava developments
  // e a validação de escrita foi corrigida antes; faltava a DECLARAÇÃO, que é
  // o que este resolvedor publica para o resto do sistema.
  physicalSources: ["public.leads"],
    tenantColumn: "organization_id",
    readState: "adapter-ready",
    mapper: "mapLegacyLead",
    canonicalAliases: {
      score: "score_ia",
      assigned_to: "assigned_user_id",
      development_id: "project_id",
      next_action_at: "next_contact",
      updated_at: "created_at",
    },
    limitations: [
      "score-is-legacy-evidence-not-calibrated-probability",
      "archived-import-memory-is-excluded-by-default",
    ],
  },
  {
    module: "pipeline",
    canonicalEntity: "opportunity",
    physicalSources: ["public.leads", "public.pipeline_history"],
    tenantColumn: "organization_id",
    readState: "adapter-ready",
    mapper: "leadAsOpportunity",
    canonicalAliases: {
      opportunity_id: "leads.id",
      stage: "leads.status",
      value: "leads.budget_max|leads.budget_min",
      history: "pipeline_history",
    },
    limitations: [
      "opportunities-table-does-not-exist",
      "probability-remains-zero-until-governed-stage-settings-are-homologated",
    ],
  },
  {
    module: "tasks-and-agenda",
    canonicalEntity: "commercial-task",
    physicalSources: ["public.tasks", "public.leads"],
    tenantColumn: "organization_id",
    readState: "adapter-ready",
    mapper: "mapLegacyTask",
    canonicalAliases: {
      due_at: "due_date",
      assigned_to: "user_id",
      lead: "lead_id",
    },
    limitations: ["visits-remain-optional-until-a-live-visit-contract-exists"],
  },
  {
    module: "customers-360",
    canonicalEntity: "customer-relationship",
    physicalSources: ["public.leads", "public.profiles", "public.developments"],
    tenantColumn: "organization_id",
    readState: "adapter-ready",
    mapper: "mapLegacyLead",
    canonicalAliases: {
      customer_id: "leads.id",
      owner: "profiles.id",
      development: "developments.id",
    },
    limitations: ["customer-relationship-is-lead-backed-until-a-canonical-customer-table-is-approved"],
  },
  {
    module: "developments",
    canonicalEntity: "development",
    physicalSources: [
      "public.developments",
      "public.inventory_units",
      "public.knowledge_documents",
      "public.marketing_campaigns",
    ],
    tenantColumn: "organization_id",
    readState: "adapter-ready",
    mapper: "mapLegacyProject",
    canonicalAliases: {
      development_id: "developments.id",
      development_name: "developments.name",
      developer_name: "developments.developer_name",
    },
    limitations: ["inventory-is-empty-in-the-current-live-tenant"],
  },
] as const;

export function listAtlasLiveModuleCapabilities() {
  return CAPABILITIES;
}

export function resolveAtlasLiveModuleCapability(module: AtlasLiveModuleId) {
  const capability = CAPABILITIES.find((item) => item.module === module);
  if (!capability) throw new Error(`Atlas live capability not registered: ${module}`);
  return capability;
}
