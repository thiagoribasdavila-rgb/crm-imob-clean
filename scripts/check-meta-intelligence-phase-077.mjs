import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-experiment-runtime-gate-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-experiment-runtime-gate.mjs", "utf8");
const doc = readFileSync("docs/META_EXPERIMENT_RUNTIME_GATE_PHASE_77.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_evaluated" && template.execution.dispatchAllowed === false, "template permite despacho");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes do gate incompletas");
for (const marker of ["validateMetaExperimentRuntimeGate", "staging_required", "exactly_one_attempt_required", "authorization_or_plan_integrity_missing", "dispatch_must_remain_blocked_for_preflight", "selfTestMetaExperimentRuntimeGate"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["autorização ativa", "ambiente staging", "qualquer contato com a Meta", "despacho manual posterior"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-experiment-runtime-gate.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do gate reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 77: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 77: aprovada — gate de runtime bloqueia desvios antes de qualquer contato externo.");
