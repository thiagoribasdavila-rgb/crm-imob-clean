import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-execution-preparation-template.json", "scripts/preflight-meta-execution-preparation.mjs", "docs/META_EXECUTION_PREPARATION_PHASE_91.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-execution-preparation.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_EXECUTION_PREPARATION_PHASE_91.md`, "utf8");
const markers = ["validateMetaExecutionPreparation", "approval_expired", "external_change_observed", "meta_execution_preparation_valid_final_gate_required", "selfTestMetaExecutionPreparation"];
const docMarkers = ["pacote técnico", "Aprovações vencidas são bloqueadas", "gate final", "não altera orçamento"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-execution-preparation.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 91: aprovada — preparacao controlada com validade e gate final obrigatorio.");
