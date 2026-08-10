import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const config = readJson(
  "config/atlas-10x-phase-014-security-remediation-backlog.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-014/security-remediation-backlog-evidence.json",
);
const packageJson = readJson("package.json");
const generator = read(
  "scripts/run-atlas-security-remediation-backlog-phase-014.mjs",
);
const reviewTemplate = read(
  "scripts/sql/phase-014-security-remediation-review-template.sql",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_014_SECURITY_REMEDIATION_BACKLOG.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_014_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-014.v1" &&
    config.phase === 14 &&
    config.total_phases === 24,
  "contrato da Fase 14 está versionado",
);
expect(
  config.input_contract.requires_phase_013_security_approval === false &&
    config.input_contract.requires_canonical_inventory_integrity === true,
  "backlog exige inventário íntegro sem exigir segurança já aprovada",
);
expect(
  config.risk_taxonomy.P0.length === 6 &&
    config.risk_taxonomy.P1.length === 6,
  "taxonomia contém 12 classes P0/P1",
);
expect(
  config.risk_taxonomy.P0.includes("EXPOSED_TABLE_WITHOUT_RLS") &&
    config.risk_taxonomy.P0.includes("ANON_BUSINESS_GRANT") &&
    config.risk_taxonomy.P0.includes("SECURITY_DEFINER_PUBLIC_EXECUTE"),
  "P0 cobre exposição, anon e função privilegiada",
);
expect(
  config.risk_taxonomy.P1.includes("UPDATE_POLICY_INCOMPLETE") &&
    config.risk_taxonomy.P1.includes(
      "SECURITY_DEFINER_UNSAFE_SEARCH_PATH",
    ) &&
    config.risk_taxonomy.P1.includes("INVENTORY_INCOMPLETE"),
  "P1 cobre UPDATE, search_path e inventário parcial",
);
expect(
  config.remediation_order.length === 7 &&
    config.remediation_order[0].id === "CONTAIN_EXPOSURE" &&
    config.remediation_order.at(-1).id === "REHEARSE_AND_APPROVE",
  "sete etapas ordenam contenção antes de aprovação",
);
expect(
  config.security_contract.supabase_2026_explicit_grants_required === true &&
    config.security_contract.rls_does_not_replace_grants === true &&
    config.security_contract.updates_require_select_using_and_with_check ===
      true,
  "contrato explicita grants 2026, RLS e UPDATE",
);
expect(
  config.backlog_contract.executable_sql_allowed === false &&
    config.backlog_contract.automatic_migration_allowed === false &&
    config.backlog_contract.automatic_remediation_allowed === false &&
    config.backlog_contract.human_approval_required === true,
  "automação de DDL e correção permanece proibida",
);
expect(
  config.execution_policy.allows_remote_metadata_read === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false &&
    config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "fase não toca remoto, build ou pacote",
);
expect(
  evidence.status === "backlog_not_generated" &&
    evidence.backlog.generated === false &&
    evidence.backlog.review_status === "unapproved" &&
    evidence.backlog.sql_applied === false,
  "evidência inicial não alega backlog nem SQL aplicado",
);
expect(
  evidence.safety.remote_read_executed === false &&
    evidence.safety.remote_write_executed === false &&
    evidence.safety.live_homologation_touched === false &&
    evidence.safety.migration_applied === false,
  "evidência preserva remoto e homologação",
);
expect(
  reviewTemplate
    .split(/\r?\n/)
    .every(
      (line) => line.trim() === "" || line.trim().startsWith("--"),
    ),
  "modelo SQL contém somente comentários",
);
expect(
  reviewTemplate.includes("RLS e grants") &&
    reviewTemplate.includes("USING e WITH CHECK") &&
    reviewTemplate.includes("security_invoker") &&
    reviewTemplate.includes("SECURITY DEFINER"),
  "modelo registra os controles Supabase essenciais",
);
expect(
  !/^\s*(?:alter|create|drop|grant|revoke|insert|update|delete|begin|commit)\b/im.test(
    reviewTemplate,
  ),
  "modelo não possui comando SQL executável",
);
expect(
  generator.includes("generateSecurityBacklog") &&
    generator.includes("renderCommentOnlyReview") &&
    generator.includes("findingId"),
  "gerador produz backlog determinístico e revisão comentada",
);
expect(
  generator.includes("review_status: \"unapproved\"") &&
    generator.includes("automatic_remediation_allowed: false") &&
    generator.includes("human_approval_required: true"),
  "todo achado nasce não aprovado e exige revisão humana",
);
expect(
  generator.includes("historical_migrations_are_not_runtime_proof") &&
    generator.includes(
      "phase_013_canonical_snapshot_required_for_remediation",
    ),
  "histórico local não substitui snapshot canônico",
);
expect(
  !generator.includes("writeFileSync") &&
    !generator.includes("apply_migration") &&
    !generator.includes("supabase db push"),
  "gerador não grava migration nem aplica mudança",
);
expect(
  packageJson.scripts?.["atlas:security-backlog:assess"]?.includes(
    "run-atlas-security-remediation-backlog-phase-014.mjs",
  ) &&
    packageJson.scripts?.["atlas:security-backlog:check"]?.includes(
      "check-atlas-security-remediation-backlog-phase-014.mjs",
    ),
  "comandos da Fase 14 estão publicados",
);
expect(
  runbook.includes("P0") &&
    runbook.includes("P1") &&
    runbook.includes("Supabase em 2026") &&
    runbook.includes("não significa"),
  "runbook explica severidade, grants atuais e ausência de evidência",
);
expect(
  resultDoc.includes("12/12") &&
    resultDoc.includes("6/21") &&
    resultDoc.includes("Homologação alterada | Não"),
  "resultado registra mutantes, gates e segurança operacional",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-security-remediation-backlog-phase-014.mjs",
    "--self-test",
  ],
  { encoding: "utf8" },
);
let selfTestPayload = {};
try {
  selfTestPayload = JSON.parse(selfTest.stdout);
} catch {
  selfTestPayload = {};
}
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.mutants_classified === 12 &&
    selfTestPayload.review_output === "comment_only" &&
    selfTestPayload.automatic_remediation === "disabled",
  "baseline segura passa e 12 mutantes são classificados",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-security-remediation-backlog-phase-014.mjs"],
  { encoding: "utf8" },
);
let assessmentPayload = {};
try {
  assessmentPayload = JSON.parse(assessment.stdout);
} catch {
  assessmentPayload = {};
}
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "security_remediation_contract_ready_inventory_blocked" &&
    assessmentPayload.specification?.passed === 6 &&
    assessmentPayload.specification?.total === 21 &&
    assessmentPayload.conclusion?.backlog_ready_for_review === false,
  "avaliação falha fechado sem o snapshot canônico",
);
expect(
  assessmentPayload.canonical_backlog?.total === 0 &&
    assessmentPayload.conclusion?.changes_approved === false &&
    assessmentPayload.conclusion?.sql_applied === false,
  "zero achados não é convertido em aprovação",
);
expect(
  assessmentPayload.safety?.remote_write_executed === false &&
    assessmentPayload.safety?.live_homologation_touched === false &&
    assessmentPayload.safety?.build_executed === false &&
    assessmentPayload.safety?.package_created === false,
  "execução preserva remoto, homologação, build e ZIP",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exit(1);
