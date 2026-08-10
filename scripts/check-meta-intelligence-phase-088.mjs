import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const required = ["config/fixtures/meta-controlled-plan-template.json", "scripts/preflight-meta-controlled-plan.mjs", "docs/META_CONTROLLED_PLAN_PHASE_88.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-controlled-plan.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_CONTROLLED_PLAN_PHASE_88.md`, "utf8");
const markers = ["validateMetaControlledPlan", "decision_reference_missing", "external_change_observed", "meta_controlled_plan_valid_draft_only", "selfTestMetaControlledPlan"];
const docMarkers = ["plano controlado", "rascunho para revisão humana", "não autoriza execução", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-controlled-plan.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 88: aprovada — plano controlado auditavel, sem execucao automatica.");
