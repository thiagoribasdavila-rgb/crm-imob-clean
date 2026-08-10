import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-dry-run-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-dry-run.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_DRY_RUN_PHASE_66.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_run" && template.simulation.externalCallsMade === false, "template indica ensaio executado");
expect(template.result.readyForSeparateExternalCommand === false, "template libera comando externo");
for (const marker of ["validateExternalTestDryRun", "dry_run_steps_incomplete", "simulation_control_invalid", "external_command_blocker_missing", "external_test_dry_run_valid_external_command_still_separate", "selfTestExternalTestDryRun"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não lê segredos", "não toca produção", "não chama Meta", "não executa build", "não cria ZIP"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-dry-run.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do ensaio seco reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 66: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 66: aprovada — ensaio seco confirma todos os bloqueios antes do comando externo separado.");
