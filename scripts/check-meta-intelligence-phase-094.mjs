import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-post-execution-observation-template.json", "scripts/preflight-meta-post-execution-observation.mjs", "docs/META_POST_EXECUTION_OBSERVATION_PHASE_94.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-post-execution-observation.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_POST_EXECUTION_OBSERVATION_PHASE_94.md`, "utf8");
const markers = ["validateMetaPostExecutionObservation", "observation_definition_invalid", "external_change_observed", "meta_post_execution_observation_valid_human_interpretation_required", "selfTestMetaPostExecutionObservation"];
const docMarkers = ["observação agregada", "interpretação humana", "nunca é apresentado como causalidade comprovada", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-post-execution-observation.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 94: aprovada — observacao agregada, nao causal e sem otimizacao automatica.");
