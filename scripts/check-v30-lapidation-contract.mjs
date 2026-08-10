import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
let checks = 0;

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function expect(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function includesAll(path, values) {
  const content = source(path);
  for (const value of values) {
    expect(content.includes(value), `${path} precisa conter: ${value}`);
  }
  return content;
}

const transferPage = includesAll("app/(crm)/leads/actions/page.tsx", [
  "/api/v1/crm/leads/bulk-transfer",
  "reason.trim()",
  "humanConfirmed: true",
  "transferReviewOpen",
  'aria-labelledby="bulk-transfer-review-title"',
  "Confirmar transferência",
]);
const transferApi = includesAll("app/api/v1/crm/leads/bulk-transfer/route.ts", [
  "roles: [\"admin\", \"director\", \"superintendent\", \"manager\"]",
  "managerRestrictedToDirectBrokers: true",
  "humanConfirmationRequired: true",
  "body.humanConfirmed !== true",
  "transfer_leads_to_team",
  "bulk_transfer_leads",
]);
expect(
  !transferApi.includes("managers[0]") && !transferApi.includes("superintendents[0]"),
  "a transferência não pode escolher uma liderança arbitrária como fallback",
);
expect(
  !transferPage.includes("window.confirm"),
  "a transferência em massa não pode depender de confirmação nativa",
);

const profilePage = includesAll("app/(crm)/settings/profile/page.tsx", [
  "/api/v1/settings/profile",
  "availabilityStatus",
]);
expect(
  !/\.from\(\s*["']profiles["']\s*\)[\s\S]{0,300}\.update\(/.test(profilePage),
  "a página de perfil não pode atualizar profiles diretamente no navegador",
);
includesAll("app/api/v1/settings/profile/route.ts", [
  "enforceRateLimit",
  "requireAccessContext",
  "profile.settings_updated",
  "rollbackSucceeded",
  "apiError",
]);

const pipelinePage = includesAll("app/(crm)/pipeline/page.tsx", [
  "PendingPipelineMove",
  "DECISÃO COMERCIAL",
  'role="dialog"',
  "Confirmar decisão",
  "Mínimo de 10 caracteres",
]);
expect(
  !pipelinePage.includes("window.prompt") && !pipelinePage.includes("window.confirm"),
  "o Kanban oficial não pode depender de prompt/confirm nativos para decisões comerciais",
);
includesAll("app/api/v1/pipeline/stages/route.ts", [
  "enforceRateLimit",
  "requireAccessContext",
  "pipeline_stage_settings",
  "atlas_events",
  "rollback",
]);

const commissionPage = includesAll("app/(crm)/sales/page.tsx", [
  "FinancialEditor",
  'role="dialog"',
  "updateCommission",
]);
expect(
  !commissionPage.includes("window.prompt"),
  "a comissão não pode ser configurada por prompt nativo",
);
includesAll("app/api/v1/sales/[id]/commission/route.ts", [
  "commission_events",
  "rollbackSucceeded",
  "COMMISSION_AUDIT_FAILED",
  "audited: true",
]);

includesAll("app/(crm)/leads/[id]/page.tsx", [
  "activitySaving",
  "setActivitySaving(true)",
  "setActivitySaving(false)",
]);

const distributionPage = includesAll("app/(crm)/distribution/page.tsx", [
  "absenceReviewOpen",
  'aria-labelledby="absence-review-title"',
  "Confirmar e proteger carteira",
]);
expect(
  !distributionPage.includes("window.confirm"),
  "a cobertura de ausência não pode depender de confirmação nativa",
);

const deduplicationPage = includesAll("app/(crm)/leads/deduplication/page.tsx", [
  "MergeReview",
  'aria-labelledby="merge-review-title"',
  "humanConfirmed: true",
  "Confirmar consolidação",
]);
expect(
  !deduplicationPage.includes("window.prompt"),
  "a consolidação de duplicidades não pode depender de prompt nativo",
);
includesAll("app/api/v1/leads/deduplication/route.ts", [
  "HUMAN_CONFIRMATION_REQUIRED",
  "body.humanConfirmed!==true",
  "humanConfirmed:true",
]);

const contactPreferencesPage = includesAll("app/(crm)/leads/[id]/contact-preferences/page.tsx", [
  "PreferenceReview",
  'aria-labelledby="contact-review-title"',
  "humanConfirmed: true",
  "Confirmar preferência",
]);
expect(
  !contactPreferencesPage.includes("window.prompt"),
  "consentimento e opt-out não podem depender de prompt nativo",
);
includesAll("app/api/v1/leads/[id]/contact-preferences/route.ts", [
  "HUMAN_CONFIRMATION_REQUIRED",
  "CONTACT_EVIDENCE_REQUIRED",
  "LAWFUL_BASIS_REQUIRED",
  "humanConfirmed: true",
]);

for (const file of [
  "app/(crm)/developments/[id]/dossier/page.tsx",
  "app/(crm)/developments/[id]/region-study/page.tsx",
  "app/(crm)/developments/homologation/page.tsx",
  "app/(crm)/developments/registry/page.tsx",
  "app/(crm)/leads/[id]/attribution/page.tsx",
  "app/(crm)/leads/[id]/behavior/page.tsx",
  "app/(crm)/leads/[id]/contact-preferences/page.tsx",
  "app/(crm)/leads/deduplication/page.tsx",
]) {
  includesAll(file, [
    "setData(payload.data)",
    "payload.error?.message",
  ]);
}

includesAll("app/(crm)/marketing/campaigns/page.tsx", [
  "return payload?.data as T",
  "setData(campaignPayload)",
  "/api/v1/marketing/campaigns",
  "/api/v1/developments",
]);

const security = includesAll("lib/api/security.ts", [
  "supabase.auth.getUser",
  "PROFILE_ORGANIZATION_REQUIRED",
  "ORGANIZATION_INACTIVE",
  "ATLAS_DEFAULT_ORGANIZATION_ID",
]);
expect(
  !security.includes("user_metadata"),
  "autorização não pode confiar em user_metadata",
);

const abuseMigration = includesAll("supabase/migrations/20260717075224_phase_19_abuse_protection.sql", [
  "api_rate_limit_buckets",
  "enable row level security",
  "consume_api_rate_limit",
  "revoke all",
  "grant execute",
]);
expect(
  abuseMigration.includes("to service_role"),
  "o limitador distribuído deve ficar restrito ao service_role",
);

if (failures.length) {
  console.error(`ATLAS V30 lapidação: ${failures.length} falha(s) em ${checks} verificações.`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `ATLAS V30 lapidação: ${checks}/${checks} verificações aprovadas. ` +
  "Transferência, perfil, Kanban, comissões, atividades, autenticação e proteção distribuída preservados.",
);
