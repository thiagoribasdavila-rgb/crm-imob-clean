import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA } from "./supabase-named-remote-capture-consumption-receipt.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger.v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FILE_PATTERN = /^([a-f0-9]{64})\.json$/;
const SAFE_CODE_PATTERN = /^[a-z0-9_.-]{1,96}$/;
const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_RECEIPTS = 10_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function serialized(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function validIso(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function insideRoot(root, candidate, { allowRoot = false } = {}) {
  const path = relative(root, candidate);
  if (path === "") return allowRoot;
  return path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    ledgerVerified: false,
    deterministicReplayVerified: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

function allFalse(object, keys) {
  return keys.every((key) => object?.[key] === false);
}

function validateReceipt(receipt, handoffIdFromFile) {
  if (
    !receipt ||
    receipt.schemaVersion !== NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA ||
    receipt.phase !== 187 ||
    !["consumed_capture_adapted", "consumed_capture_rejected"].includes(receipt.status) ||
    !validIso(receipt.recordedAt) ||
    !SHA256_PATTERN.test(receipt.receiptSha256 ?? "")
  ) return "receipt_envelope_invalid";

  const handoff = receipt.handoff;
  for (const key of [
    "handoffIdSha256",
    "authorizationReviewSha256",
    "operationFingerprintSha256",
    "targetProjectRefSha256",
    "querySha256",
    "localFingerprintSetSha256",
  ]) {
    if (!SHA256_PATTERN.test(handoff?.[key] ?? "")) return "receipt_handoff_invalid";
  }
  for (const key of ["issuedAt", "expiresAt", "consumedAt"]) {
    if (!validIso(handoff?.[key])) return "receipt_handoff_timestamp_invalid";
  }
  if (handoff.handoffIdSha256 !== handoffIdFromFile) return "receipt_filename_mismatch";

  const accepted = receipt.outcome?.accepted;
  if (typeof accepted !== "boolean" || !SAFE_CODE_PATTERN.test(receipt.outcome?.reason ?? "")) {
    return "receipt_outcome_invalid";
  }
  if (
    receipt.outcome.adapterReason !== null &&
    !SAFE_CODE_PATTERN.test(receipt.outcome.adapterReason ?? "")
  ) return "receipt_outcome_invalid";
  if (accepted !== (receipt.status === "consumed_capture_adapted")) {
    return "receipt_status_outcome_mismatch";
  }
  const evidence = receipt.outcome.evidenceSummary;
  if (evidence !== null) {
    if (
      accepted !== true ||
      !SAFE_CODE_PATTERN.test(evidence?.schemaVersion ?? "") ||
      !Number.isSafeInteger(evidence?.mappingCount) ||
      evidence.mappingCount < 0 ||
      !SHA256_PATTERN.test(evidence?.evidenceSha256 ?? "")
    ) return "receipt_evidence_summary_invalid";
  }

  if (!allFalse(receipt.privacy, [
    "rawCaptureIncluded",
    "sqlBodiesIncluded",
    "migrationNamesIncluded",
    "rawProjectRefIncluded",
    "credentialsIncluded",
    "personalDataIncluded",
  ])) return "receipt_privacy_contract_invalid";
  if (!allFalse(receipt.execution, [
    "remoteContactedByReceipt",
    "remoteWriteExecuted",
    "migrationApplied",
    "migrationHistoryRepaired",
    "databaseReset",
    "buildExecuted",
    "zipGenerated",
    "deployExecuted",
  ])) return "receipt_execution_contract_invalid";

  const { receiptSha256, ...withoutHash } = receipt;
  if (sha256(serialized(withoutHash)) !== receiptSha256) return "receipt_hash_mismatch";
  return null;
}

function safeReadReceipt(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) return result("receipt_path_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("receipt_file_mode_invalid");
    if (stat.size > MAX_RECEIPT_BYTES) return result("receipt_file_too_large");
    const raw = readFileSync(descriptor, "utf8");
    try {
      return { ok: true, receipt: JSON.parse(raw) };
    } catch {
      return result("receipt_json_invalid");
    }
  } catch (error) {
    if (error?.code === "ELOOP") return result("receipt_path_symlink_refused");
    return result("receipt_read_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyNamedRemoteCaptureReceiptLedger({
  root = process.cwd(),
  receiptDirectory,
  expectedLedgerSha256,
  maxReceipts = MAX_RECEIPTS,
} = {}) {
  if (!receiptDirectory) return result("receipt_ledger_directory_required");
  if (!Number.isSafeInteger(maxReceipts) || maxReceipts < 1 || maxReceipts > MAX_RECEIPTS) {
    return result("receipt_ledger_limit_invalid");
  }
  if (expectedLedgerSha256 !== undefined && !SHA256_PATTERN.test(expectedLedgerSha256)) {
    return result("receipt_ledger_expected_hash_invalid");
  }

  const absoluteRoot = resolve(root);
  const absoluteDirectory = resolve(absoluteRoot, receiptDirectory);
  if (!insideRoot(absoluteRoot, absoluteDirectory, { allowRoot: false })) {
    return result("receipt_ledger_directory_outside_root");
  }

  let physicalRoot;
  let physicalDirectory;
  let entries;
  try {
    physicalRoot = realpathSync(absoluteRoot);
    physicalDirectory = realpathSync(absoluteDirectory);
    if (!insideRoot(physicalRoot, physicalDirectory, { allowRoot: false })) {
      return result("receipt_ledger_directory_symlink_escape");
    }
    entries = readdirSync(physicalDirectory, { withFileTypes: true });
  } catch {
    return result("receipt_ledger_directory_unreadable");
  }
  if (entries.length > maxReceipts) return result("receipt_ledger_limit_exceeded");

  const records = [];
  const handoffIds = new Set();
  const receiptHashes = new Set();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const match = FILE_PATTERN.exec(entry.name);
    if (!match || !entry.isFile() || entry.isSymbolicLink()) {
      return result("receipt_ledger_unexpected_entry");
    }
    const handoffIdSha256 = match[1];
    const read = safeReadReceipt(resolve(physicalDirectory, entry.name));
    if (!read.ok) return read;
    const invalidReason = validateReceipt(read.receipt, handoffIdSha256);
    if (invalidReason) return result(invalidReason);
    if (handoffIds.has(handoffIdSha256)) return result("receipt_ledger_duplicate_handoff");
    if (receiptHashes.has(read.receipt.receiptSha256)) {
      return result("receipt_ledger_duplicate_receipt_hash");
    }
    handoffIds.add(handoffIdSha256);
    receiptHashes.add(read.receipt.receiptSha256);
    records.push({
      handoffIdSha256,
      receiptSha256: read.receipt.receiptSha256,
      status: read.receipt.status,
      recordedAt: read.receipt.recordedAt,
    });
  }

  const ledger = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA,
    phase: 188,
    receiptCount: records.length,
    acceptedCount: records.filter((record) => record.status === "consumed_capture_adapted").length,
    rejectedCount: records.filter((record) => record.status === "consumed_capture_rejected").length,
    records,
  };
  const ledgerSha256 = sha256(serialized(ledger));
  if (expectedLedgerSha256 !== undefined && expectedLedgerSha256 !== ledgerSha256) {
    return result("receipt_ledger_replay_mismatch", { ledgerSha256 });
  }
  return {
    ok: true,
    reason: expectedLedgerSha256
      ? "receipt_ledger_replay_verified"
      : "receipt_ledger_integrity_verified",
    ledgerVerified: true,
    deterministicReplayVerified: expectedLedgerSha256 === ledgerSha256,
    ledgerSha256,
    summary: {
      receiptCount: ledger.receiptCount,
      acceptedCount: ledger.acceptedCount,
      rejectedCount: ledger.rejectedCount,
      firstRecordedAt: records.length
        ? records.reduce((minimum, record) => record.recordedAt < minimum ? record.recordedAt : minimum, records[0].recordedAt)
        : null,
      lastRecordedAt: records.length
        ? records.reduce((maximum, record) => record.recordedAt > maximum ? record.recordedAt : maximum, records[0].recordedAt)
        : null,
    },
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
  };
}
