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
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA,
  inspectNamedRemoteCaptureReceiptLedgerCheckpoint,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain.v1";

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
    chainVerified: false,
    localChainEntryWritten: false,
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
  if (!requested) return result("checkpoint_chain_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("checkpoint_chain_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("checkpoint_chain_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("checkpoint_chain_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("checkpoint_chain_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("checkpoint_chain_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("checkpoint_chain_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("checkpoint_chain_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("checkpoint_chain_directory_unreadable");
  }
}

function readEntry(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("checkpoint_chain_entry_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("checkpoint_chain_entry_mode_invalid");
    if (stat.size > MAX_BYTES) return result("checkpoint_chain_entry_too_large");
    const raw = readFileSync(fd, "utf8");
    try {
      return { ok: true, raw, entry: JSON.parse(raw) };
    } catch {
      return result("checkpoint_chain_entry_json_invalid");
    }
  } catch (error) {
    return result(error?.code === "ELOOP" ? "checkpoint_chain_entry_symlink_refused" : "checkpoint_chain_entry_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validateEntry(entry, fileHash) {
  if (
    entry?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA ||
    entry.phase !== 190 || !validIso(entry.recordedAt) ||
    !Number.isSafeInteger(entry.sequence) || entry.sequence < 0 ||
    !HASH.test(entry.entrySha256 ?? "") || entry.entrySha256 !== fileHash ||
    !HASH.test(entry.checkpoint?.checkpointSha256 ?? "") ||
    entry.checkpoint?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA ||
    (entry.previousEntrySha256 !== null && !HASH.test(entry.previousEntrySha256 ?? "")) ||
    (entry.sequence === 0) !== (entry.previousEntrySha256 === null)
  ) return "checkpoint_chain_entry_envelope_invalid";
  if (
    entry.privacy?.checkpointPayloadIncluded !== false ||
    entry.privacy?.credentialsIncluded !== false ||
    entry.privacy?.personalDataIncluded !== false
  ) return "checkpoint_chain_privacy_contract_invalid";
  if (
    entry.execution?.remoteContacted !== false ||
    entry.execution?.remoteWriteExecuted !== false ||
    entry.execution?.databaseWriteExecuted !== false ||
    entry.execution?.migrationApplied !== false ||
    entry.execution?.buildExecuted !== false ||
    entry.execution?.zipGenerated !== false ||
    entry.execution?.deployExecuted !== false
  ) {
    return "checkpoint_chain_execution_contract_invalid";
  }
  const { entrySha256, ...withoutHash } = entry;
  return sha256(serialized(withoutHash)) === entrySha256 ? null : "checkpoint_chain_entry_hash_mismatch";
}

function inspectEntry(physical, fileName) {
  if (!FILE.test(fileName ?? "")) return result("checkpoint_chain_entry_file_name_invalid");
  const path = resolve(physical, fileName);
  if (!inside(physical, path)) return result("checkpoint_chain_entry_path_outside_directory");
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
    chainVerified: true,
    entrySha256: entry.entrySha256,
    entryFileName: `${entry.entrySha256}.json`,
    checkpointSha256: entry.checkpoint.checkpointSha256,
    sequence: entry.sequence,
    previousEntrySha256: entry.previousEntrySha256,
    localChainEntryWritten: false,
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

export function appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
  root = process.cwd(),
  checkpointDirectory,
  checkpointFileName,
  chainDirectory,
  previousEntryFileName = null,
  recordedAt = new Date().toISOString(),
} = {}) {
  if (!validIso(recordedAt)) return result("checkpoint_chain_recorded_at_invalid");
  const checkpoint = inspectNamedRemoteCaptureReceiptLedgerCheckpoint({ root, checkpointDirectory, checkpointFileName });
  if (!checkpoint.ok) return result(checkpoint.reason);
  const target = directory(root, chainDirectory, true);
  if (!target.ok) return target;
  const existingNames = readdirSync(target.physical);
  let sequence = 0;
  let previousEntrySha256 = null;
  if (previousEntryFileName !== null) {
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain({
      root,
      checkpointDirectory,
      chainDirectory,
      headEntryFileName: previousEntryFileName,
    });
    if (!verified.ok) return result("checkpoint_chain_previous_head_invalid", { cause: verified.reason });
    const previous = inspectEntry(target.physical, previousEntryFileName);
    if (!previous.ok) return previous;
    sequence = previous.entry.sequence + 1;
    previousEntrySha256 = previous.entry.entrySha256;
  }
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA,
    phase: 190,
    sequence,
    recordedAt,
    checkpoint: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA,
      checkpointSha256: checkpoint.checkpointSha256,
    },
    previousEntrySha256,
    privacy: { checkpointPayloadIncluded: false, credentialsIncluded: false, personalDataIncluded: false },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const entry = { ...withoutHash, entrySha256: sha256(serialized(withoutHash)) };
  const content = serialized(entry);
  const path = resolve(target.physical, `${entry.entrySha256}.json`);
  if (
    previousEntryFileName === null &&
    existingNames.some((name) => name !== `${entry.entrySha256}.json`)
  ) return result("checkpoint_chain_genesis_requires_empty_directory");
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("checkpoint_chain_entry_appended", entry, { localChainEntryWritten: true });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("checkpoint_chain_entry_write_failed");
    const existing = readEntry(path);
    if (!existing.ok || existing.raw !== content) return result("checkpoint_chain_entry_collision_refused");
    return success("checkpoint_chain_entry_already_exists", entry);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChain({
  root = process.cwd(),
  checkpointDirectory,
  chainDirectory,
  headEntryFileName,
  maxEntries = MAX_ENTRIES,
} = {}) {
  if (!FILE.test(headEntryFileName ?? "")) return result("checkpoint_chain_head_file_name_invalid");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ENTRIES) {
    return result("checkpoint_chain_max_entries_invalid");
  }
  const target = directory(root, chainDirectory);
  if (!target.ok) return target;
  const files = readdirSync(target.physical, { withFileTypes: true });
  if (files.length > maxEntries) return result("checkpoint_chain_entry_limit_exceeded");
  if (files.some((item) => !item.isFile() || !FILE.test(item.name))) {
    return result("checkpoint_chain_unexpected_directory_entry");
  }
  const visited = new Set();
  const entryHashes = [];
  const checkpointHashes = [];
  let currentFileName = headEntryFileName;
  let expectedSequence = null;
  let head;
  while (currentFileName !== null) {
    if (visited.has(currentFileName)) return result("checkpoint_chain_cycle_detected");
    const current = inspectEntry(target.physical, currentFileName);
    if (!current.ok) return current;
    head ??= current.entry;
    if (expectedSequence !== null && current.entry.sequence !== expectedSequence) {
      return result("checkpoint_chain_sequence_discontinuity");
    }
    const checkpointFileName = `${current.entry.checkpoint.checkpointSha256}.json`;
    const checkpoint = inspectNamedRemoteCaptureReceiptLedgerCheckpoint({
      root, checkpointDirectory, checkpointFileName,
    });
    if (!checkpoint.ok) return result("checkpoint_chain_checkpoint_invalid", { cause: checkpoint.reason });
    visited.add(currentFileName);
    entryHashes.push(current.entry.entrySha256);
    checkpointHashes.push(current.entry.checkpoint.checkpointSha256);
    expectedSequence = current.entry.sequence - 1;
    currentFileName = current.entry.previousEntrySha256 === null
      ? null
      : `${current.entry.previousEntrySha256}.json`;
  }
  if (expectedSequence !== -1) return result("checkpoint_chain_genesis_missing");
  if (visited.size !== files.length) return result("checkpoint_chain_orphan_entry_detected");
  const chainSummary = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA,
    headEntrySha256: head.entrySha256,
    genesisEntrySha256: entryHashes.at(-1),
    entryCount: visited.size,
    entryHashes,
    checkpointHashes,
  };
  return success("checkpoint_chain_verified", head, {
    ...chainSummary,
    chainDigestSha256: sha256(serialized(chainSummary)),
  });
}
