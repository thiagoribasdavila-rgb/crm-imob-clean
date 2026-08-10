import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-observation-interpretation-template.json", "scripts/preflight-meta-observation-interpretation.mjs", "docs/META_OBSERVATION_INTERPRETATION_PHASE_95.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-observation-interpretation.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_OBSERVATION_INTERPRETATION_PHASE_95.md`, "utf8");
const markers = ["validateMetaObservationInterpretation", "insufficient_evidence_requires_collection", "external_change_observed", "meta_observation_interpretation_valid_human_learning_recommendation", "selfTestMetaObservationInterpretation"];
const docMarkers = ["nível de evidência", "Evidência insuficiente obriga", "causalidade automaticamente", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-observation-interpretation.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 95: aprovada — interpretacao humana com evidencia explicita e sem otimizacao automatica.");
