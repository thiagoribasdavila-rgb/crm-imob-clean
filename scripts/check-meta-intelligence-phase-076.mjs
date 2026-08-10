import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-experiment-execution-authorization-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-experiment-execution-authorization.mjs", "utf8");
const doc = readFileSync("docs/META_EXPERIMENT_EXECUTION_AUTHORIZATION_PHASE_76.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending" && template.execution.externalTestAllowed === false, "template permite execucao precoce");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de autorizacao incompletas");
for (const marker of ["validateMetaExperimentExecutionAuthorization", "authorization_window_invalid", "staging_single_attempt_required", "execution_must_remain_blocked_until_runtime_gate", "meta_experiment_execution_authorization_valid_runtime_gate_required", "selfTestMetaExperimentExecutionAuthorization"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["plano e a permissão correspondentes", "uma tentativa em staging", "gate de runtime", "dados de clientes ou segredos"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-experiment-execution-authorization.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da autorizacao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 76: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 76: aprovada — autorizacao vinculada, curta e limitada a uma tentativa em staging.");
