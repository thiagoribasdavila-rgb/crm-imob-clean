import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-029.json"));
const gate = JSON.parse(read(config.rehearsalGate));
const migration = read(config.officialMigration);
const draft = read(config.sourceDraft);
const rollback = read(config.rollbackDraft);
const runner = read(config.runner);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const normalizeSql = (value) => value
  .replace(/^--.*$/gm, "")
  .replace(/'Phase 28 draft: atomically reserves one sanitized Meta permit identity\. It never issues, consumes or delivers an event\.'/g, "'phase-comment'")
  .replace(/'Phase 29 isolated rehearsal migration: atomically reserves one sanitized Meta permit identity\. It never issues, consumes or delivers an event\.'/g, "'phase-comment'")
  .replace(/\s+/g, " ")
  .trim();

expect(/^supabase\/migration-rehearsals\/\d{14}_phase_029_meta_permit_atomic_ledger\.sql$/.test(config.officialMigration), "nome do ensaio governado invalido");
expect(normalizeSql(migration) === normalizeSql(draft), "migration promovida divergiu estruturalmente do rascunho aprovado");
expect(migration.includes("atlas_meta_ledger_staging_clone_only") && migration.includes("atlas_meta_ledger_base_contract_missing"), "travas de ambiente ausentes");
expect(migration.includes("force row level security") && migration.includes("security invoker") && !/security definer/i.test(migration), "RLS ou invoker invalidos");
expect(migration.includes("on conflict do nothing") && migration.includes("meta_ledger_identity_collision"), "idempotencia atomica ausente");
expect(migration.includes("revoke all on table atlas_private.meta_permit_ledger from public, anon, authenticated"), "acesso publico ao ledger nao revogado");
expect(migration.includes("grant execute on function public.atlas_prepare_meta_permit_reservation_v1") && migration.includes("to service_role"), "RPC nao restrita ao service role");
expect(rollback.includes("rollback_refuses_non_empty_ledger") && !/drop schema/i.test(rollback), "rollback inseguro");
expect(runner.includes('"db", "query", "--db-url"') && runner.includes("--file"), "runner nao usa db query governado");
expect(!runner.includes('"--linked"') && !runner.includes('"db", "push"') && !runner.includes('"migration", "up"'), "runner permite alvo vinculado ou push");
expect(runner.includes("production_identity_collision") || read(config.preflight).includes("production_identity_collision"), "comparacao com producao ausente");
expect(runner.includes("rollbackAttempted") && runner.includes("finalLedgerObjectsAbsent"), "ciclo de rollback incompleto");
expect(runner.includes("hostFingerprint") && !runner.includes("databaseUrl: databaseUrl"), "evidencia pode persistir credencial bruta");
expect(gate.targetIdentity.linkedProjectForbidden === true && gate.prohibitedActions.productionMutation === true, "gate de destino incompleto");

const report = {
  passed: failures.length === 0,
  assertionCount: 14,
  officialMigrationSha256: createHash("sha256").update(migration).digest("hex"),
  structuralParitySha256: createHash("sha256").update(normalizeSql(migration)).digest("hex"),
  databaseTouched: false,
  networkTouched: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
