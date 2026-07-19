import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/hierarchy-enforcement.json"), "utf8"));
const security = readFileSync(resolve(root, "lib/api/security.ts"), "utf8");
const sidebar = readFileSync(resolve(root, "components/atlas/sidebar.tsx"), "utf8");
const hierarchyMigration = readFileSync(resolve(root, "supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql"), "utf8");
const profileMigration = readFileSync(resolve(root, "supabase/migrations/20260717072714_secure_commercial_profile_hierarchy.sql"), "utf8");
const exportRoute = readFileSync(resolve(root, "app/api/v1/crm/leads/export/route.ts"), "utf8");
const exportPage = readFileSync(resolve(root, "app/(crm)/leads/export/page.tsx"), "utf8");
const weeklyReport = readFileSync(resolve(root, "app/api/v1/analytics/weekly-acquisition/route.ts"), "utf8");
const meta = readFileSync(resolve(root, "app/api/v1/integrations/meta/route.ts"), "utf8");
const decisions = readFileSync(resolve(root, "app/api/v3/decisions/[id]/route.ts"), "utf8");
const dlq = readFileSync(resolve(root, "app/api/v3/dlq/retry/route.ts"), "utf8");
const dataProducts = readFileSync(resolve(root, "app/api/atlas2030/data-products/publish/route.ts"), "utf8");
const errors = [];

for (const layer of ["frontend", "api", "database", "exports", "reports", "integrations"]) if (!contract.layers.includes(layer)) errors.push("camada ausente: " + layer);
if (!security.includes("resolveCommercialRole") || !security.includes("options.roles?.length && !options.roles.includes(effectiveRole)")) errors.push("controle central ainda usa somente papel legado");
for (const role of ["director", "superintendent", "manager", "broker"]) if (!sidebar.includes(role)) errors.push("navegação sem perfil: " + role);
if (!hierarchyMigration.includes("private.can_view_commercial_profile") || !hierarchyMigration.includes("private.can_access_commercial_lead")) errors.push("banco sem hierarquia comercial");
if (!profileMigration.includes("profile_authorization_fields_are_server_managed") || !profileMigration.includes("supervisor_outside_actor_hierarchy")) errors.push("campos ou vínculos hierárquicos desprotegidos");
if (!exportRoute.includes('eq("organization_id"') || !exportRoute.includes('role === "broker"') || !exportRoute.includes('eq("assigned_to"') || !exportRoute.includes("MAX_ROWS = 10_000")) errors.push("exportação não replica organização e carteira");
if (!exportRoute.includes('/^[=+\\-@]/') || !exportRoute.includes("personalContactFieldsReturned: false")) errors.push("CSV vulnerável ou com contato pessoal");
const exportSelection = exportRoute.match(/\.select\("([^"]+)"\)/)?.[1] || "";
for (const forbidden of ["phone", "email", "cpf"]) if (exportSelection.split(",").includes(forbidden)) errors.push("campo pessoal exportado: " + forbidden);
if (!exportPage.includes("Diretor: organização inteira") || !exportPage.includes("Corretor: somente suas leads")) errors.push("interface de exportação não explica escopo");
if (!weeklyReport.includes('roles: ["admin", "director"]')) errors.push("relatório financeiro semanal sem diretoria");
if (!meta.includes("directorDecisionOnly: true") || !meta.includes("Somente o diretor pode decidir")) errors.push("integração Meta permite decisão fora da diretoria");
if (!decisions.includes('decision.decision_type === "optimize_campaign" && effectiveRole !== "director"')) errors.push("motor de decisões permite campanha fora da diretoria");
if (!dlq.includes("isDirectorProfile") || !dataProducts.includes("isDirectorProfile")) errors.push("operações estratégicas ainda aceitam papel legado de gerente");
if (contract.strategicDecisionRole !== "director" || contract.exportPolicy.maximumRows !== 10000) errors.push("contrato transversal inválido");

if (errors.length) { console.error("ATLAS HIERARCHY ENFORCEMENT: FAILED"); errors.forEach((error) => console.error("- " + error)); process.exit(1); }
console.log("ATLAS HIERARCHY ENFORCEMENT: PASSED (6 camadas; 4 perfis; decisões e exportações governadas)");
