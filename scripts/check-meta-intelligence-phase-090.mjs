import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-change-approval-template.json", "scripts/preflight-meta-change-approval.mjs", "docs/META_CHANGE_APPROVAL_PHASE_90.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-change-approval.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_CHANGE_APPROVAL_PHASE_90.md`, "utf8");
const markers = ["validateMetaChangeApproval", "independent_review_required", "approval_expiry_invalid", "meta_change_approval_valid_preparation_only", "selfTestMetaChangeApproval"];
const docMarkers = ["dois revisores independentes", "prazo de validade", "preparação controlada", "não altera orçamento"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-change-approval.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 90: aprovada — dupla revisao auditavel, com validade e sem execucao automatica.");
