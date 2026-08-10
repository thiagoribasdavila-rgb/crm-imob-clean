import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-manual-execution-receipt-template.json", "scripts/preflight-meta-manual-execution-receipt.mjs", "docs/META_MANUAL_EXECUTION_RECEIPT_PHASE_93.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-manual-execution-receipt.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_MANUAL_EXECUTION_RECEIPT_PHASE_93.md`, "utf8");
const markers = ["validateMetaManualExecutionReceipt", "manual_evidence_missing", "execution_boundary_invalid", "meta_manual_execution_receipt_valid_for_observation", "selfTestMetaManualExecutionReceipt"];
const docMarkers = ["comprovante mínimo", "operação humana externa", "não executa a mudança", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-manual-execution-receipt.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 93: aprovada — comprovante humano minimo, auditavel e sem execucao pelo Atlas.");
