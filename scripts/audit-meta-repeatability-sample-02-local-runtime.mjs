import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-030.json"));
const gate = JSON.parse(read(config.runtimeGate));
const template = JSON.parse(read(config.evidenceTemplate));
const compose = read(config.composeFile);
const migration = read(config.officialMigration);
const draft = read(config.sourceDraft);
const baseline = read(config.baselineSql);
const verify = read(config.verificationSql);
const cleanupVerify = read(config.cleanupVerificationSql);
const runner = read(config.runner);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const normalizeSql = (value) => value
  .replace(/^--.*$/gm, "")
  .replace(/'Phase 28 draft: atomically reserves one sanitized Meta permit identity\. It never issues, consumes or delivers an event\.'/g, "'phase-comment'")
  .replace(/'Phase 29 isolated rehearsal migration: atomically reserves one sanitized Meta permit identity\. It never issues, consumes or delivers an event\.'/g, "'phase-comment'")
  .replace(/\s+/g, " ")
  .trim();

expect(gate.environment === "local_ephemeral" && gate.runtime.host === "127.0.0.1" && gate.runtime.remoteTarget === false, "destino local efemero invalido");
expect(gate.runtime.postgresImage === "supabase/postgres:15.14.1.149" && compose.includes("supabase/postgres:15.14.1.149"), "imagem Supabase nao fixada");
expect(compose.includes('"127.0.0.1:55432:5432"') && compose.includes("phase30-postgres-data"), "porta local ou volume efemero ausente");
expect(normalizeSql(migration) === normalizeSql(draft), "migration oficial divergiu do rascunho");
for (const indexName of ["meta_permit_ledger_actor_idx", "meta_permit_ledger_audit_ledger_idx", "meta_permit_ledger_audit_actor_idx"]) {
  expect(migration.includes(indexName), `indice de FK ausente: ${indexName}`);
}
expect(baseline.includes("phase30_local_ephemeral_only") && !/insert\s+into\s+public\./i.test(baseline), "baseline local inseguro");
expect(verify.includes("relforcerowsecurity") && verify.includes("phase30_unexpected_permit_record") && verify.includes("has_function_privilege"), "verificacao de seguranca incompleta");
expect(cleanupVerify.includes("phase30_rollback_incomplete"), "verificacao de rollback ausente");
expect(!/insert\s+into\s+atlas_private\.meta_permit_ledger/i.test(verify), "teste tentou criar reserva de permissao");
expect(runner.includes('"down", "--volumes", "--remove-orphans"') && runner.includes("finally"), "destruicao obrigatoria do runtime ausente");
expect(runner.includes("127.0.0.1:55432/atlas_phase30") && !runner.includes("ATLAS_PHASE30_DB_URL"), "runner permite URL remota");
expect(!runner.includes('"db", "push"') && !runner.includes('"link"') && !runner.includes("graph.facebook.com"), "runner permite Supabase remoto ou Meta");
expect(template.status === "not_run" && template.rehearsal.permitReservationExecuted === false && Object.values(template.releaseGates).every((value) => value === false), "template alegou execucao");

const report = {
  passed: failures.length === 0,
  assertionCount: 16,
  databaseTouched: false,
  networkTouched: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
