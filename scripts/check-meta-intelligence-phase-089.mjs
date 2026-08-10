import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-change-request-template.json", "scripts/preflight-meta-change-request.mjs", "docs/META_CHANGE_REQUEST_PHASE_89.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-change-request.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_CHANGE_REQUEST_PHASE_89.md`, "utf8");
const markers = ["validateMetaChangeRequest", "plan_reference_missing", "external_change_observed", "meta_change_request_valid_pending_human_approval", "selfTestMetaChangeRequest"];
const docMarkers = ["solicitação formal de mudança", "pendente de aprovação humana", "não aprova nem executa", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-change-request.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 89: aprovada — solicitacao formal, limitada e sem execucao automatica.");
