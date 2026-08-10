import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof_custody_index.v1";

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^([a-f0-9]{64})\.json$/;
const MAX_BYTES = 16 * 1024;
const MAX_ENTRIES = 10_000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const serialized = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;
const validIso = (value) => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const inside = (root, candidate, allowRoot = false) => {
  const path = relative(root, candidate);
  return path === "" ? allowRoot : path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
};

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    indexVerified: false,
    localIndexEntryWritten: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    databaseWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

function directory(root, requested, create = false) {
  if (!requested) return result("proof_custody_index_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("proof_custody_index_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("proof_custody_index_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("proof_custody_index_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("proof_custody_index_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("proof_custody_index_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("proof_custody_index_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("proof_custody_index_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("proof_custody_index_directory_unreadable");
  }
}

function readEntry(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("proof_custody_index_entry_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("proof_custody_index_entry_mode_invalid");
    if (stat.size > MAX_BYTES) return result("proof_custody_index_entry_too_large");
    const raw = readFileSync(fd, "utf8");
    try {
      return { ok: true, raw, entry: JSON.parse(raw) };
    } catch {
      return result("proof_custody_index_entry_json_invalid");
    }
  } catch (error) {
    return result(error?.code === "ELOOP" ? "proof_custody_index_entry_symlink_refused" : "proof_custody_index_entry_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validateEntry(entry, fileHash) {
  if (
    entry?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA ||
    entry.phase !== 193 || !validIso(entry.indexedAt) ||
    !Number.isSafeInteger(entry.sequence) || entry.sequence < 0 ||
    !HASH.test(entry.entrySha256 ?? "") || entry.entrySha256 !== fileHash ||
    entry.custody?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA ||
    !HASH.test(entry.custody?.custodyRecordSha256 ?? "") ||
    !HASH.test(entry.custody?.sourceProofSha256 ?? "") ||
    (entry.previousEntrySha256 !== null && !HASH.test(entry.previousEntrySha256 ?? "")) ||
    (entry.sequence === 0) !== (entry.previousEntrySha256 === null)
  ) return "proof_custody_index_entry_envelope_invalid";
  if (
    entry.privacy?.reviewerIncluded !== false ||
    entry.privacy?.purposeIncluded !== false ||
    entry.privacy?.pseudonymizationKeyIncluded !== false ||
    entry.privacy?.pseudonymsIncluded !== false ||
    entry.privacy?.credentialsIncluded !== false ||
    entry.privacy?.personalDataIncluded !== false
  ) return "proof_custody_index_privacy_contract_invalid";
  if (
    entry.execution?.remoteContacted !== false ||
    entry.execution?.remoteWriteExecuted !== false ||
    entry.execution?.databaseWriteExecuted !== false ||
    entry.execution?.migrationApplied !== false ||
    entry.execution?.buildExecuted !== false ||
    entry.execution?.zipGenerated !== false ||
    entry.execution?.deployExecuted !== false
  ) return "proof_custody_index_execution_contract_invalid";
  const { entrySha256, ...withoutHash } = entry;
  return sha256(serialized(withoutHash)) === entrySha256 ? null : "proof_custody_index_entry_hash_mismatch";
}

function inspectEntry(physical, fileName) {
  if (!FILE.test(fileName ?? "")) return result("proof_custody_index_entry_file_name_invalid");
  const path = resolve(physical, fileName);
  if (!inside(physical, path)) return result("proof_custody_index_entry_path_outside_directory");
  const read = readEntry(path);
  if (!read.ok) return read;
  const fileHash = FILE.exec(basename(path))[1];
  const invalid = validateEntry(read.entry, fileHash);
  return invalid ? result(invalid) : { ok: true, raw: read.raw, entry: read.entry };
}

function success(reason, entry, extra = {}) {
  return {
    ok: true,
    reason,
    indexVerified: true,
    entrySha256: entry.entrySha256,
    entryFileName: `${entry.entrySha256}.json`,
    custodyRecordSha256: entry.custody.custodyRecordSha256,
    sourceProofSha256: entry.custody.sourceProofSha256,
    sequence: entry.sequence,
    previousEntrySha256: entry.previousEntrySha256,
    localIndexEntryWritten: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    databaseWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

export function inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry({
  root = process.cwd(), indexDirectory, entryFileName,
} = {}) {
  if (!FILE.test(entryFileName ?? "")) return result("proof_custody_index_entry_file_name_invalid");
  const target = directory(root, indexDirectory);
  if (!target.ok) return target;
  const inspected = inspectEntry(target.physical, entryFileName);
  return inspected.ok ? success("proof_custody_index_entry_valid", inspected.entry) : inspected;
}

export function appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
  root = process.cwd(),
  custodyDirectory,
  custodyFileName,
  indexDirectory,
  previousEntryFileName = null,
  indexedAt = new Date().toISOString(),
} = {}) {
  if (!validIso(indexedAt)) return result("proof_custody_index_indexed_at_invalid");
  const custody = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
    root, custodyDirectory, custodyFileName,
  });
  if (!custody.ok) return result(custody.reason);
  const target = directory(root, indexDirectory, true);
  if (!target.ok) return target;
  const existingNames = readdirSync(target.physical);
  for (const name of existingNames) {
    const existing = inspectEntry(target.physical, name);
    if (!existing.ok) return existing;
    if (existing.entry.custody.custodyRecordSha256 === custody.custodyRecordSha256) {
      const requestedPrevious = previousEntryFileName === null ? null : FILE.exec(previousEntryFileName ?? "")?.[1];
      if (existing.entry.indexedAt === indexedAt && existing.entry.previousEntrySha256 === requestedPrevious) {
        return success("proof_custody_index_entry_already_exists", existing.entry);
      }
      return result("proof_custody_index_duplicate_custody_refused");
    }
  }
  let sequence = 0;
  let previousEntrySha256 = null;
  if (previousEntryFileName !== null) {
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
      root, custodyDirectory, indexDirectory, headEntryFileName: previousEntryFileName,
    });
    if (!verified.ok) return result("proof_custody_index_previous_head_invalid", { cause: verified.reason });
    sequence = verified.sequence + 1;
    previousEntrySha256 = verified.entrySha256;
  } else if (existingNames.length > 0) {
    return result("proof_custody_index_genesis_requires_empty_directory");
  }
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
    phase: 193,
    sequence,
    indexedAt,
    custody: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA,
      custodyRecordSha256: custody.custodyRecordSha256,
      sourceProofSha256: custody.sourceProofSha256,
    },
    previousEntrySha256,
    privacy: {
      reviewerIncluded: false,
      purposeIncluded: false,
      pseudonymizationKeyIncluded: false,
      pseudonymsIncluded: false,
      credentialsIncluded: false,
      personalDataIncluded: false,
    },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const entry = { ...withoutHash, entrySha256: sha256(serialized(withoutHash)) };
  const content = serialized(entry);
  const path = resolve(target.physical, `${entry.entrySha256}.json`);
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("proof_custody_index_entry_appended", entry, { localIndexEntryWritten: true });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("proof_custody_index_entry_write_failed");
    const existing = readEntry(path);
    if (!existing.ok || existing.raw !== content) return result("proof_custody_index_entry_collision_refused");
    return success("proof_custody_index_entry_already_exists", entry);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
  root = process.cwd(), custodyDirectory, indexDirectory, headEntryFileName, maxEntries = MAX_ENTRIES,
} = {}) {
  if (!FILE.test(headEntryFileName ?? "")) return result("proof_custody_index_head_file_name_invalid");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ENTRIES) {
    return result("proof_custody_index_max_entries_invalid");
  }
  const target = directory(root, indexDirectory);
  if (!target.ok) return target;
  const files = readdirSync(target.physical, { withFileTypes: true });
  if (files.length > maxEntries) return result("proof_custody_index_entry_limit_exceeded");
  if (files.some((item) => !item.isFile() || !FILE.test(item.name))) {
    return result("proof_custody_index_unexpected_directory_entry");
  }
  const visited = new Set();
  const custodyHashes = new Set();
  const entryHashes = [];
  const custodyRecordHashes = [];
  let currentFileName = headEntryFileName;
  let expectedSequence = null;
  let head;
  while (currentFileName !== null) {
    if (visited.has(currentFileName)) return result("proof_custody_index_cycle_detected");
    const current = inspectEntry(target.physical, currentFileName);
    if (!current.ok) return current;
    head ??= current.entry;
    if (expectedSequence !== null && current.entry.sequence !== expectedSequence) {
      return result("proof_custody_index_sequence_discontinuity");
    }
    const custodyHash = current.entry.custody.custodyRecordSha256;
    if (custodyHashes.has(custodyHash)) return result("proof_custody_index_duplicate_custody_detected");
    const custody = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
      root, custodyDirectory, custodyFileName: `${custodyHash}.json`,
    });
    if (!custody.ok) return result("proof_custody_index_custody_invalid", { cause: custody.reason });
    if (custody.sourceProofSha256 !== current.entry.custody.sourceProofSha256) {
      return result("proof_custody_index_source_proof_mismatch");
    }
    visited.add(currentFileName);
    custodyHashes.add(custodyHash);
    entryHashes.push(current.entry.entrySha256);
    custodyRecordHashes.push(custodyHash);
    expectedSequence = current.entry.sequence - 1;
    currentFileName = current.entry.previousEntrySha256 === null
      ? null
      : `${current.entry.previousEntrySha256}.json`;
  }
  if (expectedSequence !== -1) return result("proof_custody_index_genesis_missing");
  if (visited.size !== files.length) return result("proof_custody_index_orphan_entry_detected");
  const indexSummary = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
    headEntrySha256: head.entrySha256,
    genesisEntrySha256: entryHashes.at(-1),
    entryCount: visited.size,
    entryHashes,
    custodyRecordHashes,
  };
  return success("proof_custody_index_verified", head, {
    ...indexSummary,
    indexDigestSha256: sha256(serialized(indexSummary)),
  });
}
