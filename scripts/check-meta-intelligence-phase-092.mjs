import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-final-execution-gate-template.json", "scripts/preflight-meta-final-execution-gate.mjs", "docs/META_FINAL_EXECUTION_GATE_PHASE_92.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-final-execution-gate.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_FINAL_EXECUTION_GATE_PHASE_92.md`, "utf8");
const markers = ["validateMetaFinalExecutionGate", "explicit_confirmation_missing", "approval_expired", "meta_final_execution_gate_valid_manual_action_required", "selfTestMetaFinalExecutionGate"];
const docMarkers = ["confirmação explícita", "frase de confirmação", "não ganha autorização automática", "não utiliza dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-final-execution-gate.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 92: aprovada — gate final explicito, restrito e sem execucao automatica.");
