import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migration-drafts/20260719070511_reconcile_legacy_and_canonical_contracts.sql");
const query = read("scripts/sql/meta-data-api-access-audit.sql");
const runner = read("scripts/run-meta-data-api-access-reconciliation.mjs");
const preflight = read("scripts/preflight-meta-data-api-access.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const marker of [
  "alter table public.organizations enable row level security",
  "grant select (id, name, slug, plan, active)",
  "grant update (name, slug)",
  "grant update (name, full_name, avatar_url, phone, creci, bio, updated_at)",
  "grant select, insert, update on table public.leads to authenticated",
  "grant all on table public.organizations, public.profiles, public.leads to service_role",
]) expect(migration.includes(marker), `contrato explicito ausente: ${marker}`);

expect(!/grant[^;]*delete[^;]*public\.leads[^;]*authenticated;/i.test(migration), "DELETE de leads foi exposto ao authenticated");

const executableQuery = query.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
expect(executableQuery.toLowerCase().startsWith("with "), "consulta catalogal nao inicia em modo somente leitura");
expect(!/^\s*(grant|revoke|alter|create|drop|insert|update|delete|truncate|call|do)\b/im.test(executableQuery), "consulta catalogal contem comando mutavel");

for (const marker of [
  "pg_policies",
  "has_table_privilege",
  "has_column_privilege",
  "anonymousPrivilegesRevoked",
  "requiredAuthenticatedColumnPrivilegesGranted",
  "updatePoliciesHaveUsingAndWithCheck",
  "queryReadOnly",
]) expect(query.includes(marker), `evidencia catalogal incompleta: ${marker}`);

for (const marker of [
  "ATLAS_PHASE16_RECONCILIATION_EVIDENCE_FILE",
  "ATLAS_PHASE17_CATALOG_EVIDENCE_FILE",
  "validateMetaAuthReconciliationEvidence",
  "validateMetaDataApiCatalogEvidence",
  "evidence_file_outside_workspace",
  "dataApiGrantsRlsApproved",
  "productionAllowed: false",
]) expect(runner.includes(marker), `reconciliador incompleto: ${marker}`);

expect(!runner.includes("fetch(") && !runner.includes("createClient("), "reconciliador tentou acesso remoto");
expect(preflight.includes("validateMetaDataApiCatalogEvidence") && preflight.includes("validateMetaDataApiAccessEvidence"), "preflight nao valida os dois contratos");
expect(preflight.includes("leadDeleteNotGranted") && preflight.includes("anonymous_column_exposure"), "preflight omite menor privilegio ou exposicao anonima");

if (failures.length) {
  console.error("META DATA API ACCESS AUDIT: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META DATA API ACCESS AUDIT: aprovada — grants explicitos, RLS, menor privilegio e prova catalogal somente leitura estao protegidos.");
