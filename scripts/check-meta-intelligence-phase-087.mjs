import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const required = [
  "config/fixtures/meta-simulation-decision-template.json",
  "scripts/preflight-meta-simulation-decision.mjs",
  "docs/META_SIMULATION_DECISION_PHASE_87.md"
];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-simulation-decision.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_SIMULATION_DECISION_PHASE_87.md`, "utf8");
const markers = ["validateMetaSimulationDecision", "reviewer_reference_missing", "external_change_observed", "meta_simulation_decision_recorded_planning_only", "selfTestMetaSimulationDecision"];
const docMarkers = ["aprovada apenas para planejamento", "referência do revisor", "não autoriza execução", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-simulation-decision.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 87: aprovada — decisao humana auditavel, sem autorizacao automatica de execucao.");
