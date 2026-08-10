import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase31RuntimeEvidence } from "./preflight-meta-repeatability-sample-02-runtime-evidence.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceInput = process.env.ATLAS_PHASE31_RUNTIME_EVIDENCE_FILE;
const receiptInput = process.env.ATLAS_PHASE31_RECONCILIATION_FILE ?? "artifacts/meta-phase31-runtime-evidence-reconciliation.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (!evidenceInput) {
  console.error("missing_runtime_evidence_path");
  process.exit(1);
}
const evidenceFile = resolveWorkspaceFile(evidenceInput);
const receiptFile = resolveWorkspaceFile(receiptInput);
if (!withinWorkspace(evidenceFile) || !withinWorkspace(receiptFile)) {
  console.error("phase31_path_outside_workspace");
  process.exit(1);
}
if (!existsSync(evidenceFile) || lstatSync(evidenceFile).isSymbolicLink() || !lstatSync(evidenceFile).isFile()) {
  console.error("runtime_evidence_file_invalid");
  process.exit(1);
}
if (!withinWorkspace(realpathSync(evidenceFile)) || lstatSync(evidenceFile).size > 1024 * 1024) {
  console.error("runtime_evidence_file_unsafe");
  process.exit(1);
}

let evidence;
const rawEvidence = readFileSync(evidenceFile, "utf8");
try {
  evidence = JSON.parse(rawEvidence);
} catch {
  console.error("runtime_evidence_json_invalid");
  process.exit(1);
}
const validation = validatePhase31RuntimeEvidence(evidence);
if (!validation.approved) {
  console.error(`runtime_evidence_rejected:${validation.issues.join(",")}`);
  process.exit(1);
}

const receipt = {
  schemaVersion: "phase31.runtime-reconciliation.v1",
  phase: 31,
  sourcePhase: 30,
  status: "approved",
  checkedAt: new Date().toISOString(),
  evidenceFingerprint: sha256(rawEvidence),
  eventSequenceFingerprint: sha256(JSON.stringify(evidence.eventSequence)),
  artifactFingerprintsMatched: true,
  runtimeApproved: true,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};
mkdirSync(dirname(receiptFile), { recursive: true });
writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: receipt.status, receiptFile: receiptFile.slice(root.length + 1), ...validation }, null, 2));
