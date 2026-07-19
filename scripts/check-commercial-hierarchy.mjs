import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/commercial-hierarchy.json"), "utf8"));
const migration = readFileSync(resolve(root, "supabase/migrations/20260717072714_secure_commercial_profile_hierarchy.sql"), "utf8");
const baseHierarchy = readFileSync(resolve(root, "supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql"), "utf8");
const route = readFileSync(resolve(root, "app/api/v1/team/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/(crm)/settings/team/page.tsx"), "utf8");
const errors = [];

for (const role of ["director", "superintendent", "manager", "broker"]) if (!contract.roles.includes(role) || !page.includes(role)) errors.push("função ausente: " + role);
if (contract.userMetadataIsAuthorizationSource !== false || contract.authorizationSource !== "profiles-table-under-rls") errors.push("fonte de autorização insegura");
if (!baseHierarchy.includes("private.can_view_commercial_profile") || !baseHierarchy.includes("profiles_commercial_scope")) errors.push("visibilidade hierárquica sem RLS");
if (!migration.includes("enable row level security") || !migration.includes("profile_hierarchy_events_scope")) errors.push("auditoria sem RLS");
for (const index of ["profile_hierarchy_events_profile_idx", "profile_hierarchy_events_actor_idx", "profile_hierarchy_events_previous_supervisor_idx", "profile_hierarchy_events_new_supervisor_idx"]) if (!migration.includes(index)) errors.push("índice de chave estrangeira ausente: " + index);
if (!migration.includes("supervisor.organization_id <> new.organization_id") || !migration.includes("broker_requires_manager") || !migration.includes("manager_requires_superintendent")) errors.push("banco não valida empresa e cadeia de liderança");
if (!migration.includes("reassign_active_direct_reports_first")) errors.push("liderança pode ser removida deixando subordinados órfãos");
if (!migration.includes("profile_authorization_fields_are_server_managed")) errors.push("usuário pode alterar campos de autorização do próprio perfil");
if (!migration.includes("revoke all on function public.manage_commercial_profile") || !migration.includes("to service_role")) errors.push("RPC privilegiada está exposta");
if (!route.includes("inviteUserByEmail") || !route.includes("updateUserById") || !route.includes("app_metadata")) errors.push("convite não usa fluxo administrativo seguro");
if (route.includes("user_metadata: { organization_id") || route.includes("user_metadata: { commercial_role")) errors.push("autorização gravada em user_metadata");
if (!route.includes("identity.supabase.from(\"profiles\")") || !route.includes("getSupabaseAdmin().rpc(\"manage_commercial_profile\"")) errors.push("leitura não usa RLS ou escrita não usa função governada");
if (!route.includes("validateSupervisor(identity.supabase") || !migration.includes("supervisor_outside_actor_hierarchy")) errors.push("superior paralelo pode ser escolhido por chamada manual");
if (!route.includes("emailDomain")) errors.push("log não protege identidade do convidado");
if (!page.includes("Estruturas paralelas e outras empresas ficam ocultas") || !page.includes("RLS e hierarquia ativas")) errors.push("interface não explica o escopo");

if (errors.length) { console.error("ATLAS COMMERCIAL HIERARCHY: FAILED"); errors.forEach((error) => console.error("- " + error)); process.exit(1); }
console.log("ATLAS COMMERCIAL HIERARCHY: PASSED (4 níveis; RLS; convites; auditoria; campos protegidos)");
