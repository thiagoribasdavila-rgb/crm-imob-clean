import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase33CrossMajorSources } from "./preflight-meta-repeatability-sample-02-cross-major-reconciliation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const maximumInputBytes = 1024 * 1024;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

const sourceInputs = {
  phase30Evidence: process.env.ATLAS_PHASE31_RUNTIME_EVIDENCE_FILE,
  phase31Receipt: process.env.ATLAS_PHASE31_RECONCILIATION_FILE,
  phase32Evidence: process.env.ATLAS_PHASE32_EVIDENCE_FILE
};
const outputInput = process.env.ATLAS_PHASE33_RECONCILIATION_FILE ?? "artifacts/meta-phase33-cross-major-reconciliation.json";

if (Object.values(sourceInputs).some((value) => !value)) {
  console.error("phase33_source_evidence_paths_required");
  process.exit(1);
}

const loadSafeJson = (input, label) => {
  const file = resolveWorkspaceFile(input);
  if (!withinWorkspace(file)) throw new Error(`phase33_source_path_outside_workspace:${label}`);
  if (!existsSync(file)) throw new Error(`phase33_source_file_missing:${label}`);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`phase33_source_file_invalid:${label}`);
  if (stat.size > maximumInputBytes || !withinWorkspace(realpathSync(file))) throw new Error(`phase33_source_file_unsafe:${label}`);
  const raw = readFileSync(file, "utf8");
  try {
    return { file, raw, value: JSON.parse(raw) };
  } catch {
    throw new Error(`phase33_source_json_invalid:${label}`);
  }
};

let sources;
try {
  sources = Object.fromEntries(Object.entries(sourceInputs).map(([label, input]) => [label, loadSafeJson(input, label)]));
} catch (error) {
  console.error(error instanceof Error ? error.message : "phase33_source_read_failed");
  process.exit(1);
}

const outputFile = resolveWorkspaceFile(outputInput);
if (!withinWorkspace(outputFile)) {
  console.error("phase33_output_path_outside_workspace");
  process.exit(1);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase33_output_symlink_rejected");
  process.exit(1);
}

const validation = validatePhase33CrossMajorSources({
  phase30Evidence: sources.phase30Evidence.value,
  phase31Receipt: sources.phase31Receipt.value,
  phase32Evidence: sources.phase32Evidence.value,
  rawPhase30: sources.phase30Evidence.raw,
  rawPhase31Receipt: sources.phase31Receipt.raw
});
if (!validation.approved) {
  console.error(`phase33_cross_major_evidence_rejected:${validation.issues.join(",")}`);
  process.exit(1);
}

const receipt = {
  schemaVersion: "phase33.cross-major-reconciliation.v1",
  phase: 33,
  sourcePhase: 32,
  status: "approved",
  checkedAt: new Date().toISOString(),
  sourceFingerprints: {
    phase30Evidence: sha256(sources.phase30Evidence.raw),
    phase31Receipt: sha256(sources.phase31Receipt.raw),
    phase32Evidence: sha256(sources.phase32Evidence.raw)
  },
  comparison: validation.comparison,
  crossMajorApproved: true,
  productionCompatibilityApproved: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};

mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase33_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: receipt.status,
  receiptFile: outputFile.slice(root.length + 1),
  crossMajorApproved: receipt.crossMajorApproved,
  productionCompatibilityApproved: receipt.productionCompatibilityApproved,
  issues: []
}, null, 2));
